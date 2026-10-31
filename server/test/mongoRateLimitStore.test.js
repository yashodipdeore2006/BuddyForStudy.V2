import test from "node:test";
import assert from "node:assert/strict";
import { MongoRateLimitStore } from "../src/config/mongoRateLimitStore.js";

function fakeModel() {
  const records = new Map();
  return {
    records,
    async findOneAndUpdate(filter, update, options = {}) {
      let record = records.get(filter.key);
      if (!record && !options.upsert) return null;
      if (!record) {
        record = { key: filter.key, hits: 0, expiresAt: update.$setOnInsert?.expiresAt };
        records.set(filter.key, record);
      }
      record.hits += update.$inc?.hits || 0;
      return { ...record };
    },
    async updateOne(filter, update) {
      const record = records.get(filter.key);
      if (record && (filter.hits?.$gt === undefined || record.hits > filter.hits.$gt)) {
        record.hits += update.$inc?.hits || 0;
      }
    },
    async deleteOne(filter) { records.delete(filter.key); },
    findOne(filter) {
      return { lean: async () => records.get(filter.key) || null };
    },
  };
}

test("Mongo rate-limit store shares namespaced counters and returns reset time", async () => {
  const model = fakeModel();
  const store = new MongoRateLimitStore("auth", { model, now: () => 120_000 });
  store.init({ windowMs: 60_000 });

  const first = await store.increment("203.0.113.4");
  const second = await store.increment("203.0.113.4");
  assert.equal(first.totalHits, 1);
  assert.equal(second.totalHits, 2);
  assert.equal(second.resetTime.toISOString(), new Date(180_000).toISOString());
  assert.equal((await store.get("203.0.113.4")).totalHits, 2);
  assert.equal(model.records.size, 1);
});

test("Mongo rate-limit store isolates namespaces and resets at a fixed-window boundary", async () => {
  const model = fakeModel();
  let now = 59_999;
  const auth = new MongoRateLimitStore("auth", { model, now: () => now });
  const payments = new MongoRateLimitStore("payments", { model, now: () => now });
  auth.init({ windowMs: 60_000 });
  payments.init({ windowMs: 60_000 });

  await auth.increment("client");
  await payments.increment("client");
  assert.equal(model.records.size, 2);
  now = 60_000;
  assert.equal(await auth.get("client"), undefined);
  assert.equal((await auth.increment("client")).totalHits, 1);
  assert.equal(model.records.size, 3);
});

test("Mongo rate-limit store decrements and resets only the current client window", async () => {
  const model = fakeModel();
  const store = new MongoRateLimitStore("api", { model, now: () => 120_000 });
  store.init({ windowMs: 60_000 });
  await store.increment("client");
  await store.increment("client");
  await store.decrement("client");
  assert.equal((await store.get("client")).totalHits, 1);
  await store.resetKey("client");
  assert.equal(await store.get("client"), undefined);
});

test("Mongo rate-limit store validates namespace and window configuration", () => {
  assert.throws(() => new MongoRateLimitStore(""), /namespace/);
  const store = new MongoRateLimitStore("api", { model: fakeModel() });
  assert.throws(() => store.init({ windowMs: 0 }), /window/);
});

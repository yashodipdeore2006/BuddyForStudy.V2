import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { ApiRateLimit } from "../src/models/ApiRateLimit.js";
import { MongoRateLimitStore } from "../src/config/mongoRateLimitStore.js";

const namespace = "integration-" + process.pid;
const clientKey = "shared-client";
const storeA = new MongoRateLimitStore(namespace, { model: ApiRateLimit });
const storeB = new MongoRateLimitStore(namespace, { model: ApiRateLimit });
storeA.init({ windowMs: 60_000 });
storeB.init({ windowMs: 60_000 });

before(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required for the shared rate-limit integration test.");
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGO_URI);
  await ApiRateLimit.init();
});

after(async () => {
  await ApiRateLimit.deleteMany({ key: new RegExp("^" + namespace + ":") });
  await mongoose.disconnect();
});

test("separate API instances share a single atomic rate-limit counter", async () => {
  const results = await Promise.all(Array.from({ length: 24 }, (_unused, index) =>
    (index % 2 ? storeA : storeB).increment(clientKey),
  ));
  assert.equal(Math.max(...results.map((item) => item.totalHits)), 24);
  assert.equal((await storeA.get(clientKey)).totalHits, 24);
});

import test, { after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/db.js";
import { RoadmapAdmissionLease } from "../src/models/RoadmapAdmissionLease.js";
import { RoadmapAdmissionRateWindow } from "../src/models/RoadmapAdmissionRateWindow.js";
import { ApiRateLimit } from "../src/models/ApiRateLimit.js";
import { AdminInvitation } from "../src/models/AdminInvitation.js";
import { RoadmapTemplate } from "../src/models/RoadmapTemplate.js";

const models = [
  { model: RoadmapAdmissionLease, required: {
    roadmap_admission_global_slot_unique: { key: { globalSlot: 1 }, unique: true },
    roadmap_admission_user_slot_unique: { key: { userId: 1, userSlot: 1 }, unique: true },
    roadmap_admission_draft_unique: { key: { draftId: 1 }, unique: true },
    roadmap_admission_expiry_lookup: { key: { expiresAt: 1 }, unique: false },
  } },
  { model: RoadmapAdmissionRateWindow, required: {
    roadmap_admission_rate_user_window_unique: { key: { userId: 1, windowStart: 1 }, unique: true },
    roadmap_admission_rate_window_ttl: { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  } },
  { model: ApiRateLimit, required: {
    key_1: { key: { key: 1 }, unique: true },
    expiresAt_1: { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  } },
];

function indexSnapshot(indexes) {
  return indexes
    .map((index) => ({
      name: index.name,
      key: index.key,
      unique: index.unique === true,
      expireAfterSeconds: index.expireAfterSeconds ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

test("TTL expiry fields declare exactly one expiresAt index", () => {
  for (const model of [AdminInvitation, RoadmapTemplate]) {
    const expiryIndexes = model.schema.indexes().filter(([keys]) => (
      Object.keys(keys).length === 1 && keys.expiresAt === 1
    ));
    assert.equal(expiryIndexes.length, 1, model.modelName + " must declare one expiresAt index");
    assert.equal(expiryIndexes[0][1].expireAfterSeconds, 0,
      model.modelName + " must retain its immediate TTL expiry policy");
  }
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await disconnectDatabase();
});

test("database startup creates required unique and TTL indexes idempotently", { timeout: 60_000 }, async () => {
  assert.ok(process.env.MONGO_URI, "MONGO_URI must be configured for the MongoDB integration test");
  await connectDatabase();

  const firstSnapshots = await Promise.all(models.map(async ({ model }) => (
    indexSnapshot(await model.collection.indexes())
  )));

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const { required } = models[modelIndex];
    const actual = new Map(firstSnapshots[modelIndex].map((index) => [index.name, index]));
    for (const [name, expected] of Object.entries(required)) {
      const found = actual.get(name);
      assert.ok(found, modelIndex + ": missing required index " + name);
      assert.deepEqual(found.key, expected.key, name + " must have the expected key order");
      if (expected.unique !== undefined) assert.equal(found.unique, expected.unique, name + " unique constraint");
      if (expected.expireAfterSeconds !== undefined) {
        assert.equal(found.expireAfterSeconds, expected.expireAfterSeconds, name + " TTL policy");
      }
    }
  }

  // Exercise the same connection/index initialization path used during API startup.
  await connectDatabase();
  const secondSnapshots = await Promise.all(models.map(async ({ model }) => (
    indexSnapshot(await model.collection.indexes())
  )));

  assert.deepEqual(secondSnapshots, firstSnapshots,
    "re-running database initialization must not change existing index definitions");
});

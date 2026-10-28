import test from "node:test";
import assert from "node:assert/strict";
import { persistCurationFeedback } from "../src/services/curationFeedback.service.js";
import { CourseCurationFeedback } from "../src/models/CourseCurationFeedback.js";

test("repeated feedback submission IDs return one persisted record without overwriting the first payload", async () => {
  const records = new Map();
  let upserts = 0;
  const model = {
    async findOneAndUpdate(filter, update) {
      upserts += 1;
      if (!records.has(filter.submissionId)) {
        records.set(filter.submissionId, { _id: "feedback-1", ...update.$setOnInsert });
      }
      return records.get(filter.submissionId);
    },
    async findOne(filter) {
      return records.get(filter.submissionId) || null;
    },
    async create(payload) {
      const record = { _id: "legacy-feedback", ...payload };
      records.set(record._id, record);
      return record;
    }
  };

  const first = await persistCurationFeedback({
    model,
    submissionId: "stable-feedback-submission-001",
    payload: { event: "helpful", resourceId: "video-1" }
  });
  const retry = await persistCurationFeedback({
    model,
    submissionId: "stable-feedback-submission-001",
    payload: { event: "outdated", resourceId: "video-1" }
  });

  assert.equal(first._id, retry._id);
  assert.equal(retry.event, "helpful");
  assert.equal(records.size, 1);
  assert.equal(upserts, 2);
});

test("a concurrent duplicate-key race reads and returns the already persisted feedback", async () => {
  const existing = { _id: "feedback-existing", event: "helpful" };
  let reads = 0;
  const model = {
    async findOneAndUpdate() { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
    async findOne(filter) {
      reads += 1;
      assert.equal(filter.submissionId, "stable-feedback-submission-002");
      return existing;
    },
    async create() { assert.fail("idempotent writes should not fall back to create"); }
  };

  const result = await persistCurationFeedback({
    model,
    submissionId: "stable-feedback-submission-002",
    payload: { event: "helpful" }
  });
  assert.equal(result, existing);
  assert.equal(reads, 1);
});

test("legacy feedback without a submission ID keeps the create path", async () => {
  const expected = { _id: "legacy-feedback", event: "helpful" };
  const model = {
    async create(payload) {
      assert.deepEqual(payload, { event: "helpful" });
      return expected;
    },
    async findOneAndUpdate() { assert.fail("should not upsert without an idempotency key"); }
  };
  assert.equal(await persistCurationFeedback({ model, payload: { event: "helpful" } }), expected);
});

test("feedback model enforces unique sparse submission IDs", () => {
  const indexes = CourseCurationFeedback.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.submissionId === 1 && options.unique === true && options.sparse === true
  ));
});

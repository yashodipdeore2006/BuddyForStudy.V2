import test from "node:test";
import assert from "node:assert/strict";
import { finalizeDraft } from "../src/controllers/asyncRoadmap.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

test("failed async roadmap finalization returns a safe retryable response scoped to the owner", async () => {
  const draftId = "550e8400-e29b-41d4-a716-446655440000";
  const userId = "507f1f77bcf86cd799439011";
  const draft = { draftId, userId, status: "failed", errorCode: "QUOTA_EXHAUSTED", events: [] };
  const res = makeResponse();
  let readOwner;
  let waitArgs;
  await finalizeDraft({
    user: { userId },
    body: { draftId }
  }, res, (error) => { throw error; }, {
    authorize: async () => true,
    getDraftForUser: async (actualDraftId, actualUserId) => {
      assert.equal(actualDraftId, draftId);
      readOwner = actualUserId;
      return draft;
    },
    waitForDraft: async (...args) => {
      waitArgs = args;
      return draft;
    }
  });

  assert.equal(readOwner, userId);
  assert.deepEqual(waitArgs, [draftId, userId, 2000]);
  assert.equal(res.result.statusCode, 502);
  assert.equal(res.result.body.success, false);
  assert.equal(res.result.body.message, "Roadmap build failed. Please retry.");
  assert.deepEqual(res.result.body.errors, { draftId, retryable: true });
  assert.equal(JSON.stringify(res.result.body).includes("QUOTA_EXHAUSTED"), false);
});

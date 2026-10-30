import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDraft, finalizeDraft } from "../src/controllers/asyncRoadmap.controller.js";

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

test("roadmap draft controller returns safe 429/503 responses for capacity limits", async () => {
  const request = {
    user: { userId: "507f191e810c19729de860ea" },
    body: { topic: "React", goal: "learn", level: "Beginner" }
  };
  for (const expected of [
    { code: "ROADMAP_USER_QUEUE_LIMIT", status: 429, message: "You already have the maximum number of active roadmap builds." },
    { code: "ROADMAP_QUEUE_FULL", status: 503, message: "Roadmap build capacity is temporarily full. Please retry shortly." }
  ]) {
    const res = makeResponse();
    await createDraft(request, res, (error) => { throw error; }, {
      authorize: async () => true,
      createRoadmapDraft: async () => { throw Object.assign(new Error(expected.message), { code: expected.code, status: expected.status }); }
    });
    assert.equal(res.result.statusCode, expected.status);
    assert.equal(res.result.body.message, expected.message);
    assert.deepEqual(res.result.body.errors, { code: expected.code, retryable: true });
  }
});


test("async roadmap draft route applies authentication, entitlements, then a per-user rate limiter", async () => {
  const routes = await readFile(new URL("../src/routes/ai.routes.js", import.meta.url), "utf8");
  const limiters = await readFile(new URL("../src/config/rateLimiters.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/roadmap\/draft",\s*authMiddleware,\s*requireFeature\("ai_course_builder"\),\s*requireFeature\("personalized_roadmaps"\),\s*aiRoadmapDraftLimiter,\s*asyncRoadmap\.createDraft\)/);
  assert.match(routes, /router\.post\("\/roadmap",\s*authMiddleware,\s*requireFeature\("ai_course_builder"\),\s*requireFeature\("personalized_roadmaps"\),\s*aiRoadmapDraftLimiter,\s*generateRoadmap\)/);
  assert.match(limiters, /aiRoadmapDraftLimiter\s*=\s*rateLimit\(\{[\s\S]*?windowMs:\s*10\s*\*\s*60\s*\*\s*1000,[\s\S]*?max:\s*5,[\s\S]*?standardHeaders:\s*true,[\s\S]*?legacyHeaders:\s*false,[\s\S]*?keyGenerator:\s*\(req\)\s*=>\s*String\(req\.user\?\.userId/);
});


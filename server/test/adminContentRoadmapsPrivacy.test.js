import test from "node:test";
import assert from "node:assert/strict";
import { LearningRoadmap } from "../src/models/LearningRoadmap.js";
import { contentRoadmaps } from "../src/controllers/adminPro.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); }
  finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

test("admin roadmap listing is paginated and does not query learner email or quiz-response fields", async () => {
  const calls = { populate: [], select: "", findFilter: null, countFilter: null, skip: null, limit: null };
  const query = {
    populate(path, fields) { calls.populate.push({ path, fields }); return this; },
    select(fields) { calls.select = fields; return this; },
    sort() { return this; },
    skip(value) { calls.skip = value; return this; },
    limit(value) { calls.limit = value; return this; },
    lean: async () => [{
      _id: "roadmap-1",
      user: { _id: "learner-1", name: "Learner One" },
      query: "Node.js backend",
      canonicalTopic: "Node.js backend",
      level: "Beginner",
      status: "active",
      lessons: [{ lessonId: "lesson-1", title: "Intro" }]
    }]
  };
  const res = responseRecorder();

  await withMocks([
    [LearningRoadmap, {
      find: (filter) => { calls.findFilter = filter; return query; },
      countDocuments: async (filter) => { calls.countFilter = filter; return 26; }
    }]
  ], async () => {
    await contentRoadmaps({ query: { status: "active", page: "2", limit: "25" } }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.findFilter, { status: "active" });
  assert.deepEqual(calls.countFilter, { status: "active" });
  assert.deepEqual(calls.populate, [{ path: "user", fields: "name" }]);
  assert.ok(!calls.select.split(" ").includes("email"), "list projection must not request learner email");
  assert.ok(!["quizAttempts", "adaptiveState", "course.modules"].some((field) => calls.select.includes(field)), "list projection must not request quiz responses or adaptive profile");
  assert.equal(calls.skip, 25);
  assert.equal(calls.limit, 25);
  assert.equal(res.body.data?.roadmaps?.length ?? res.body.roadmaps?.length, 1);
  assert.equal(res.body.data?.total ?? res.body.total, 26);
});

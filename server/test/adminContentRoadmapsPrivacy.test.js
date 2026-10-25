import test from "node:test";
import assert from "node:assert/strict";
import { LearningRoadmap } from "../src/models/LearningRoadmap.js";
import { User } from "../src/models/User.js";
import { Course } from "../src/models/Course.js";
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

test("admin roadmap inventory unions saved plans with AI-generated course records without exposing learner PII", async () => {
  let aggregatePipeline;
  const res = responseRecorder();
  const row = {
    _id: "roadmap-1",
    source: "saved",
    title: "Node.js backend",
    user: { name: "Learner One" },
    query: "Node.js backend",
    canonicalTopic: "Node.js backend",
    level: "Beginner",
    status: "active",
    lessonCount: 13,
    createdAt: new Date("2026-10-07T05:41:51.000Z"),
    updatedAt: new Date("2026-10-07T09:01:20.000Z")
  };

  await withMocks([
    [LearningRoadmap, {
      aggregate: async (pipeline) => {
        aggregatePipeline = pipeline;
        return [{ metadata: [{ total: 26 }], records: [row] }];
      }
    }]
  ], async () => {
    await contentRoadmaps({ query: { status: "active", page: "2", limit: "25", q: "Learner One" } }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(aggregatePipeline));
  assert.deepEqual(aggregatePipeline[0].$match, { status: "active" });
  const union = aggregatePipeline.find((stage) => stage.$unionWith)?.$unionWith;
  assert.equal(union.coll, Course.collection.name);
  assert.equal(union.pipeline[0].$match.$expr.$eq[0], 1, "completed/active filter should not include generated courses");
  assert.equal(aggregatePipeline.at(-1).$facet.records[0].$skip, 25);
  assert.equal(aggregatePipeline.at(-1).$facet.records[1].$limit, 25);
  assert.ok(aggregatePipeline.some((stage) => stage.$lookup?.from === User.collection.name));
  assert.ok(aggregatePipeline.some((stage) => stage.$project?.source?.$literal === "saved"));
  assert.ok(aggregatePipeline.some((stage) => stage.$match?.$or?.some((filter) => filter["owner.name"] instanceof RegExp && filter["owner.name"].test("Learner One"))));
  assert.ok(union.pipeline.some((stage) => stage.$match?.$or?.some((filter) => filter["owner.name"] instanceof RegExp && filter["owner.name"].test("Learner One"))));
  assert.ok(union.pipeline.some((stage) => stage.$project?.source?.$literal === "generated"));
  assert.equal(res.body.roadmaps.length, 1);
  assert.equal(res.body.total, 26);
  assert.equal(res.body.roadmaps[0].lessonCount, 13);
  assert.equal(res.body.roadmaps[0].user.email, undefined);
});

test("admin roadmap inventory rejects unknown status filters", async () => {
  const res = responseRecorder();
  let queried = false;
  await withMocks([
    [LearningRoadmap, { aggregate: async () => { queried = true; return []; } }]
  ], async () => {
    await contentRoadmaps({ query: { status: "pending" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(queried, false);
});

test("published filter returns only published AI-generated courses, not saved-plan records", async () => {
  let aggregatePipeline;
  const res = responseRecorder();
  await withMocks([
    [LearningRoadmap, {
      aggregate: async (pipeline) => {
        aggregatePipeline = pipeline;
        return [{ metadata: [{ total: 3 }], records: [] }];
      }
    }]
  ], async () => {
    await contentRoadmaps({ query: { status: "published", page: "1", limit: "25" } }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(aggregatePipeline[0].$match, { $expr: { $eq: [1, 0] } });
  const union = aggregatePipeline.find((stage) => stage.$unionWith)?.$unionWith;
  assert.deepEqual(union.pipeline[0].$match, {
    "generation.mode": "ai",
    deletedAt: null,
    isPublished: true
  });
  assert.equal(res.body.total, 3);
});

test("saved roadmap detail returns an ordered outline without selecting quizzes or learner answers", async () => {
  const { contentRoadmapDetail } = await import("../src/controllers/adminPro.controller.js");
  const res = responseRecorder();
  const calls = { projection: "", populated: [] };
  const record = {
    _id: "507f1f77bcf86cd799439011",
    user: { _id: "507f191e810c19729de860ea", name: "Learner One", email: "private@example.com" },
    query: "Node.js",
    canonicalTopic: "Node.js",
    level: "Beginner",
    status: "active",
    lessons: [
      { lessonId: "l2", title: "Routes", type: "tutorial", moduleTitle: "Express", order: 2 },
      { lessonId: "l1", title: "Setup", type: "tutorial", moduleTitle: "Express", order: 1 }
    ],
    quizAttempts: [{ answers: [1, 2] }]
  };
  const query = {
    select(fields) { calls.projection = fields; return this; },
    populate(path, fields) { calls.populated.push({ path, fields }); return this; },
    lean: async () => record
  };
  await withMocks([
    [LearningRoadmap, { findById: () => query }]
  ], async () => {
    await contentRoadmapDetail({ params: { source: "saved", roadmapId: record._id } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.ok(calls.projection.includes("lessons"));
  assert.ok(!calls.projection.includes("quizAttempts"));
  assert.deepEqual(calls.populated, [{ path: "user", fields: "name" }]);
  assert.deepEqual(res.body.roadmap.modules[0].lessons.map((lesson) => lesson.title), ["Setup", "Routes"]);
  assert.equal(res.body.roadmap.user.email, undefined);
  assert.equal(res.body.roadmap.quizAttempts, undefined);
});

test("generated roadmap detail projects only safe lesson-outline fields", async () => {
  const { contentRoadmapDetail } = await import("../src/controllers/adminPro.controller.js");
  const res = responseRecorder();
  let pipeline;
  const id = "507f1f77bcf86cd799439011";
  const record = {
    _id: id, title: "AI roadmap", description: "Description", level: "Beginner", status: "draft",
    user: { name: "Learner One", email: "private@example.com" },
    modules: [{ title: "Module 1", order: 1, lessons: [{ title: "Lesson 1", order: 1, type: "tutorial" }] }]
  };
  await withMocks([
    [Course, { aggregate: async (value) => { pipeline = value; return [record]; } }]
  ], async () => {
    await contentRoadmapDetail({ params: { source: "generated", roadmapId: id } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.ok(pipeline.some((stage) => stage.$project?.modules?.$map), "detail query must explicitly project the outline");
  const projectStage = pipeline.find((stage) => stage.$project?.modules?.$map).$project;
  const lessonProjection = projectStage.modules.$map.in.lessons.$map.in;
  assert.deepEqual(Object.keys(lessonProjection).sort(), ["buildState", "description", "order", "title", "type"].sort());
  assert.equal(res.body.roadmap.lessonCount, 1);
  assert.equal(res.body.roadmap.user.email, undefined);
});

test("roadmap detail validates source and record ID before querying", async () => {
  const { contentRoadmapDetail } = await import("../src/controllers/adminPro.controller.js");
  for (const params of [
    { source: "other", roadmapId: "507f1f77bcf86cd799439011" },
    { source: "saved", roadmapId: "not-an-id" }
  ]) {
    const res = responseRecorder();
    let queried = false;
    await withMocks([
      [LearningRoadmap, { findById: () => { queried = true; throw new Error("must not query"); } }],
      [Course, { aggregate: async () => { queried = true; return []; } }]
    ], async () => {
      await contentRoadmapDetail({ params }, res, (error) => { throw error; });
    });
    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  }
});

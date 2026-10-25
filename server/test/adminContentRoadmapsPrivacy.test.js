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
    await contentRoadmaps({ query: { status: "active", page: "2", limit: "25" } }, res, (error) => { throw error; });
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

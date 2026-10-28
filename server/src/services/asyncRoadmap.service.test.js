import test from "node:test";
import assert from "node:assert/strict";
import { createRoadmapDraft, stableProfileKey } from "./asyncRoadmap.service.js";
import { RoadmapDraft } from "../models/RoadmapDraft.js";

test("async roadmap idempotency key is stable for the same user and profile", () => {
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  assert.equal(stableProfileKey("user-1", profile), stableProfileKey("user-1", profile));
});

test("async roadmap idempotency key isolates users and profile changes", () => {
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  const original = stableProfileKey("user-1", profile);
  assert.notEqual(original, stableProfileKey("user-2", profile));
  assert.notEqual(original, stableProfileKey("user-1", { ...profile, level: "Advanced" }));
});

test("duplicate async roadmap request reuses the recent draft instead of enqueueing another build", async () => {
  const userId = "507f191e810c19729de860ea";
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  const recent = { draftId: "draft-existing", status: "building" };
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  let createCalls = 0;
  let capturedFilter;
  let capturedSort;

  RoadmapDraft.findOne = (filter) => {
    capturedFilter = filter;
    return {
      sort: async (sort) => {
        capturedSort = sort;
        return recent;
      }
    };
  };
  RoadmapDraft.create = async () => {
    createCalls += 1;
    throw new Error("A duplicate request must not create another draft");
  };

  try {
    const result = await createRoadmapDraft({ userId, profile });
    assert.deepEqual(result, { draftId: "draft-existing", status: "building", reused: true });
    assert.equal(capturedFilter.userId, userId);
    assert.equal(capturedFilter.idempotencyKey, stableProfileKey(userId, profile));
    assert.ok(capturedFilter.createdAt.$gt instanceof Date);
    assert.deepEqual(capturedSort, { createdAt: -1 });
    assert.equal(createCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
  }
});

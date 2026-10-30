import test from "node:test";
import assert from "node:assert/strict";
import { createRoadmapDraft, stableProfileKey, getDraftForUser, getRoadmapPoll, attachDraftEvents } from "./asyncRoadmap.service.js";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { Course } from "../models/Course.js";

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

test("draft reads are strictly owner-scoped, including admin identities", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  let capturedFilter;
  RoadmapDraft.findOne = (filter) => {
    capturedFilter = filter;
    return { lean: async () => null };
  };
  try {
    const result = await getDraftForUser("draft-private", "507f191e810c19729de860ea");
    assert.equal(result, null);
    assert.deepEqual(capturedFilter, { draftId: "draft-private", userId: "507f191e810c19729de860ea" });
    const adminAttempt = await getDraftForUser("draft-private", "507f191e810c19729de860eb");
    assert.equal(adminAttempt, null);
    assert.equal(capturedFilter.userId, "507f191e810c19729de860eb");
  } finally {
    RoadmapDraft.findOne = originalFindOne;
  }
});

test("roadmap polling scopes both draft and private course lookups to the owner", async () => {
  const originalDraftFindOne = RoadmapDraft.findOne;
  const originalCourseFindOne = Course.findOne;
  const ownerId = "507f191e810c19729de860ea";
  const draft = {
    draftId: "draft-owned", userId: ownerId, status: "ready",
    roadmapId: "507f191e810c19729de860ef",
    result: { course: { title: "Private roadmap", modules: [] } }, events: []
  };
  let courseFilter;
  RoadmapDraft.findOne = (filter) => ({ lean: async () => filter.userId === ownerId ? draft : null });
  Course.findOne = (filter) => {
    courseFilter = filter;
    return { lean: async () => ({ _id: draft.roadmapId, modules: [] }) };
  };
  try {
    const ownerPoll = await getRoadmapPoll("draft-owned", ownerId);
    assert.equal(ownerPoll.status, "ready");
    assert.equal(courseFilter.createdForUser, ownerId);
    assert.equal(courseFilter._id, draft.roadmapId);
    const adminPoll = await getRoadmapPoll("draft-owned", "507f191e810c19729de860eb");
    assert.equal(adminPoll, null);
  } finally {
    RoadmapDraft.findOne = originalDraftFindOne;
    Course.findOne = originalCourseFindOne;
  }
});

test("event streams refuse non-owner and admin access before writing headers", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  let headerWrites = 0;
  RoadmapDraft.findOne = (filter) => ({
    lean: async () => filter.userId === "owner-user" ? { draftId: "draft-owned", events: [] } : null
  });
  let cleanup;
  const req = { on(event, handler) { if (event === "close") cleanup = handler; } };
  const res = {
    status() { headerWrites += 1; return this; },
    setHeader() { headerWrites += 1; },
    flushHeaders() { headerWrites += 1; },
    write() { headerWrites += 1; }
  };
  try {
    const allowed = await attachDraftEvents(req, res, "draft-owned", "owner-user");
    assert.equal(allowed, true);
    const writesAfterOwner = headerWrites;
    const denied = await attachDraftEvents(req, res, "draft-owned", "admin-user");
    assert.equal(denied, false);
    assert.equal(headerWrites, writesAfterOwner);
  } finally {
    cleanup?.();
    RoadmapDraft.findOne = originalFindOne;
  }
});

test("persistent per-user request window rejects a sixth unique roadmap draft", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  let createCalls = 0;
  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async () => { createCalls += 1; throw new Error("draft must not be created"); };
  try {
    await assert.rejects(
      createRoadmapDraft({
        userId: "507f191e810c19729de860ea",
        profile: { topic: "Distributed systems", goal: "learn" },
        dependencies: {
          countActiveDrafts: async (filter) => filter.createdAt ? 5 : 0
        }
      }),
      (error) => error.code === "ROADMAP_USER_RATE_LIMIT" && error.status === 429
    );
    assert.equal(createCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
  }
});

test("active roadmap builds are capped per user before a new draft is persisted", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  let createCalls = 0;
  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async () => { createCalls += 1; throw new Error("draft must not be created"); };
  try {
    await assert.rejects(
      createRoadmapDraft({
        userId: "507f191e810c19729de860ea",
        profile: { topic: "React", goal: "learn" },
        dependencies: { countActiveDrafts: async (filter) => filter.userId ? 2 : 2 }
      }),
      (error) => error.code === "ROADMAP_USER_QUEUE_LIMIT" && error.status === 429
    );
    assert.equal(createCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
  }
});

test("global roadmap queue capacity rejects additional builds before persistence", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  let createCalls = 0;
  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async () => { createCalls += 1; throw new Error("draft must not be created"); };
  try {
    await assert.rejects(
      createRoadmapDraft({
        userId: "507f191e810c19729de860ea",
        profile: { topic: "Node.js", goal: "learn" },
        dependencies: { countActiveDrafts: async (filter) => filter.userId ? 0 : 10000 }
      }),
      (error) => error.code === "ROADMAP_QUEUE_FULL" && error.status === 503
    );
    assert.equal(createCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
  }
});

test("quota/provider failure is persisted as a retryable failed draft with a safe recovery event", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  const draft = { _id: "draft-quota-test", events: [], status: "queued" };
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  const originalUpdateOne = RoadmapDraft.updateOne;

  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async (payload) => Object.assign(draft, payload);
  RoadmapDraft.updateOne = async (filter, update) => {
    if (filter.status === "queued" && draft.status !== "queued") return { modifiedCount: 0 };
    if (update.$set) Object.assign(draft, update.$set);
    if (update.$push?.events?.$each) draft.events.push(...update.$push.events.$each);
    return { modifiedCount: 1 };
  };

  try {
    const created = await createRoadmapDraft({
      userId,
      profile,
      dependencies: {
        countActiveDrafts: async () => 0,
        generateAIRoadmap: async () => {
          const error = new Error("provider quota details must not be exposed");
          error.code = "QUOTA_EXHAUSTED";
          throw error;
        }
      }
    });
    assert.equal(created.status, "queued");
    const deadline = Date.now() + 1500;
    while (draft.status !== "failed" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    assert.equal(draft.status, "failed");
    assert.equal(draft.errorCode, "QUOTA_EXHAUSTED");
    const event = draft.events.find((item) => item.type === "error");
    assert.ok(event);
    assert.equal(event.state, "failed");
    assert.equal(event.message, "Roadmap build failed. Please retry.");
    assert.equal(JSON.stringify(draft.events).includes("provider quota details"), false);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
    RoadmapDraft.updateOne = originalUpdateOne;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createRoadmapDraft, stableProfileKey, getDraftForUser, getRoadmapPoll, attachDraftEvents, waitForDraft, cancelQueuedRoadmapDraft } from "./asyncRoadmap.service.js";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { Course } from "../models/Course.js";

function admissionDependencies(overrides = {}) {
  return {
    consumeRoadmapRequestAllowance: async () => 1,
    reserveRoadmapAdmission: async ({ draftId }) => ({ draftId, leaseToken: "test-admission-lease" }),
    renewRoadmapAdmission: async () => true,
    releaseRoadmapAdmission: async () => true,
    recoverExpiredRoadmapAdmissions: async () => 0,
    ...overrides
  };
}


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

test("only the owner can cancel a queued roadmap draft and cancellation is persisted", async () => {
  const originalFindOneAndUpdate = RoadmapDraft.findOneAndUpdate;
  const originalUpdateOne = RoadmapDraft.updateOne;
  const draft = { _id: "draft-row", draftId: "draft-queued", events: [] };
  let capturedFilter;
  RoadmapDraft.findOneAndUpdate = async (filter, update) => {
    capturedFilter = filter;
    assert.equal(update.$set.status, "cancelled");
    return draft;
  };
  RoadmapDraft.updateOne = async (_filter, update) => {
    if (update.$push?.events?.$each) draft.events.push(...update.$push.events.$each);
    return { modifiedCount: 1 };
  };
  try {
    const result = await cancelQueuedRoadmapDraft("draft-queued", "owner-user", { releaseQueuedRoadmapAdmission: async () => true });
    assert.deepEqual(capturedFilter, { draftId: "draft-queued", userId: "owner-user", status: "queued" });
    assert.deepEqual(result, { draftId: "draft-queued", status: "cancelled", cancelled: true });
    assert.equal(draft.events[0].type, "cancelled");
    assert.equal(draft.events[0].message, "Roadmap build cancelled.");
  } finally {
    RoadmapDraft.findOneAndUpdate = originalFindOneAndUpdate;
    RoadmapDraft.updateOne = originalUpdateOne;
  }
});

test("a running roadmap build cannot be falsely reported as cancelled", async () => {
  const originalFindOneAndUpdate = RoadmapDraft.findOneAndUpdate;
  const originalFindOne = RoadmapDraft.findOne;
  RoadmapDraft.findOneAndUpdate = async () => null;
  RoadmapDraft.findOne = () => ({
    lean: async () => ({ draftId: "draft-running", userId: "owner-user", status: "building" })
  });
  try {
    const result = await cancelQueuedRoadmapDraft("draft-running", "owner-user");
    assert.deepEqual(result, { draftId: "draft-running", status: "building", cancelled: false });
  } finally {
    RoadmapDraft.findOneAndUpdate = originalFindOneAndUpdate;
    RoadmapDraft.findOne = originalFindOne;
  }
});

test("cancelled queued drafts are not started by the local queue worker", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  const originalUpdateOne = RoadmapDraft.updateOne;
  const draft = { _id: "draft-cancelled-before-start", status: "queued", events: [] };
  let generationCalls = 0;
  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async (payload) => Object.assign(draft, payload);
  RoadmapDraft.updateOne = async () => ({ modifiedCount: 0 });
  try {
    const result = await createRoadmapDraft({
      userId: "507f191e810c19729de860ea",
      profile: { topic: "React", goal: "learn" },
      dependencies: {
        ...admissionDependencies(),
        generateAIRoadmap: async () => { generationCalls += 1; return { course: { id: "course-1" } }; }
      }
    });
    assert.equal(result.status, "queued");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(generationCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
    RoadmapDraft.updateOne = originalUpdateOne;
  }
});

test("roadmap polling returns the latest queued state at the caller timeout", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  let reads = 0;
  RoadmapDraft.findOne = () => ({
    lean: async () => { reads += 1; return { draftId: "draft-pending", status: "queued", events: [] }; }
  });
  const started = Date.now();
  try {
    const result = await waitForDraft("draft-pending", "owner-user", 100);
    const elapsed = Date.now() - started;
    assert.equal(result.status, "queued");
    assert.ok(reads >= 1);
    assert.ok(elapsed >= 80 && elapsed < 1000, "polling should respect a short caller timeout");
  } finally {
    RoadmapDraft.findOne = originalFindOne;
  }
});

test("roadmap polling returns immediately when the draft reaches a terminal state", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  RoadmapDraft.findOne = () => ({
    lean: async () => ({ draftId: "draft-ready", status: "ready", result: { ok: true } })
  });
  const started = Date.now();
  try {
    const result = await waitForDraft("draft-ready", "owner-user", 2000);
    assert.equal(result.status, "ready");
    assert.ok(Date.now() - started < 500, "terminal drafts must not consume the polling timeout");
  } finally {
    RoadmapDraft.findOne = originalFindOne;
  }
});

test("reconnected roadmap event streams replay persisted events in order", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const events = [
    { type: "progress", state: "building", at: "2026-10-30T10:00:00.000Z" },
    { type: "node", nodeId: "lesson-1", state: "ready", at: "2026-10-30T10:00:01.000Z" }
  ];
  RoadmapDraft.findOne = () => ({
    lean: async () => ({ draftId: "draft-resume", userId: "owner-user", events })
  });
  let cleanup;
  const req = { on(event, handler) { if (event === "close") cleanup = handler; } };
  const writes = [];
  const res = {
    status() { return this; },
    setHeader() {},
    flushHeaders() {},
    write(value) { writes.push(value); }
  };
  try {
    const connected = await attachDraftEvents(req, res, "draft-resume", "owner-user");
    assert.equal(connected, true);
    assert.equal(writes.length, 2);
    assert.match(writes[0], /event: progress/);
    assert.match(writes[1], /event: node/);
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
        dependencies: admissionDependencies({
          consumeRoadmapRequestAllowance: async () => {
            throw Object.assign(new Error("Too many roadmap build requests. Please wait before starting another build."), {
              code: "ROADMAP_USER_RATE_LIMIT", status: 429
            });
          }
        })
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
        dependencies: admissionDependencies({
          reserveRoadmapAdmission: async () => {
            throw Object.assign(new Error("You already have the maximum number of active roadmap builds."), {
              code: "ROADMAP_USER_QUEUE_LIMIT", status: 429
            });
          }
        })
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
        dependencies: admissionDependencies({
          reserveRoadmapAdmission: async () => {
            throw Object.assign(new Error("Roadmap build capacity is temporarily full. Please retry shortly."), {
              code: "ROADMAP_QUEUE_FULL", status: 503
            });
          }
        })
      }),
      (error) => error.code === "ROADMAP_QUEUE_FULL" && error.status === 503
    );
    assert.equal(createCalls, 0);
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
  }
});

test("a recent failed draft can be retried with a new draft ID", async () => {
  const originalFindOne = RoadmapDraft.findOne;
  const originalCreate = RoadmapDraft.create;
  const originalUpdateOne = RoadmapDraft.updateOne;
  let createCalls = 0;
  RoadmapDraft.findOne = () => ({ sort: async () => ({ draftId: "failed-old", status: "failed" }) });
  RoadmapDraft.create = async (payload) => {
    createCalls += 1;
    return { _id: "draft-new-row", ...payload };
  };
  RoadmapDraft.updateOne = async () => ({ modifiedCount: 0 });
  try {
    const result = await createRoadmapDraft({
      userId: "507f191e810c19729de860ea",
      profile: { topic: "React retry", goal: "learn" },
      dependencies: admissionDependencies()
    });
    assert.equal(result.reused, false);
    assert.equal(result.status, "queued");
    assert.equal(createCalls, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    RoadmapDraft.findOne = originalFindOne;
    RoadmapDraft.create = originalCreate;
    RoadmapDraft.updateOne = originalUpdateOne;
  }
});

test("a failure after private course persistence archives and detaches the incomplete course", async () => {
  const userId = "507f191e810c19729de860ea";
  const draft = { _id: "draft-partial-row", draftId: "draft-partial", events: [], status: "queued" };
  const originalDraftFindOne = RoadmapDraft.findOne;
  const originalDraftCreate = RoadmapDraft.create;
  const originalDraftUpdateOne = RoadmapDraft.updateOne;
  const originalCourseFindOne = Course.findOne;
  const originalCourseUpdateOne = Course.updateOne;
  let archivedFilter;
  let archivedUpdate;
  RoadmapDraft.findOne = () => ({ sort: async () => null });
  RoadmapDraft.create = async (payload) => Object.assign(draft, payload);
  RoadmapDraft.updateOne = async (filter, update) => {
    if (filter.status === "queued") Object.assign(draft, update.$set);
    if (update.$set) Object.assign(draft, update.$set);
    if (update.$push?.events?.$each) draft.events.push(...update.$push.events.$each);
    return { modifiedCount: 1 };
  };
  Course.findOne = () => { throw new Error("course read failed after persistence"); };
  Course.updateOne = async (filter, update) => {
    archivedFilter = filter;
    archivedUpdate = update;
    return { modifiedCount: 1 };
  };
  try {
    await createRoadmapDraft({
      userId,
      profile: { topic: "React partial", goal: "learn" },
      dependencies: {
        ...admissionDependencies(),
        generateAIRoadmap: async () => ({ course: { id: "course-partial", modules: [] } })
      }
    });
    const deadline = Date.now() + 1000;
    while (draft.status !== "failed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(draft.status, "failed");
    assert.equal(draft.roadmapId, null);
    assert.equal(draft.result, null);
    assert.deepEqual(archivedFilter, { _id: "course-partial", createdForUser: userId });
    assert.deepEqual(archivedUpdate.$set, { status: "archived", isPublished: false, visibility: "private" });
    assert.ok(draft.events.some((event) => event.type === "error"));
  } finally {
    RoadmapDraft.findOne = originalDraftFindOne;
    RoadmapDraft.create = originalDraftCreate;
    RoadmapDraft.updateOne = originalDraftUpdateOne;
    Course.findOne = originalCourseFindOne;
    Course.updateOne = originalCourseUpdateOne;
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
        ...admissionDependencies(),
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

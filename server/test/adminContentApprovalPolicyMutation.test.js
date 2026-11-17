import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { updateContentApprovalPolicies } from "../src/controllers/adminPro.controller.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { AuditLog } from "../src/models/AuditLog.js";

const actorId = "507f191e810c19729de860ea";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
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
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function request(policies) {
  return {
    body: { policies, reason: "Update moderation rules after policy review" },
    user: { userId: actorId, user: { _id: actorId } },
    ip: "127.0.0.1",
    get: () => "admin-content-policy-test",
  };
}

function sessionQuery(value, expectedSession, onSession) {
  return {
    session(session) {
      assert.equal(session, expectedSession);
      onSession?.();
      return this;
    },
    lean: async () => value,
  };
}

test("content approval policy batch updates run in one MongoDB transaction and audit after commit", async () => {
  const session = {
    transactionStarted: false,
    ended: false,
    async withTransaction(callback) {
      this.transactionStarted = true;
      await callback();
    },
    async endSession() { this.ended = true; },
  };
  const originalStartSession = mongoose.startSession;
  const rows = new Map([
    ["content_approval_ai_courses", { _id: "setting-ai", value: "manual", updatedAt: new Date("2026-11-17T10:00:00.000Z") }],
    ["content_approval_user_reviews", { _id: "setting-reviews", value: "automatic", updatedAt: new Date("2026-11-17T10:00:00.000Z") }],
  ]);
  const writes = [];
  const audits = [];
  let readsInTransaction = 0;
  mongoose.startSession = async () => session;
  try {
    await withMocks([
      [PlatformSetting, {
        findOne: (filter) => sessionQuery(rows.get(filter.key) || null, session, () => { readsInTransaction += 1; }),
        findOneAndUpdate: async (filter, update, options) => {
          assert.equal(options.session, session);
          writes.push({ filter, update });
          const key = filter.key || (filter._id === "setting-ai" ? "content_approval_ai_courses" : "content_approval_user_reviews");
          const current = rows.get(key);
          const updated = { ...(current || {}), _id: current?._id || "new-setting-" + key, key, ...update.$set, updatedAt: new Date() };
          rows.set(key, updated);
          return updated;
        },
        find: () => ({
          select() { return this; },
          lean: async () => [...rows.entries()].map(([key, value]) => ({ key, value: value.value, updatedAt: value.updatedAt })),
        }),
      }],
      [AuditLog, { create: async (event) => { audits.push(event); return event; } }],
    ], async () => {
      const res = responseRecorder();
      await updateContentApprovalPolicies(request({
        aiCourses: "automatic",
        userReviews: "manual",
      }), res, (error) => assert.fail(error));

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(session.transactionStarted, true);
      assert.equal(session.ended, true);
      assert.equal(readsInTransaction, 2);
      assert.equal(writes.length, 2);
      assert.equal(audits.length, 2);
      assert.ok(audits.every((event) => event.action === "content_approval_policy.updated"));
      assert.deepEqual(
        audits.map((event) => [event.before.mode, event.after.mode]),
        [["manual", "automatic"], ["automatic", "manual"]]
      );
    });
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

test("content approval policy batch returns 409 on a stale write and does not audit partial success", async () => {
  const session = {
    ended: false,
    async withTransaction(callback) { await callback(); },
    async endSession() { this.ended = true; },
  };
  const originalStartSession = mongoose.startSession;
  const current = { _id: "setting-ai", value: "manual", updatedAt: new Date("2026-11-17T10:00:00.000Z") };
  let auditAttempted = false;
  mongoose.startSession = async () => session;
  try {
    await withMocks([
      [PlatformSetting, {
        findOne: (filter) => sessionQuery(filter.key === "content_approval_ai_courses" ? current : null, session),
        findOneAndUpdate: async () => null,
      }],
      [AuditLog, { create: async () => { auditAttempted = true; } }],
    ], async () => {
      const res = responseRecorder();
      await updateContentApprovalPolicies(request({ aiCourses: "automatic" }), res, (error) => assert.fail(error));
      assert.equal(res.statusCode, 409);
      assert.match(res.body.message, /changed concurrently/i);
      assert.equal(session.ended, true);
      assert.equal(auditAttempted, false);
    });
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

test("content approval policy rejects unknown or invalid modes before opening a transaction", async () => {
  let startSessionCalled = false;
  const originalStartSession = mongoose.startSession;
  mongoose.startSession = async () => {
    startSessionCalled = true;
    throw new Error("transaction must not start");
  };
  try {
    const res = responseRecorder();
    await updateContentApprovalPolicies(request({ unknownPolicy: "automatic" }), res, (error) => assert.fail(error));
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Unknown content approval policy/i);
    assert.equal(startSessionCalled, false);
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

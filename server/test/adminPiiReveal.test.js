import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { revealUserPii, users } from "../src/controllers/adminPro.controller.js";

const USER_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f191e810c19729de860ea";

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
  finally { for (const { target, key, original } of originals.reverse()) target[key] = original; }
}

test("PII reveal rejects invalid IDs and missing reasons before looking up a user", async () => {
  for (const request of [
    { params: { userId: "bad-id" }, body: { reason: "Support case investigation" } },
    { params: { userId: USER_ID }, body: { reason: "short" } },
    { params: { userId: USER_ID }, body: { reason: "x".repeat(501) } }
  ]) {
    const res = responseRecorder();
    let lookupCalled = false;
    await withMocks([[User, { findById: () => { lookupCalled = true; throw new Error("lookup must not run"); } }]], async () => {
      await revealUserPii({ ...request, user: { userId: ACTOR_ID }, ip: "127.0.0.1", get: () => "" }, res, (error) => { throw error; });
    });
    assert.equal(res.statusCode, 400);
    assert.equal(lookupCalled, false);
  }
});

test("PII reveal returns the value only after recording a redacted audit event", async () => {
  let recordedEvent;
  const user = { _id: USER_ID, email: "learner@example.com" };
  const query = { select() { return this; }, lean: async () => user };
  const res = responseRecorder();
  await withMocks([
    [User, { findById: () => query }],
    [AuditLog, { create: async (event) => { recordedEvent = event; return event; } }]
  ], async () => {
    await revealUserPii({
      params: { userId: USER_ID },
      body: { reason: "Investigating learner account support ticket" },
      user: { userId: ACTOR_ID },
      ip: "127.0.0.1",
      get: () => "test-agent"
    }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "learner@example.com");
  assert.equal(recordedEvent.action, "admin.users.pii_revealed");
  assert.equal(String(recordedEvent.actor), ACTOR_ID);
  assert.equal(String(recordedEvent.targetId), USER_ID);
  assert.equal(recordedEvent.reason, "Investigating learner account support ticket");
  assert.deepEqual(recordedEvent.after, { field: "email", revealed: true });
  assert.equal(JSON.stringify(recordedEvent).includes("learner@example.com"), false);
});

test("PII reveal fails closed when neither audit log nor outbox can persist the event", async () => {
  const user = { _id: USER_ID, email: "learner@example.com" };
  const query = { select() { return this; }, lean: async () => user };
  const res = responseRecorder();
  const originalError = console.error;
  console.error = () => {};
  try {
    await withMocks([
      [User, { findById: () => query }],
      [AuditLog, { create: async () => { throw new Error("audit unavailable"); } }],
      [AuditOutbox, { create: async () => { throw new Error("outbox unavailable"); } }]
    ], async () => {
      await revealUserPii({
        params: { userId: USER_ID },
        body: { reason: "Investigating learner account support ticket" },
        user: { userId: ACTOR_ID },
        ip: "127.0.0.1",
        get: () => "test-agent"
      }, res, (error) => { throw error; });
    });
  } finally { console.error = originalError; }
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res.body).includes("learner@example.com"), false);
});


test("user list omits raw email and returns a masked display value", async () => {
  const row = {
    _id: USER_ID,
    name: "Learner One",
    email: "learner@example.com",
    role: "user",
    isActive: true
  };
  const query = {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean: async () => [row]
  };
  const res = responseRecorder();
  await withMocks([
    [User, {
      find: () => query,
      countDocuments: async () => 1
    }]
  ], async () => {
    await users({ query: { page: "1", limit: "25" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.users.length, 1);
  assert.equal(res.body.users[0].email, undefined);
  assert.equal(res.body.users[0].emailMasked, "l***@example.com");
});

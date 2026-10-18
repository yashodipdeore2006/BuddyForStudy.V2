import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { updateUser } from "../src/controllers/admin.controller.js";

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

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("admin user status updates record an audit event with actor, before/after state and bounded reason", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  const savedUser = {
    _id: userId,
    role: "user",
    isActive: true,
    async save() { return this; }
  };
  let auditEvent;
  const res = responseRecorder();

  await withMocks([
    [User, { findById: async (id) => id === userId ? savedUser : null }],
    [AuditLog, { create: async (event) => { auditEvent = event; return event; } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox should not be used"); } }]
  ], async () => {
    await updateUser({
      params: { userId },
      body: { isActive: false, reason: `  policy review  ${"x".repeat(600)}  ` },
      user: { userId: actorId },
      ip: "192.0.2.4",
      get: (header) => header === "user-agent" ? "test-agent" : undefined
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.user.isActive, false);
  assert.equal(res.body.auditLogRecorded, true);
  assert.equal(res.body.auditQueued, false);
  assert.equal(auditEvent.actor, actorId);
  assert.equal(auditEvent.action, "admin.user_status.updated");
  assert.equal(auditEvent.targetType, "user");
  assert.equal(auditEvent.targetId, userId);
  assert.deepEqual(auditEvent.before, { isActive: true });
  assert.deepEqual(auditEvent.after, { isActive: false });
  assert.equal(auditEvent.reason.length, 500);
  assert.equal(auditEvent.reason.startsWith("policy review"), true);
  assert.equal(auditEvent.ip, "192.0.2.4");
  assert.equal(auditEvent.userAgent, "test-agent");
});

test("admin user status update rejects administrator accounts without changing them", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const savedUser = {
    _id: userId,
    role: "admin",
    isActive: true,
    saveCalled: false,
    async save() { this.saveCalled = true; return this; }
  };
  const res = responseRecorder();

  await withMocks([
    [User, { findById: async () => savedUser }],
    [AuditLog, { create: async () => { throw new Error("audit should not be attempted"); } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox should not be attempted"); } }]
  ], async () => {
    await updateUser({
      params: { userId },
      body: { isActive: false },
      user: { userId: "507f191e810c19729de860ea" },
      ip: "192.0.2.4",
      get: () => "test-agent"
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(savedUser.isActive, true);
  assert.equal(savedUser.saveCalled, false);
});


test("admin user status update reports queued audit persistence when the primary audit write fails", async () => {
  const userId = "507f1f77bcf86cd799439012";
  const actorId = "507f191e810c19729de860eb";
  const savedUser = {
    _id: userId,
    role: "user",
    isActive: false,
    async save() { return this; }
  };
  let queuedEntry;
  const res = responseRecorder();

  await withMocks([
    [User, { findById: async () => savedUser }],
    [AuditLog, { create: async () => { throw new Error("audit collection unavailable"); } }],
    [AuditOutbox, { create: async (entry) => { queuedEntry = entry; return entry; } }]
  ], async () => {
    await updateUser({
      params: { userId },
      body: { isActive: true, reason: "manual review" },
      user: { userId: actorId },
      ip: "192.0.2.8",
      get: () => "test-agent"
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.user.isActive, true);
  assert.equal(res.body.auditLogRecorded, false);
  assert.equal(res.body.auditQueued, true);
  assert.match(res.body.message, /queued for retry/);
  assert.equal(queuedEntry.status, "pending");
  assert.equal(queuedEntry.event.action, "admin.user_status.updated");
  assert.equal(queuedEntry.event.actor, actorId);
  assert.deepEqual(queuedEntry.event.before, { isActive: false });
  assert.deepEqual(queuedEntry.event.after, { isActive: true });
});

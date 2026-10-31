import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { exportUsers } from "../src/controllers/adminPro.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withUserFind(find, run) {
  const original = User.find;
  User.find = find;
  try { await run(); } finally { User.find = original; }
}

test("selected-user export requires explicit selected IDs", async () => {
  let queried = false;
  const res = responseRecorder();
  await withUserFind(() => { queried = true; throw new Error("should not query"); }, async () => {
    await exportUsers({ query: {}, user: { userId: "507f191e810c19729de860ea" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /select between 1 and 100 users/i);
  assert.equal(queried, false);
});

test("selected-user export rejects malformed IDs before querying", async () => {
  let queried = false;
  const res = responseRecorder();
  await withUserFind(() => { queried = true; throw new Error("should not query"); }, async () => {
    await exportUsers({ query: { ids: "not-an-object-id" }, user: { userId: "507f191e810c19729de860ea" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /IDs are invalid/i);
  assert.equal(queried, false);
});


test("selected-user export rejects missing, short, and oversized audit reasons before querying", async () => {
  let queried = false;
  await withUserFind(() => { queried = true; throw new Error("should not query"); }, async () => {
    for (const reason of [undefined, "", "too short", "x".repeat(501)]) {
      const invalid = responseRecorder();
      await exportUsers({
        method: "POST",
        body: {
          ids: ["507f1f77bcf86cd799439011"],
          ...(reason === undefined ? {} : { reason }),
        },
        user: { userId: "507f191e810c19729de860ea" },
      }, invalid, (error) => { throw error; });
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.body.success, false);
      assert.match(invalid.body.message, /reason between 10 and 500 characters/i);
    }
  });
  assert.equal(queried, false);
});


test("selected-user export enforces the allowlisted projection, hard row limit, sort bounds, and audit event", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  const createdAt = new Date("2025-01-02T03:04:05.000Z");
  const exportedRow = {
    _id: userId,
    name: "Learner One",
    email: "learner@example.test",
    role: "user",
    isActive: true,
    emailVerified: true,
    authProvider: "local",
    createdAt
  };
  const queryState = {};
  let auditEvent;
  const originalFind = User.find;
  const originalAuditCreate = AuditLog.create;
  const originalOutboxCreate = AuditOutbox.create;
  User.find = (filter) => {
    queryState.filter = filter;
    return {
      select(fields) { queryState.select = fields; return this; },
      sort(sort) { queryState.sort = sort; return this; },
      limit(limit) { queryState.limit = limit; return this; },
      lean: async () => [exportedRow]
    };
  };
  AuditLog.create = async (event) => { auditEvent = event; return event; };
  AuditOutbox.create = async () => { throw new Error("Outbox should not be used for a successful audit write"); };

  try {
    const res = responseRecorder();
    await exportUsers({
      method: "POST",
      body: { ids: [userId], reason: "Support incident review", sortBy: "email", sortOrder: "desc" },
      user: { userId: actorId },
      ip: "192.0.2.9",
      get: () => "user-export-test"
    }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(queryState.filter, { _id: { $in: [userId] } });
    assert.equal(queryState.select, "_id name email role isActive emailVerified authProvider createdAt");
    assert.deepEqual(queryState.sort, { email: -1, _id: -1 });
    assert.equal(queryState.limit, 100);
    assert.deepEqual(res.body.users, [exportedRow]);
    assert.equal(res.body.count, 1);
    assert.equal(String(auditEvent.actor), actorId);
    assert.equal(auditEvent.action, "admin.users.exported");
    assert.equal(auditEvent.reason, "Support incident review");
    assert.deepEqual(auditEvent.after, {
      count: 1,
      selectedCount: 1,
      fields: ["name", "email", "role", "isActive", "emailVerified", "authProvider", "createdAt"]
    });
    assert.equal(JSON.stringify(auditEvent).includes("learner@example.test"), false);
  } finally {
    User.find = originalFind;
    AuditLog.create = originalAuditCreate;
    AuditOutbox.create = originalOutboxCreate;
  }
});

test("selected-user export rejects more than 100 selected user IDs before database access", async () => {
  let queried = false;
  const originalFind = User.find;
  User.find = () => { queried = true; throw new Error("database query must not run"); };
  try {
    const res = responseRecorder();
    await exportUsers({
      method: "POST",
      body: { ids: Array.from({ length: 101 }, () => "507f1f77bcf86cd799439011"), reason: "Support incident review" },
      user: { userId: "507f191e810c19729de860ea" }
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /select between 1 and 100 users/i);
    assert.equal(queried, false);
  } finally {
    User.find = originalFind;
  }
});

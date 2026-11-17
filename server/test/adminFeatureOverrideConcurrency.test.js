import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { UserFeatureOverride } from "../src/models/UserFeatureOverride.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { upsertUserFeatureOverride, deleteUserFeatureOverride } from "../src/controllers/adminPro.controller.js";

const userId = "507f1f77bcf86cd799439011";
const actorId = "507f191e810c19729de860ea";
const featureKey = "course_search";

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

function userLookup() {
  return { select: async () => ({ _id: userId, role: "user" }) };
}

function request(body = {}) {
  return {
    params: { userId, featureKey },
    body,
    user: { userId: actorId },
    ip: "127.0.0.1",
    get: () => "admin-feature-override-test",
  };
}

test("feature override update uses an optimistic version filter and returns 409 when stale", async () => {
  const updatedAt = new Date("2026-11-17T12:00:00.000Z");
  const existing = { _id: "override-id", user: userId, featureKey, allowed: false, updatedAt };
  let writeFilter;
  let auditCalled = false;
  const res = responseRecorder();

  await withMocks([
    [User, { findById: userLookup }],
    [UserFeatureOverride, {
      findOne: () => ({ lean: async () => existing }),
      findOneAndUpdate: (filter) => {
        writeFilter = filter;
        return { lean: async () => null };
      },
    }],
    [AuditLog, { create: async () => { auditCalled = true; } }],
  ], async () => {
    await upsertUserFeatureOverride(request({
      allowed: true,
      reason: "Grant temporary course search access",
    }), res, (error) => assert.fail(error));
  });

  assert.equal(res.statusCode, 409);
  assert.equal(writeFilter._id, "override-id");
  assert.equal(writeFilter.updatedAt, updatedAt);
  assert.equal(auditCalled, false, "a stale write must not create a success audit event");
});

test("feature override deletion is compare-and-delete and conflicts after a concurrent update", async () => {
  const updatedAt = new Date("2026-11-17T12:00:00.000Z");
  const existing = {
    _id: "override-id", user: userId, featureKey, allowed: true,
    expiresAt: null, reason: "Previous reason", updatedAt,
  };
  let deleteFilter;
  let auditCalled = false;
  const res = responseRecorder();

  await withMocks([
    [UserFeatureOverride, {
      findOne: () => ({ lean: async () => existing }),
      deleteOne: async (filter) => {
        deleteFilter = filter;
        return { deletedCount: 0 };
      },
    }],
    [AuditLog, { create: async () => { auditCalled = true; } }],
  ], async () => {
    await deleteUserFeatureOverride(request({
      reason: "Remove outdated course search exception",
    }), res, (error) => assert.fail(error));
  });

  assert.equal(res.statusCode, 409);
  assert.equal(deleteFilter._id, "override-id");
  assert.equal(deleteFilter.updatedAt, updatedAt);
  assert.equal(auditCalled, false, "a failed compare-and-delete must not be audited as a removal");
});

test("feature override creation race returns conflict rather than overwriting the competing insert", async () => {
  const duplicateError = Object.assign(new Error("duplicate key"), { code: 11000 });
  let updateFilter;
  const res = responseRecorder();

  await withMocks([
    [User, { findById: userLookup }],
    [UserFeatureOverride, {
      findOne: () => ({ lean: async () => null }),
      findOneAndUpdate: () => {
        updateFilter = { user: userId, featureKey };
        throw duplicateError;
      },
    }],
  ], async () => {
    await upsertUserFeatureOverride(request({
      allowed: true,
      reason: "Grant temporary course search access",
    }), res, (error) => assert.fail(error));
  });

  assert.deepEqual(updateFilter, { user: userId, featureKey });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /changed concurrently/i);
});

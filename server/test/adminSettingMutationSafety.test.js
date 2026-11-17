import test from "node:test";
import assert from "node:assert/strict";
import { upsertSetting, deleteSetting } from "../src/controllers/adminPro.controller.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";

const actorId = "507f191e810c19729de860ea";
const settingId = "507f1f77bcf86cd799439011";

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

function request(body = {}) {
  return {
    body: { key: "maintenance_mode", value: true, reason: "Enable scheduled maintenance mode", ...body },
    params: { settingId },
    user: { userId: actorId, user: { _id: actorId } },
    ip: "127.0.0.1",
    get: () => "admin-setting-test",
  };
}

test("platform setting rejects string isPublic instead of coercing the string 'false' to true", async () => {
  let databaseCalled = false;
  const res = responseRecorder();
  await withMocks([
    [PlatformSetting, {
      findOne: async () => { databaseCalled = true; throw new Error("must not query"); },
      findOneAndUpdate: async () => { databaseCalled = true; throw new Error("must not write"); },
    }],
  ], async () => {
    await upsertSetting(request({ isPublic: "false" }), res, (error) => assert.fail(error));
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /isPublic must be a boolean/i);
  assert.equal(databaseCalled, false);
});

test("platform setting rejects non-string or oversized descriptions before database access", async () => {
  for (const description of [{ exposed: true }, "x".repeat(501)]) {
    let databaseCalled = false;
    const res = responseRecorder();
    await withMocks([
      [PlatformSetting, {
        findOne: async () => { databaseCalled = true; throw new Error("must not query"); },
        findOneAndUpdate: async () => { databaseCalled = true; throw new Error("must not write"); },
      }],
    ], async () => {
      await upsertSetting(request({ description }), res, (error) => assert.fail(error));
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /description must be a string/i);
    assert.equal(databaseCalled, false);
  }
});

test("platform setting update uses a versioned filter and rejects a stale write without auditing success", async () => {
  const updatedAt = new Date("2026-11-17T12:00:00.000Z");
  let writeFilter;
  let auditWriteAttempted = false;
  const res = responseRecorder();
  await withMocks([
    [PlatformSetting, {
      findOne: async () => ({ _id: settingId, value: false, isPublic: false, updatedAt }),
      findOneAndUpdate: async (filter) => { writeFilter = filter; return null; },
    }],
  ], async () => {
    await upsertSetting(request(), res, (error) => {
      auditWriteAttempted = true;
      assert.fail(error);
    });
  });
  assert.deepEqual(writeFilter, { _id: settingId, updatedAt });
  assert.equal(res.statusCode, 409);
  assert.equal(auditWriteAttempted, false);
});

test("platform setting deletion uses compare-and-delete and rejects a concurrent update", async () => {
  const setting = {
    _id: settingId,
    key: "maintenance_mode",
    value: true,
    isPublic: false,
    updatedAt: new Date("2026-11-17T12:00:00.000Z"),
  };
  let deleteFilter;
  let auditWriteAttempted = false;
  const res = responseRecorder();
  await withMocks([
    [PlatformSetting, {
      findById: async () => setting,
      deleteOne: async (filter) => { deleteFilter = filter; return { deletedCount: 0 }; },
    }],
  ], async () => {
    await deleteSetting(request(), res, (error) => {
      auditWriteAttempted = true;
      assert.fail(error);
    });
  });
  assert.deepEqual(deleteFilter, { _id: settingId, key: "maintenance_mode", updatedAt: setting.updatedAt });
  assert.equal(res.statusCode, 409);
  assert.equal(auditWriteAttempted, false);
});

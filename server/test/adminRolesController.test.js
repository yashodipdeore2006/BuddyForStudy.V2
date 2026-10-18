import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { updateAdministratorRole, updateAIContentSetting } from "../src/controllers/adminRoles.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
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

const administratorId = "507f1f77bcf86cd799439011";

test("administrator role changes stay successful when audit events are queued for retry", async () => {
  const target = {
    _id: { toString: () => administratorId },
    name: "Support Admin",
    email: "support@example.com",
    adminRole: "support_manager",
    adminPermissionOverrides: [],
    isActive: true,
    save: async () => target
  };
  let queued;
  await withMocks([
    [User, {
      findOne: async () => target,
      countDocuments: async () => 2
    }],
    [AuditLog, { create: async () => { throw new Error("audit collection unavailable"); } }],
    [AuditOutbox, { create: async (entry) => { queued = entry; return entry; } }]
  ], async () => {
    const res = makeResponse();
    await updateAdministratorRole({
      params: { userId: administratorId },
      body: { adminRole: "finance_manager", reason: "Finance responsibilities assigned" },
      user: { userId: "507f191e810c19729de860ea" },
      ip: "127.0.0.1",
      get: () => "admin-role-test"
    }, res, (error) => assert.fail(error));

    assert.equal(target.adminRole, "finance_manager");
    assert.deepEqual(target.adminPermissionOverrides, []);
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.equal(res.result.body.auditLogRecorded, false);
    assert.equal(res.result.body.auditQueued, true);
    assert.match(res.result.body.message, /queued for retry/i);
    assert.equal(queued.status, "pending");
    assert.equal(queued.event.action, "admin.role.updated");
    assert.deepEqual(queued.event.before, { adminRole: "support_manager" });
    assert.deepEqual(queued.event.after, { adminRole: "finance_manager" });
  });
});

test("AI/content setting updates stay successful when audit events are queued for retry", async () => {
  const setting = { _id: { toString: () => "setting-id" }, key: "advanced_ai_qa_enabled", value: false };
  let queued;
  await withMocks([
    [PlatformSetting, {
      findOne: async () => ({ value: false }),
      findOneAndUpdate: async () => setting
    }],
    [AuditLog, { create: async () => { throw new Error("audit collection unavailable"); } }],
    [AuditOutbox, { create: async (entry) => { queued = entry; return entry; } }]
  ], async () => {
    const res = makeResponse();
    await updateAIContentSetting({
      params: { key: "advanced_ai_qa_enabled" },
      body: { value: true, reason: "Enable lesson Q&A" },
      user: { userId: "507f191e810c19729de860ea" },
      ip: "127.0.0.1",
      get: () => "ai-setting-test"
    }, res, (error) => assert.fail(error));

    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.deepEqual(res.result.body.setting, { key: "advanced_ai_qa_enabled", value: true });
    assert.equal(res.result.body.auditLogRecorded, false);
    assert.equal(res.result.body.auditQueued, true);
    assert.match(res.result.body.message, /queued for retry/i);
    assert.equal(queued.status, "pending");
    assert.equal(queued.event.action, "ai_content.setting.updated");
    assert.deepEqual(queued.event.before, { key: "advanced_ai_qa_enabled", value: false });
    assert.deepEqual(queued.event.after, { key: "advanced_ai_qa_enabled", value: true });
  });
});

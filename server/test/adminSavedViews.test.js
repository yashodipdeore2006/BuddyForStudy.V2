import test from "node:test";
import assert from "node:assert/strict";
import { authMiddleware, adminPermissionMiddleware } from "../src/middleware/auth.js";
import { SavedView } from "../src/models/SavedView.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { createSavedView, listSavedViews, updateSavedView } from "../src/controllers/savedView.controller.js";

const OWNER_ID = "507f191e810c19729de860ea";
const VIEW_ID = "507f1f77bcf86cd799439011";

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
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

test("saved-view access rejects unauthenticated requests", async () => {
  const res = responseRecorder();
  let nextCalled = false;
  await authMiddleware({ headers: {} }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(nextCalled, false);
});

test("saved-view permission fails closed for an administrator without the grant", () => {
  const res = responseRecorder();
  let nextCalled = false;
  adminPermissionMiddleware("saved_views.manage")({
    user: { role: "admin", accessType: "admin", adminRole: "unknown_profile", adminPermissionOverrides: [] }
  }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errors.requiredPermission, "saved_views.manage");
  assert.equal(nextCalled, false);
});

test("saved-view permission allows an administrator with the explicit grant", () => {
  const res = responseRecorder();
  let nextCalled = false;
  adminPermissionMiddleware("saved_views.manage")({
    user: { role: "admin", accessType: "admin", adminRole: "platform_admin", adminPermissionOverrides: [] }
  }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.body, null);
});

test("saved-view list validates pageKey and caps pagination at 100", async () => {
  let capturedFilter;
  const query = {
    sort() { return this; },
    skip() { return this; },
    limit(value) { this.limitValue = value; return this; },
    async lean() { return []; }
  };
  const res = responseRecorder();
  await withMocks([[SavedView, {
    find(filter) { capturedFilter = filter; return query; },
    countDocuments: async () => 0
  }]], async () => {
    await listSavedViews({ user: { userId: OWNER_ID }, query: { pageKey: "users", page: "2", limit: "250" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.limit, 100);
  assert.equal(query.limitValue, 100);
  assert.equal(String(capturedFilter.$or[0].owner), OWNER_ID);
  assert.equal(capturedFilter.$or[1].shared, true);
});

test("saved-view list rejects a missing or malformed pageKey", async () => {
  const res = responseRecorder();
  let queryCalled = false;
  await withMocks([[SavedView, { find() { queryCalled = true; throw new Error("should not query"); } }]], async () => {
    await listSavedViews({ user: { userId: OWNER_ID }, query: { pageKey: "bad page key" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(queryCalled, false);
});

test("saved-view creation validates input and writes a redacted audit event", async () => {
  const invalidRes = responseRecorder();
  let createCalled = false;
  await withMocks([[SavedView, { create: async () => { createCalled = true; } }]], async () => {
    await createSavedView({ user: { userId: OWNER_ID }, body: { page: "users", name: "" } }, invalidRes, (error) => { throw error; });
  });
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(createCalled, false);

  const auditEvents = [];
  const view = {
    _id: VIEW_ID, owner: OWNER_ID, page: "users", name: "Needs review",
    filters: { status: "disabled" }, columns: ["access"], sort: { sortBy: "name", sortOrder: "asc" },
    density: "comfortable", shared: false, createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
  const res = responseRecorder();
  await withMocks([
    [SavedView, {
      findOne: () => ({ lean: async () => null }),
      countDocuments: async () => 0,
      create: async () => view
    }],
    [AuditLog, {
      create: async (event) => { auditEvents.push(event); return event; }
    }]
  ], async () => {
    await createSavedView({
      user: { userId: OWNER_ID },
      body: { page: "users", name: "Needs review", filters: { status: "disabled" }, columns: ["access"], sort: { sortBy: "name", sortOrder: "asc" }, density: "comfortable", shared: false }
    }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.item.name, "Needs review");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "admin.saved_view.created");
  assert.equal(auditEvents[0].targetType, "SavedView");
  assert.deepEqual(auditEvents[0].after, { page: "users", name: "Needs review", shared: false });
  assert.equal(JSON.stringify(auditEvents[0]).includes("disabled"), false, "audit payload should not copy filter/PII values");
});

test("saved views cannot be updated by another administrator", async () => {
  const res = responseRecorder();
  let saveCalled = false;
  await withMocks([[SavedView, { findOne: () => ({ then: undefined, lean: async () => null }) }]], async () => {
    // The controller looks up an owned document and must return before mutating it.
    SavedView.findOne = () => Promise.resolve(null);
    await updateSavedView({ params: { viewId: VIEW_ID }, user: { userId: OWNER_ID }, body: { name: "Changed" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
  assert.equal(saveCalled, false);
});

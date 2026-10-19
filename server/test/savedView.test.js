import test from "node:test";
import assert from "node:assert/strict";
import { SavedView } from "../src/models/SavedView.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { createSavedView, listSavedViews, updateSavedView, deleteSavedView } from "../src/controllers/savedView.controller.js";
import { adminMiddleware, adminPermissionMiddleware, authMiddleware } from "../src/middleware/auth.js";

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) for (const [key, value] of Object.entries(methods)) {
    originals.push({ target, key, original: target[key] }); target[key] = value;
  }
  try { await run(); } finally { for (const item of originals.reverse()) item.target[item.key] = item.original; }
}
const admin = { role: "admin", accessType: "admin", adminRole: "platform_admin", adminPermissionOverrides: [], userId: "507f191e810c19729de860ea" };

test("saved view routes enforce authentication and dashboard.read permission", () => {
  const unauthenticated = responseRecorder();
  authMiddleware({ headers: {} }, unauthenticated, () => assert.fail("must reject"));
  assert.equal(unauthenticated.statusCode, 401);

  const middleware = adminPermissionMiddleware("dashboard.read");
  const unauthorized = responseRecorder();
  middleware({ user: { role: "admin", accessType: "admin", adminRole: "unknown_profile", adminPermissionOverrides: [] } }, unauthorized, () => assert.fail("must reject"));
  assert.equal(unauthorized.statusCode, 403);

  let allowed = false;
  middleware({ user: { role: "admin", accessType: "admin", adminRole: "super_admin", adminPermissionOverrides: [] } }, responseRecorder(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test("saved view routes reject non-admins and administrators without dashboard.read", () => {
  const nonAdmin = responseRecorder();
  adminMiddleware({ user: { role: "user", accessType: "user" } }, nonAdmin, () => assert.fail("must reject non-admin"));
  assert.equal(nonAdmin.statusCode, 403);

  const missingPermission = responseRecorder();
  adminPermissionMiddleware("users.manage")({
    user: { role: "admin", accessType: "admin", adminRole: "support_manager", adminPermissionOverrides: [] }
  }, missingPermission, () => assert.fail("must reject missing permission"));
  assert.equal(missingPermission.statusCode, 403);
  assert.match(missingPermission.body.message, /permission/i);
});

test("saved view creation validates fields before database writes", async () => {
  let called = false;
  const res = responseRecorder();
  await withMocks([[SavedView, { findOne: async () => { called = true; return null; }, countDocuments: async () => 0, create: async () => { called = true; } }]], async () => {
    await createSavedView({ user: admin, body: { page: "../users", name: "Bad", filters: {} } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("saved views list is scoped to owner and shared views and returns a bounded list", async () => {
  let query;
  const res = responseRecorder();
  const chain = { limitValue: 0, sort() { return this; }, skip() { return this; }, limit(value) { this.limitValue = value; return this; }, lean: async () => [] };
  await withMocks([[SavedView, { find: (value) => { query = value; return chain; }, countDocuments: async () => 0 }]], async () => {
    await listSavedViews({ user: admin, query: { pageKey: "users", page: "1", limit: "500" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(query.page, "users");
  assert.equal(chain.limitValue, 100);
  assert.equal(query.$or[0].owner, admin.userId);
  assert.deepEqual(query.$or[1], { shared: true });
});


test("saved view creation persists the validated view and returns 201", async () => {
  const now = new Date();
  const view = { _id: "507f1f77bcf86cd799439011", owner: admin.userId, page: "users", name: "Active users", filters: { status: "active" }, columns: ["access"], sort: { sortBy: "name", sortOrder: "asc" }, density: "compact", shared: true, createdAt: now, updatedAt: now };
  const res = responseRecorder();
  await withMocks([
    [SavedView, { findOne: () => ({ lean: async () => null }), countDocuments: async () => 0, create: async () => view }],
    [AuditLog, { create: async () => ({}) }]
  ], async () => {
    await createSavedView({ user: admin, body: { page: "users", name: "Active users", filters: { status: "active" }, columns: ["access"], sort: { sortBy: "name", sortOrder: "asc" }, density: "compact", shared: true } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.item.name, "Active users");
  assert.equal(res.body.item.shared, true);
});

test("saved view update audit stores only the safe before/after summary", async () => {
  const view = {
    _id: "507f1f77bcf86cd799439011",
    owner: admin.userId,
    page: "users",
    name: "Current users",
    shared: false,
    filters: { q: "private@example.com" },
    columns: ["access"],
    sort: { sortBy: "name", sortOrder: "asc" },
    density: "comfortable",
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() {},
  };
  const events = [];
  const res = responseRecorder();
  await withMocks([
    [SavedView, { findOne: async () => view }],
    [AuditLog, { create: async (event) => { events.push(event); return event; } }],
  ], async () => {
    await updateSavedView({ user: admin, params: { viewId: view._id }, body: { shared: true } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "admin.saved_view.updated");
  assert.deepEqual(events[0].before, { page: "users", name: "Current users", shared: false });
  assert.deepEqual(events[0].after, { page: "users", name: "Current users", shared: true });
  assert.equal(JSON.stringify(events[0]).includes("private@example.com"), false);
});

test("saved view mutations require ownership", async () => {
  for (const handler of [updateSavedView, deleteSavedView]) {
    const res = responseRecorder();
    await withMocks([[SavedView, { findOne: async () => null }]], async () => {
      await handler({ user: admin, params: { viewId: "507f1f77bcf86cd799439011" }, body: { name: "Changed" } }, res, (error) => { throw error; });
    });
    assert.equal(res.statusCode, 404);
  }
});

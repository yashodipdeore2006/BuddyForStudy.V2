import test from "node:test";
import assert from "node:assert/strict";
import { SavedView } from "../src/models/SavedView.js";
import { createSavedView, listSavedViews, updateSavedView, deleteSavedView } from "../src/controllers/savedView.controller.js";
import { adminPermissionMiddleware } from "../src/middleware/auth.js";

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

test("saved view permission middleware rejects unauthenticated and unauthorized callers", () => {
  const middleware = adminPermissionMiddleware("dashboard.read");
  const unauthenticated = responseRecorder();
  middleware({ user: null }, unauthenticated, () => assert.fail("must reject"));
  assert.equal(unauthenticated.statusCode, 403);
  const unauthorized = responseRecorder();
  middleware({ user: { role: "admin", accessType: "admin", adminRole: "support_manager", adminPermissionOverrides: [] } }, unauthorized, () => assert.fail("must reject"));
  assert.equal(unauthorized.statusCode, 403);
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
  const chain = { sort() { return this; }, limit() { return this; }, lean: async () => [] };
  await withMocks([[SavedView, { find: (value) => { query = value; return chain; } }]], async () => {
    await listSavedViews({ user: admin, query: { page: "users" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(query.page, "users");
  assert.equal(query.$or[0].owner, admin.userId);
  assert.deepEqual(query.$or[1], { shared: true });
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

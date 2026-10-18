import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { User } from "../src/models/User.js";
import { env } from "../src/config/env.js";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../src/middleware/auth.js";

function makeResponse() {
  const response = { statusCode: 200, body: undefined };
  return {
    response,
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; }
  };
}

function tokenFor(userId = "test-user-id", extra = {}) {
  return jwt.sign({ userId, ...extra }, env.jwtSecret, { expiresIn: "5m" });
}

async function withMockUser(user, run) {
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });
  try {
    await run();
  } finally {
    User.findById = originalFindById;
  }
}

test("auth middleware rejects requests without a bearer token", async () => {
  const res = makeResponse();
  await authMiddleware({ headers: {} }, res, () => assert.fail("next must not run"));
  assert.equal(res.response.statusCode, 401);
  assert.equal(res.response.body?.success, false);
});

test("auth middleware rejects invalid bearer tokens", async () => {
  const res = makeResponse();
  await authMiddleware({ headers: { authorization: "Bearer invalid-token" } }, res, () => assert.fail("next must not run"));
  assert.equal(res.response.statusCode, 401);
});

test("auth middleware rejects inactive administrator accounts even with a valid token", async () => {
  await withMockUser({
    _id: { toString: () => "inactive-admin-id" },
    role: "admin",
    adminRole: "super_admin",
    adminPermissionOverrides: [],
    isActive: false
  }, async () => {
    const res = makeResponse();
    await authMiddleware({ headers: { authorization: "Bearer " + tokenFor("inactive-admin-id") } }, res, () => assert.fail("next must not run"));
    assert.equal(res.response.statusCode, 401);
    assert.equal(res.response.body?.message, "Account is inactive");
  });
});

test("auth middleware attaches database role and permission profile for active administrators", async () => {
  await withMockUser({
    _id: { toString: () => "active-admin-id" },
    role: "admin",
    adminRole: "support_manager",
    adminPermissionOverrides: [],
    isActive: true
  }, async () => {
    const req = { headers: { authorization: "Bearer " + tokenFor("active-admin-id") } };
    const res = makeResponse();
    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.role, "admin");
    assert.equal(req.user.accessType, "user");
    assert.equal(req.user.adminRole, "support_manager");
    assert.deepEqual(req.user.adminPermissionOverrides, []);
  });
});

test("admin middleware requires both administrator database role and administrator access type", () => {
  for (const user of [
    { role: "user", accessType: "admin" },
    { role: "admin", accessType: "user" },
    { role: "admin", accessType: undefined }
  ]) {
    const res = makeResponse();
    let nextCalled = false;
    adminMiddleware({ user }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.response.statusCode, 403);
  }
  let nextCalled = false;
  adminMiddleware({ user: { role: "admin", accessType: "admin" } }, makeResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("permission middleware fails closed for unknown roles even when overrides are supplied", () => {
  const res = makeResponse();
  let nextCalled = false;
  adminPermissionMiddleware("admin_roles.manage")({
    user: {
      role: "admin",
      accessType: "admin",
      adminRole: "unknown",
      adminPermissionOverrides: ["admin_roles.manage"]
    }
  }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.response.statusCode, 403);
});

import test from "node:test";
import assert from "node:assert/strict";
import { adminMiddleware, adminPermissionMiddleware } from "../src/middleware/auth.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("adminMiddleware requires an authenticated admin role and admin access type", () => {
  const cases = [
    { user: undefined, status: 403 },
    { user: { role: "user", accessType: "user" }, status: 403 },
    { user: { role: "admin", accessType: "user" }, status: 403 },
    { user: { role: "user", accessType: "admin" }, status: 403 },
    { user: { role: "admin", accessType: "admin" }, status: 200 },
  ];

  for (const item of cases) {
    const req = { user: item.user };
    const res = responseRecorder();
    let nextCalled = false;

    adminMiddleware(req, res, () => {
      nextCalled = true;
    });

    if (item.status === 200) {
      assert.equal(nextCalled, true, "valid admin should continue");
      assert.equal(res.body, null);
    } else {
      assert.equal(nextCalled, false, "invalid role/access combination must be blocked");
      assert.equal(res.statusCode, 403);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.message, "Administrator access required.");
    }
  }
});

test("adminPermissionMiddleware denies a role without the required permission", () => {
  const req = { user: { role: "admin", accessType: "admin", adminRole: "support_manager", adminPermissionOverrides: [] } };
  const res = responseRecorder();
  let nextCalled = false;
  adminPermissionMiddleware("refunds.manage")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.message, "You do not have permission to perform this action.");
  assert.equal(res.body?.errors?.requiredPermission, "refunds.manage");
});

test("adminPermissionMiddleware permits an allowed role and blocks a normal user", () => {
  const allowedResponse = responseRecorder();
  let allowedNext = false;
  adminPermissionMiddleware("payment_issues.manage")(
    { user: { role: "admin", accessType: "admin", adminRole: "support_manager", adminPermissionOverrides: [] } },
    allowedResponse,
    () => { allowedNext = true; },
  );
  assert.equal(allowedNext, true);

  const deniedResponse = responseRecorder();
  let deniedNext = false;
  adminPermissionMiddleware("payment_issues.manage")(
    { user: { role: "user", accessType: "user", adminRole: "super_admin" } },
    deniedResponse,
    () => { deniedNext = true; },
  );
  assert.equal(deniedNext, false);
  assert.equal(deniedResponse.statusCode, 403);
});

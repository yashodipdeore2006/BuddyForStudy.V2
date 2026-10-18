import test from "node:test";
import assert from "node:assert/strict";
import adminProRouter from "../src/routes/adminPro.routes.js";
import { ADMIN_ROLE_PROFILES } from "../src/utils/adminRbac.js";

function runPermissionMiddleware(middleware, role, overrides = []) {
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    }
  };
  middleware({
    user: {
      role: "admin",
      accessType: "admin",
      adminRole: role,
      adminPermissionOverrides: overrides,
      userId: "test-admin"
    }
  }, res, () => {
    nextCalled = true;
  });
  return { statusCode, body, nextCalled };
}

function getRoutePermissionCases() {
  const cases = [];
  for (const layer of adminProRouter.stack || []) {
    if (!layer.route) continue;
    const route = layer.route;
    const methods = Object.keys(route.methods || {}).filter((method) => route.methods[method]);
    const permissionHandlers = (route.stack || [])
      .map((entry) => entry.handle)
      .filter((handler) => handler?.name === "requireAdminPermission");
    cases.push({
      path: route.path,
      methods,
      permissionHandlers
    });
  }
  return cases;
}

test("every protected admin route declares exactly one permission gate", () => {
  const routes = getRoutePermissionCases();
  assert.ok(routes.length >= 40, "Expected the admin router to expose its protected route inventory");
  const missing = routes.filter((route) => route.path !== "/access" && route.permissionHandlers.length !== 1);
  assert.deepEqual(missing.map(({ path, methods, permissionHandlers }) => ({
    path, methods, permissionGateCount: permissionHandlers.length
  })), []);
});

test("every admin route's actual permission middleware allows only the intended role profiles", () => {
  const routes = getRoutePermissionCases().filter((route) => route.path !== "/access");
  assert.ok(routes.length > 0);
  for (const route of routes) {
    const middleware = route.permissionHandlers[0];
    for (const role of Object.keys(ADMIN_ROLE_PROFILES)) {
      const result = runPermissionMiddleware(middleware, role);
      if (result.nextCalled) {
        assert.equal(result.statusCode, 200, role + " unexpectedly changed status on " + route.path);
        assert.equal(result.body, undefined);
      } else {
        assert.equal(result.statusCode, 403, role + " was denied with wrong status on " + route.path);
        assert.equal(result.body?.success, false, role + " got unexpected response on " + route.path);
      }
    }
  }
});

test("direct user-role and wrong access-type requests cannot pass any admin route permission gate", () => {
  const routes = getRoutePermissionCases().filter((route) => route.path !== "/access");
  for (const route of routes) {
    const middleware = route.permissionHandlers[0];
    for (const user of [
      { role: "user", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: ["*"] },
      { role: "admin", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: [] },
      { role: "admin", accessType: "admin", adminRole: "unknown", adminPermissionOverrides: ["admin_roles.manage", "refunds.manage"] }
    ]) {
      // The permission gate also checks the principal's role and access type.
      const response = { statusCode: 200, body: undefined, nextCalled: false };
      middleware({ user: { ...user, userId: "test" } }, {
        status(code) { response.statusCode = code; return this; },
        json(body) { response.body = body; return this; }
      }, () => { response.nextCalled = true; });
      assert.equal(response.nextCalled, false, route.path + " must reject invalid principal " + JSON.stringify(user));
      assert.equal(response.statusCode, 403);
      assert.equal(response.body?.success, false);
    }
  }
});

test("the current-access endpoint is an explicit authenticated exception", () => {
  const accessRoute = getRoutePermissionCases().find((route) => route.path === "/access");
  assert.ok(accessRoute, "Expected the current-access endpoint");
  assert.deepEqual(accessRoute.methods, ["get"]);
  assert.equal(accessRoute.permissionHandlers.length, 0);
});

test("registered admin routes do not rely on frontend navigation to enforce role access", () => {
  const routes = getRoutePermissionCases();
  const protectedMutationMethods = new Set(["post", "put", "patch", "delete"]);
  const unguardedMutations = routes.filter((route) =>
    route.methods.some((method) => protectedMutationMethods.has(method)) &&
    route.permissionHandlers.length !== 1
  );
  assert.deepEqual(unguardedMutations, []);
});

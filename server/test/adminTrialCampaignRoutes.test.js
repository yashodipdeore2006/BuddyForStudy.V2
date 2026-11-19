import test from "node:test";
import assert from "node:assert/strict";
import adminTrialsRouter from "../src/routes/adminTrials.routes.js";
import { ADMIN_ROLE_PROFILES } from "../src/utils/adminRbac.js";

function getRoutes() {
  return (adminTrialsRouter.stack || [])
    .filter((layer) => layer.route)
    .map((layer) => {
      const route = layer.route;
      const methods = Object.keys(route.methods || {}).filter((method) => route.methods[method]);
      const permissionHandlers = (route.stack || [])
        .map((entry) => entry.handle)
        .filter((handler) => handler?.name === "requireAdminPermission");
      return { path: route.path, methods, permissionHandlers };
    });
}

function runPermission(middleware, role, overrides = []) {
  const response = { statusCode: 200, body: undefined, nextCalled: false };
  middleware({
    user: {
      role: "admin",
      accessType: "admin",
      adminRole: role,
      adminPermissionOverrides: overrides,
      userId: "trial-campaign-admin"
    }
  }, {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; }
  }, () => { response.nextCalled = true; });
  return response;
}

test("self-serve campaign management exposes list, detail, create, update and lifecycle endpoints", () => {
  const routes = getRoutes();
  const expected = [
    ["get", "/campaigns"],
    ["get", "/campaigns/:campaignId"],
    ["post", "/campaigns"],
    ["put", "/campaigns/:campaignId"],
    ["post", "/campaigns/:campaignId/publish"],
    ["post", "/campaigns/:campaignId/pause"],
    ["post", "/campaigns/:campaignId/disable"]
  ];
  for (const [method, path] of expected) {
    assert.ok(routes.some((route) => route.path === path && route.methods.includes(method)), method + " " + path);
  }
});

test("every trial campaign route has exactly one trials.manage permission gate", () => {
  const campaignRoutes = getRoutes().filter((route) => route.path.startsWith("/campaigns"));
  assert.equal(campaignRoutes.length, 7);
  for (const route of campaignRoutes) {
    assert.equal(route.permissionHandlers.length, 1, route.path);
    const middleware = route.permissionHandlers[0];
    for (const role of Object.keys(ADMIN_ROLE_PROFILES)) {
      const result = runPermission(middleware, role);
      const allowed = ["super_admin", "platform_admin", "finance_manager"].includes(role);
      assert.equal(result.nextCalled, allowed, role + " on " + route.path);
      if (!allowed) assert.equal(result.statusCode, 403);
    }
  }
});

test("existing administrator grant endpoints remain registered and protected", () => {
  const routes = getRoutes();
  for (const path of ["/grants", "/preview", "/grant"]) {
    const route = routes.find((item) => item.path === path);
    assert.ok(route, "missing existing grant route " + path);
    assert.equal(route.permissionHandlers.length, 1);
  }
});

test("explicit trials.manage permission override is honoured by the campaign route", () => {
  const route = getRoutes().find((item) => item.path === "/campaigns" && item.methods.includes("get"));
  const result = runPermission(route.permissionHandlers[0], "support_manager", ["trials.manage"]);
  assert.equal(result.nextCalled, true);
});

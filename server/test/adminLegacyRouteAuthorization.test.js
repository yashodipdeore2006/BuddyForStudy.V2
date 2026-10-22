import test from "node:test";
import assert from "node:assert/strict";
import curriculumRouter from "../src/routes/curriculum.routes.js";
import aiRouter from "../src/routes/ai.routes.js";
import { ADMIN_ROLE_PROFILES } from "../src/utils/adminRbac.js";

function routesFrom(router) {
  return (router.stack || []).filter((layer) => layer.route).map((layer) => {
    const route = layer.route;
    return {
      path: route.path,
      methods: Object.keys(route.methods || {}).filter((method) => route.methods[method]),
      gates: (route.stack || []).map((entry) => entry.handle).filter((handler) => handler?.name === "requireAdminPermission"),
    };
  });
}

function runGate(middleware, principal) {
  const result = { statusCode: 200, body: undefined, nextCalled: false };
  middleware({ user: { ...principal, userId: "admin-test-id" } }, {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  }, () => { result.nextCalled = true; });
  return result;
}

function runGateChain(gates, principal) {
  for (const gate of gates) {
    const result = runGate(gate, principal);
    if (!result.nextCalled) return result;
  }
  return { statusCode: 200, body: undefined, nextCalled: true };
}

const adminPrincipal = (adminRole) => ({
  role: "admin",
  accessType: "admin",
  adminRole,
  adminPermissionOverrides: [],
});

test("all legacy curriculum mutations enforce exactly one courses.manage permission gate", () => {
  const routes = routesFrom(curriculumRouter);
  assert.equal(routes.length, 6);
  for (const route of routes) {
    assert.equal(route.gates.length, 1, route.methods.join(",") + " " + route.path);
    for (const role of Object.keys(ADMIN_ROLE_PROFILES)) {
      const result = runGate(route.gates[0], adminPrincipal(role));
      const shouldAllow = ["super_admin", "platform_admin", "ai_content_manager"].includes(role);
      assert.equal(result.nextCalled, shouldAllow, role + " authorization for " + route.path);
      if (!shouldAllow) assert.equal(result.statusCode, 403);
    }
  }
});

test("legacy curriculum routes reject ordinary-user and mismatched access-type principals", () => {
  const [route] = routesFrom(curriculumRouter);
  for (const principal of [
    { role: "user", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: ["*"] },
    { role: "admin", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: [] },
  ]) {
    const result = runGate(route.gates[0], principal);
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
  }
});

test("AI course generation requires both courses.manage and ai.manage", () => {
  const routes = routesFrom(aiRouter).filter((route) => route.path === "/course" || route.path === "/course/save");
  assert.equal(routes.length, 2);
  for (const route of routes) {
    assert.deepEqual(route.methods, ["post"]);
    assert.equal(route.gates.length, 2, route.path);
    for (const role of Object.keys(ADMIN_ROLE_PROFILES)) {
      const result = runGateChain(route.gates, adminPrincipal(role));
      const shouldAllow = role === "super_admin" || role === "ai_content_manager";
      assert.equal(result.nextCalled, shouldAllow, role + " authorization for " + route.path);
      if (!shouldAllow) assert.equal(result.statusCode, 403);
    }
  }
});

test("AI course generation rejects ordinary users even with forged admin metadata", () => {
  const routes = routesFrom(aiRouter).filter((route) => route.path === "/course" || route.path === "/course/save");
  for (const route of routes) {
    const forged = {
      role: "user",
      accessType: "user",
      adminRole: "super_admin",
      adminPermissionOverrides: ["*"],
    };
    const result = runGateChain(route.gates, forged);
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
  }
});

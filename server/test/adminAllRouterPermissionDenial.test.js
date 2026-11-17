import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminMiddleware } from "../src/middleware/auth.js";
import { ADMIN_ROLE_PROFILES, hasAdminPermission } from "../src/utils/adminRbac.js";
import adminRouter from "../src/routes/admin.routes.js";
import adminProRouter from "../src/routes/adminPro.routes.js";
import curriculumRouter from "../src/routes/curriculum.routes.js";
import adminPricingRouter from "../src/routes/adminPricing.routes.js";
import adminTrialsRouter from "../src/routes/adminTrials.routes.js";
import savedViewRouter from "../src/routes/savedView.routes.js";

const routerFiles = [
  { name: "admin", router: adminRouter, url: new URL("../src/routes/admin.routes.js", import.meta.url), exceptions: new Set() },
  { name: "adminPro", router: adminProRouter, url: new URL("../src/routes/adminPro.routes.js", import.meta.url), exceptions: new Set(["GET /access"]) },
  { name: "curriculum", router: curriculumRouter, url: new URL("../src/routes/curriculum.routes.js", import.meta.url), exceptions: new Set() },
  { name: "adminPricing", router: adminPricingRouter, url: new URL("../src/routes/adminPricing.routes.js", import.meta.url), exceptions: new Set() },
  { name: "adminTrials", router: adminTrialsRouter, url: new URL("../src/routes/adminTrials.routes.js", import.meta.url), exceptions: new Set() },
  { name: "savedView", router: savedViewRouter, url: new URL("../src/routes/savedView.routes.js", import.meta.url), exceptions: new Set() },
];

function responseRecorder() {
  const result = { statusCode: 200, body: undefined, nextCalled: false };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

function runMiddleware(middleware, principal) {
  const res = responseRecorder();
  middleware({ user: { ...principal, userId: "admin-denial-test" } }, res, () => {
    res.result.nextCalled = true;
  });
  return res.result;
}

function parsePermissions(source, exceptions) {
  const records = new Map();
  const routePattern = /^\s*router\.(get|post|put|patch|delete)\(["']([^"']+)["'],\s*(.*)$/i;
  for (const line of source.split("\n")) {
    const match = line.match(routePattern);
    if (!match) continue;
    const key = match[1].toUpperCase() + " " + match[2];
    if (exceptions.has(key)) {
      records.set(key, null);
      continue;
    }
    const permissionMatch = match[3].match(/^adminPermissionMiddleware\(["']([^"']+)["']\)/);
    assert.ok(permissionMatch, "Missing literal permission declaration for " + key);
    records.set(key, permissionMatch[1]);
  }
  return records;
}

function routeKey(route) {
  const methods = Object.keys(route.methods || {}).filter((method) => route.methods[method]);
  assert.equal(methods.length, 1, "Expected a single HTTP method for each registered admin route");
  return methods[0].toUpperCase() + " " + route.path;
}

const routerInventory = await Promise.all(routerFiles.map(async (entry) => ({
  ...entry,
  source: await readFile(entry.url, "utf8")
})));

test("all six admin-capable routers mount authentication and the admin-role gate", () => {
  for (const entry of routerInventory) {
    const names = (entry.router.stack || [])
      .filter((layer) => !layer.route && typeof layer.handle === "function")
      .map((layer) => layer.handle.name);
    assert.ok(names.includes("authMiddleware"), entry.name + " must mount authMiddleware");
    assert.ok(names.includes("adminMiddleware"), entry.name + " must mount adminMiddleware");
  }
});

test("all mounted admin route permission declarations match their registered Express handlers", () => {
  let totalRoutes = 0;
  for (const entry of routerInventory) {
    const expected = parsePermissions(entry.source, entry.exceptions);
    const registered = (entry.router.stack || []).filter((layer) => layer.route);
    const actualKeys = registered.map((layer) => routeKey(layer.route));
    assert.equal(actualKeys.length, expected.size, entry.name + " source/Express route count mismatch");
    assert.deepEqual([...actualKeys].sort(), [...expected.keys()].sort(), entry.name + " source/Express route inventory mismatch");

    for (const layer of registered) {
      const key = routeKey(layer.route);
      const expectedPermission = expected.get(key);
      const gates = (layer.route.stack || [])
        .map((item) => item.handle)
        .filter((handler) => handler?.name === "requireAdminPermission");
      if (expectedPermission === null) {
        assert.deepEqual(gates, [], key + " is an explicit self-access exception");
      } else {
        assert.equal(gates.length, 1, key + " must have exactly one named permission gate");
      }
    }
    totalRoutes += registered.length;
  }
  assert.equal(totalRoutes, 139, "The complete admin-capable route surface must remain represented");
});

test("every mounted admin permission gate denies roles outside its permission profile", () => {
  let checked = 0;
  for (const entry of routerInventory) {
    const expected = parsePermissions(entry.source, entry.exceptions);
    for (const layer of (entry.router.stack || []).filter((item) => item.route)) {
      const key = routeKey(layer.route);
      const permission = expected.get(key);
      if (!permission) continue;
      const gate = layer.route.stack.map((item) => item.handle)
        .find((handler) => handler?.name === "requireAdminPermission");
      assert.ok(gate, "Expected actual permission middleware for " + key);

      for (const role of Object.keys(ADMIN_ROLE_PROFILES)) {
        const allowedByProfile = hasAdminPermission(role, permission);
        const result = runMiddleware(gate, {
          role: "admin",
          accessType: "admin",
          adminRole: role,
          adminPermissionOverrides: []
        });
        assert.equal(result.nextCalled, allowedByProfile, entry.name + " " + key + " " + role);
        if (!allowedByProfile) {
          assert.equal(result.statusCode, 403, entry.name + " " + key + " " + role + " must be denied");
          assert.equal(result.body?.details?.requiredPermission, permission);
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 800, "Expected role-denial coverage across all mounted admin route gates");
});

test("a valid, catalogued permission override is honored while unknown roles remain denied", () => {
  let checked = 0;
  for (const entry of routerInventory) {
    const expected = parsePermissions(entry.source, entry.exceptions);
    for (const layer of (entry.router.stack || []).filter((item) => item.route)) {
      const key = routeKey(layer.route);
      const permission = expected.get(key);
      if (!permission) continue;
      const gate = layer.route.stack.map((item) => item.handle)
        .find((handler) => handler?.name === "requireAdminPermission");
      const roleWithoutPermission = Object.keys(ADMIN_ROLE_PROFILES)
        .find((role) => !hasAdminPermission(role, permission));
      if (roleWithoutPermission) {
        const granted = runMiddleware(gate, {
          role: "admin",
          accessType: "admin",
          adminRole: roleWithoutPermission,
          adminPermissionOverrides: [permission]
        });
        assert.equal(granted.nextCalled, true, "A catalogued explicit override should grant " + permission);
      }
      const unknown = runMiddleware(gate, {
        role: "admin",
        accessType: "admin",
        adminRole: "unknown_role",
        adminPermissionOverrides: [permission, "*"]
      });
      assert.equal(unknown.nextCalled, false, "Unknown roles must fail closed for " + key);
      assert.equal(unknown.statusCode, 403);
      checked += 1;
    }
  }
  assert.ok(checked >= 130);
});

test("forged ordinary-user and mismatched access-type principals are denied by every mounted admin gate", () => {
  const invalidPrincipals = [
    { role: "user", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: ["*"] },
    { role: "user", accessType: "admin", adminRole: "super_admin", adminPermissionOverrides: ["*"] },
    { role: "admin", accessType: "user", adminRole: "super_admin", adminPermissionOverrides: ["*"] },
    { role: "admin", accessType: "admin", adminRole: "unknown_role", adminPermissionOverrides: ["*"] }
  ];
  for (const entry of routerInventory) {
    for (const layer of (entry.router.stack || []).filter((item) => item.route)) {
      const key = routeKey(layer.route);
      const permissionGate = layer.route.stack.map((item) => item.handle)
        .find((handler) => handler?.name === "requireAdminPermission");
      if (!permissionGate) continue;
      for (const principal of invalidPrincipals) {
        const result = runMiddleware(permissionGate, principal);
        assert.equal(result.nextCalled, false, entry.name + " " + key + " accepted forged principal");
        assert.equal(result.statusCode, 403, entry.name + " " + key);
      }
    }
  }
});

test("the shared admin-role middleware denies non-admin role or access-type combinations", () => {
  for (const principal of [
    { role: "user", accessType: "admin" },
    { role: "admin", accessType: "user" },
    { role: "admin", accessType: undefined },
    { role: "user", accessType: "user" }
  ]) {
    const result = runMiddleware(adminMiddleware, principal);
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
  }
});

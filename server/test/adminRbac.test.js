import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ROLE_PROFILES,
  ADMIN_PERMISSION_CATALOG,
  getAdminPermissions,
  hasAdminPermission,
  isAdminRoleProfile,
} from "../src/utils/adminRbac.js";

test("all six admin role profiles are declared", () => {
  assert.deepEqual(Object.keys(ADMIN_ROLE_PROFILES), [
    "super_admin", "platform_admin", "ai_content_manager",
    "finance_manager", "support_manager", "analyst_auditor",
  ]);
});

test("Super Admin has all catalogued permissions", () => {
  assert.deepEqual(getAdminPermissions("super_admin").sort(), [...ADMIN_PERMISSION_CATALOG].sort());
  assert.equal(hasAdminPermission("super_admin", "admin_roles.manage"), true);
});

test("Platform Administrator can operate users and courses but not finance or roles", () => {
  assert.equal(hasAdminPermission("platform_admin", "users.manage"), true);
  assert.equal(hasAdminPermission("platform_admin", "courses.publish"), true);
  assert.equal(hasAdminPermission("platform_admin", "refunds.manage"), false);
  assert.equal(hasAdminPermission("platform_admin", "plans.manage"), false);
  assert.equal(hasAdminPermission("platform_admin", "admin_roles.manage"), false);
});

test("AI content manager cannot access finance or administrator governance", () => {
  assert.equal(hasAdminPermission("ai_content_manager", "ai.manage"), true);
  assert.equal(hasAdminPermission("ai_content_manager", "resources.manage"), true);
  assert.equal(hasAdminPermission("ai_content_manager", "refunds.manage"), false);
  assert.equal(hasAdminPermission("ai_content_manager", "admin_roles.manage"), false);
});

test("Finance manager can manage plans and refunds but cannot publish courses", () => {
  assert.equal(hasAdminPermission("finance_manager", "plans.manage"), true);
  assert.equal(hasAdminPermission("finance_manager", "refunds.manage"), true);
  assert.equal(hasAdminPermission("finance_manager", "courses.publish"), false);
});

test("Support manager can investigate issues without executing refunds", () => {
  assert.equal(hasAdminPermission("support_manager", "payment_issues.manage"), true);
  assert.equal(hasAdminPermission("support_manager", "billing.read"), true);
  assert.equal(hasAdminPermission("support_manager", "refunds.manage"), false);
});

test("Analyst & Auditor is read-only", () => {
  assert.equal(hasAdminPermission("analyst_auditor", "analytics.read"), true);
  assert.equal(hasAdminPermission("analyst_auditor", "audit.read"), true);
  assert.equal(hasAdminPermission("analyst_auditor", "courses.manage"), false);
  assert.equal(hasAdminPermission("analyst_auditor", "communications.send"), false);
});

test("unknown roles and permissions fail closed", () => {
  assert.equal(isAdminRoleProfile("unknown"), false);
  assert.equal(hasAdminPermission("unknown", "dashboard.read"), false);
  assert.equal(hasAdminPermission("platform_admin", "unregistered.permission"), false);
  assert.equal(hasAdminPermission("super_admin", "unregistered.permission"), false);
});

test("explicit overrides can add a catalogued permission but cannot make unknown role valid", () => {
  assert.equal(hasAdminPermission("support_manager", "refunds.manage", ["refunds.manage"]), true);
  assert.equal(hasAdminPermission("unknown", "refunds.manage", ["refunds.manage"]), false);
  assert.equal(hasAdminPermission("support_manager", "not.registered", ["not.registered"]), false);
});

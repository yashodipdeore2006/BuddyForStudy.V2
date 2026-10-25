import test from "node:test";
import assert from "node:assert/strict";
import { selectAdminNotificationRecipients } from "../src/utils/adminNotificationRouting.js";

const admins = [
  { _id: "super", adminRole: "super_admin", adminPermissionOverrides: [] },
  { _id: "platform", adminRole: "platform_admin", adminPermissionOverrides: [] },
  { _id: "finance", adminRole: "finance_manager", adminPermissionOverrides: [] },
  { _id: "support", adminRole: "support_manager", adminPermissionOverrides: [] },
  { _id: "unknown", adminRole: "legacy_unknown_role", adminPermissionOverrides: [] }
];

test("refund alerts route to finance-authorized admins without broadening Platform Admin permissions", () => {
  assert.deepEqual(
    selectAdminNotificationRecipients(admins, "refunds.manage").map((admin) => admin._id),
    ["super", "finance"]
  );
});

test("payment issue alerts route to Support, Platform, and Super Admin roles", () => {
  assert.deepEqual(
    selectAdminNotificationRecipients(admins, "payment_issues.manage").map((admin) => admin._id),
    ["super", "platform", "support"]
  );
});

test("governance alerts require the explicit admin role management permission", () => {
  assert.deepEqual(
    selectAdminNotificationRecipients(admins, "admin_roles.manage").map((admin) => admin._id),
    ["super"]
  );
});

test("unknown permission, missing recipients, and invalid input fail closed", () => {
  assert.deepEqual(selectAdminNotificationRecipients(admins, "not.a.real.permission"), []);
  assert.deepEqual(selectAdminNotificationRecipients(null, "billing.read"), []);
  assert.deepEqual(selectAdminNotificationRecipients(admins, ""), []);
});

test("explicit permission overrides are respected for otherwise unauthorized roles", () => {
  const scoped = [{ _id: "support-grant", adminRole: "support_manager", adminPermissionOverrides: ["refunds.manage"] }];
  assert.deepEqual(selectAdminNotificationRecipients(scoped, "refunds.manage").map((admin) => admin._id), ["support-grant"]);
});

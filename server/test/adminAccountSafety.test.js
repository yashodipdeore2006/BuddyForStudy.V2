import test from "node:test";
import assert from "node:assert/strict";
import { validateAdminAccountChange } from "../src/utils/adminAccountSafety.js";

test("admin account safety blocks self-demotion and self-deactivation", () => {
  assert.equal(validateAdminAccountChange({
    actorId: "same", targetId: "same", targetRole: "admin", targetActive: true, requestedRole: "user"
  }).valid, false);
  assert.equal(validateAdminAccountChange({
    actorId: "same", targetId: "same", targetRole: "admin", targetActive: true, requestedActive: false
  }).valid, false);
});

test("admin account safety blocks removing the last active admin", () => {
  const result = validateAdminAccountChange({
    actorId: "actor", targetId: "target", targetRole: "admin", targetActive: true,
    requestedActive: false, activeAdminCount: 1
  });
  assert.deepEqual(result, { valid: false, status: 409, message: "At least one active admin account must remain" });
});

test("admin account safety permits removal when another active admin remains", () => {
  assert.deepEqual(validateAdminAccountChange({
    actorId: "actor", targetId: "target", targetRole: "admin", targetActive: true,
    requestedRole: "user", activeAdminCount: 2
  }), { valid: true });
});

test("admin account safety does not block changes that preserve admin access", () => {
  assert.deepEqual(validateAdminAccountChange({
    actorId: "actor", targetId: "target", targetRole: "admin", targetActive: true,
    requestedActive: true, activeAdminCount: 1
  }), { valid: true });
});

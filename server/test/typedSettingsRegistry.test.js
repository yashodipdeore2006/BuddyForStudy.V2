import test from "node:test";
import assert from "node:assert/strict";
import { getTypedSettingsRegistry, validateTypedSetting } from "../src/utils/typedSettingsRegistry.js";

test("typed settings registry exposes known operational settings with explicit types", () => {
  const registry = getTypedSettingsRegistry();
  assert.ok(registry.some((item) => item.key === "notification_email_enabled" && item.type === "boolean"));
  assert.ok(registry.some((item) => item.key === "learning_reminder_inactive_days" && item.type === "number" && item.minimum === 1 && item.maximum === 30));
});

test("registered settings reject type mismatches and out-of-range values", () => {
  assert.equal(validateTypedSetting("notification_email_enabled", "false").valid, false);
  assert.equal(validateTypedSetting("learning_reminder_inactive_days", 31).valid, false);
  assert.equal(validateTypedSetting("advanced_ai_questions_per_hour_video", 1.5).valid, false);
  assert.equal(validateTypedSetting("advanced_ai_questions_per_hour_video", 10).valid, true);
});

test("unregistered custom settings remain backward-compatible", () => {
  assert.equal(validateTypedSetting("custom_internal_setting", { enabled: true }).valid, true);
});

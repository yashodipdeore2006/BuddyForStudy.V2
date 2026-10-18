import test from "node:test";
import assert from "node:assert/strict";
import { validateAdminAudienceInput } from "../src/services/adminAudience.service.js";

test("audience targeting accepts a bounded set of selected registered email addresses", () => {
  assert.equal(validateAdminAudienceInput({ emails: ["learner@example.com", "second@example.com"] }), true);
});

test("audience targeting rejects malformed selected emails", () => {
  assert.throws(() => validateAdminAudienceInput({ emails: ["not-an-email"] }), /email addresses are invalid/i);
});

test("audience targeting rejects more than 500 selected recipients", () => {
  assert.throws(() => validateAdminAudienceInput({ emails: Array.from({ length: 501 }, (_, index) => `user${index}@example.com`) }), /at most 500/i);
});

test("audience targeting rejects malformed selected user IDs", () => {
  assert.throws(() => validateAdminAudienceInput({ userIds: ["not-an-object-id"] }), /IDs are invalid/i);
});

test("audience targeting rejects mixing explicit recipients with filters", () => {
  assert.throws(() => validateAdminAudienceInput({ emails: ["learner@example.com"], filters: { status: "active" } }), /not multiple targeting modes/i);
});

test("audience targeting rejects empty custom filters instead of falling back to all users", () => {
  assert.throws(() => validateAdminAudienceInput({ filters: { q: "", status: "" } }), /at least one valid audience filter/i);
});

test("audience targeting rejects unsupported account status and role filters", () => {
  assert.throws(() => validateAdminAudienceInput({ filters: { status: "anything" } }), /account status/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { role: "owner" } }), /account role/i);
});

test("audience targeting rejects impossible progress ranges and invalid date ranges", () => {
  assert.throws(() => validateAdminAudienceInput({ filters: { progressMin: 90, progressMax: 20 } }), /cannot exceed/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { registeredAfter: "2026-10-20", registeredBefore: "2026-10-01" } }), /cannot be later/i);
});

test("audience targeting rejects invalid inactivity windows", () => {
  assert.throws(() => validateAdminAudienceInput({ filters: { inactiveDays: 0 } }), /inactiveDays must be an integer/i);
});

test("audience targeting validates paid spend and enrolled-course thresholds", () => {
  assert.equal(validateAdminAudienceInput({ filters: { totalSpendMin: 5000, courseCountMin: 4 } }), true);
  assert.throws(() => validateAdminAudienceInput({ filters: { totalSpendMin: -1 } }), /totalSpendMin must be between/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { courseCountMin: 1.5 } }), /courseCountMin must be an integer/i);
});

test("audience targeting only accepts predefined plan and course segments", () => {
  assert.equal(validateAdminAudienceInput({ filters: { planSegment: "premium", courseSegment: "popular" } }), true);
  assert.throws(() => validateAdminAudienceInput({ filters: { planSegment: "unknown" } }), /Invalid plan segment/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { courseSegment: "unknown" } }), /Invalid course segment/i);
});

test("audience targeting validates subscription and course filter identifiers", () => {
  assert.throws(() => validateAdminAudienceInput({ filters: { planId: "bad-id" } }), /Invalid planId/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { courseId: "bad-id" } }), /Invalid courseId/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  getReminderClock, isWithinQuietHours, isReminderHourDue, hasBeenInactive, learningReminderEventKey,
  getSubscriptionExpiryReminderWindow, subscriptionExpiryReminderEventKey
} from "../src/services/reminderScheduling.js";

test("reminder hour follows the learner's timezone", () => {
  const now = new Date("2026-10-14T12:30:00.000Z");
  assert.equal(getReminderClock(now, "Asia/Kolkata").hour, 18);
  assert.equal(isReminderHourDue(now, "Asia/Kolkata", 18, 22, 8), true);
  assert.equal(isReminderHourDue(now, "America/New_York", 18, 22, 8), false);
});

test("quiet hours spanning midnight block late-night and early-morning delivery", () => {
  assert.equal(isWithinQuietHours(23, 22, 8), true);
  assert.equal(isWithinQuietHours(4, 22, 8), true);
  assert.equal(isWithinQuietHours(18, 22, 8), false);
  assert.equal(isReminderHourDue(new Date("2026-10-14T23:00:00Z"), "UTC", 23, 22, 8), false);
});

test("invalid timezone falls back to UTC and the local date key is stable", () => {
  const now = new Date("2026-10-14T18:10:00.000Z");
  assert.deepEqual(getReminderClock(now, "Definitely/Not_A_Timezone"), {
    year: "2026", month: "10", day: "14", hour: 18, dateKey: "2026-10-14"
  });
  assert.equal(learningReminderEventKey("user-1", "2026-10-14"), "learning-reminder:user-1:2026-10-14");
});

test("inactivity threshold is inclusive and rejects invalid activity times", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  assert.equal(hasBeenInactive(now, new Date("2026-10-11T12:00:00.000Z"), 3), true);
  assert.equal(hasBeenInactive(now, new Date("2026-10-11T12:00:01.000Z"), 3), false);
  assert.equal(hasBeenInactive(now, "unknown", 3), false);
  assert.equal(hasBeenInactive(now, null, 3), false);
});


test("subscription expiry reminder window tolerates worker drift and caps the configured lead time", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  const window = getSubscriptionExpiryReminderWindow(now, 3, 60 * 60 * 1000);
  assert.equal(window.start.toISOString(), "2026-10-17T11:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-10-17T13:00:00.000Z");
  assert.equal(getSubscriptionExpiryReminderWindow(now, 99).end.getTime() - now.getTime(), 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
});

test("subscription expiry event keys are stable per provider period", () => {
  const periodEnd = new Date("2026-10-20T08:00:00.000Z");
  assert.equal(
    subscriptionExpiryReminderEventKey("sub_123", periodEnd),
    "subscription-expiring:sub_123:2026-10-20T08:00:00.000Z"
  );
  assert.notEqual(
    subscriptionExpiryReminderEventKey("sub_123", periodEnd),
    subscriptionExpiryReminderEventKey("sub_123", new Date("2026-11-20T08:00:00.000Z"))
  );
});

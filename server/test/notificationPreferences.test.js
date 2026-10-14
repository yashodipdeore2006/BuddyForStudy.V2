import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserNotificationPreferences } from "../src/services/notification.service.js";

test("email product updates default to off for new users", () => {
  const preferences = normalizeUserNotificationPreferences(null, "user-1");
  assert.equal(preferences.emailAnnouncements, false);
  assert.equal(preferences.pushEnabled, false);
});

test("legacy enabled preference without recorded consent is treated as opted out", () => {
  const preferences = normalizeUserNotificationPreferences({
    user: "user-2",
    emailAnnouncements: true,
    inAppAnnouncements: true
  }, "user-2");
  assert.equal(preferences.emailAnnouncements, false);
  assert.equal(preferences.inAppAnnouncements, true);
});

test("a stored explicit opt-in is respected", () => {
  const preferences = normalizeUserNotificationPreferences({
    user: "user-3",
    emailAnnouncements: true,
    emailAnnouncementsConsentAt: new Date("2026-10-14T12:00:00Z")
  }, "user-3");
  assert.equal(preferences.emailAnnouncements, true);
});

test("explicit opt-out remains off even if a stale consent timestamp exists", () => {
  const preferences = normalizeUserNotificationPreferences({
    user: "user-4",
    emailAnnouncements: false,
    emailAnnouncementsConsentAt: new Date("2026-10-14T12:00:00Z")
  }, "user-4");
  assert.equal(preferences.emailAnnouncements, false);
});

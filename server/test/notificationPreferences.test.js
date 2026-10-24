import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserNotificationPreferences, createEmailUnsubscribeToken, verifyEmailUnsubscribeToken } from "../src/services/notification.service.js";

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


test("promotional email unsubscribe tokens are signed, user-bound, and expiring", () => {
  const userId = "507f1f77bcf86cd799439011";
  const token = createEmailUnsubscribeToken(userId, Date.now() + 60_000);
  assert.equal(verifyEmailUnsubscribeToken(token)?.userId, userId);
  assert.equal(verifyEmailUnsubscribeToken(`${token}tampered`), null);
  assert.equal(verifyEmailUnsubscribeToken(token, Date.now() + 120_000), null);
  assert.equal(verifyEmailUnsubscribeToken("invalid-token"), null);
});

test("unsubscribe token creation rejects malformed user IDs", () => {
  assert.throws(() => createEmailUnsubscribeToken("not-an-object-id"), /valid user ID/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserNotificationPreferences, createEmailUnsubscribeToken, verifyEmailUnsubscribeToken, isNotificationEmailAllowed } from "../src/services/notification.service.js";

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


test("mark-read endpoint reports whether it performed the unread transition", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const controller = fs.readFileSync(path.join(here, "../src/controllers/notification.controller.js"), "utf8");
  const userPage = fs.readFileSync(path.join(here, "../../src/pages/Notifications.tsx"), "utf8");
  const adminPage = fs.readFileSync(path.join(here, "../../src/pages/admin/AdminNotifications.tsx"), "utf8");
  assert.match(controller, /user: req\.user\.userId, readAt: null/);
  assert.match(controller, /wasUnread: true/);
  assert.match(controller, /wasUnread: false/);
  assert.match(userPage, /if \(data\.wasUnread === true\) setUnreadCount/);
  assert.match(adminPage, /if \(data\.wasUnread === true\) setUnreadCount/);
});

test("notification links allow only same-origin application paths", async () => {
  const { normalizeNotificationLink } = await import("../src/services/notification.service.js");
  assert.equal(normalizeNotificationLink("/courses/course-1"), "/courses/course-1");
  assert.equal(normalizeNotificationLink("/learn/course-1/lesson-2?tab=notes#content"), "/learn/course-1/lesson-2?tab=notes#content");
  assert.equal(normalizeNotificationLink("https://attacker.example/phishing"), "/notifications");
  assert.equal(normalizeNotificationLink("//attacker.example/phishing"), "/notifications");
  assert.equal(normalizeNotificationLink("/\\\\attacker.example/phishing"), "/notifications");
  assert.equal(normalizeNotificationLink("javascript:alert(1)"), "/notifications");
  assert.equal(normalizeNotificationLink(""), "/notifications");
});


test("notification email consent is category-specific while billing and security remain transactional", () => {
  assert.equal(isNotificationEmailAllowed("promotion", { emailAnnouncements: false }), false);
  assert.equal(isNotificationEmailAllowed("promotion", { emailAnnouncements: true, emailAnnouncementsConsentAt: null }), false);
  assert.equal(isNotificationEmailAllowed("promotion", { emailAnnouncements: true, emailAnnouncementsConsentAt: new Date() }), true);
  assert.equal(isNotificationEmailAllowed("course", { emailCourseUpdates: false }), false);
  assert.equal(isNotificationEmailAllowed("learning", { emailLearningReminders: false }), false);
  assert.equal(isNotificationEmailAllowed("billing", { emailAnnouncements: false }), true);
  assert.equal(isNotificationEmailAllowed("security", { emailCourseUpdates: false }), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { Notification } from "../src/models/Notification.js";
import { NotificationPreference } from "../src/models/NotificationPreference.js";
import { UserConsentEvent } from "../src/models/UserConsentEvent.js";
import { User } from "../src/models/User.js";
import { list, markRead, markAllRead, updatePreferences, isPushSubscriptionOwnedByUser } from "../src/controllers/notification.controller.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("notification list bounds limits to integers and defaults invalid input safely", async () => {
  const cases = [
    { input: "3.9", expected: 3 },
    { input: "999", expected: 100 },
    { input: "0", expected: 50 },
    { input: "invalid", expected: 50 }
  ];

  for (const { input, expected } of cases) {
    let appliedLimit;
    const query = {
      sort() { return this; },
      limit(value) { appliedLimit = value; return this; },
      async lean() { return []; }
    };
    const res = responseRecorder();

    await withMocks([
      [Notification, {
        find: () => query,
        countDocuments: async () => 7
      }]
    ], async () => {
      await list({ query: { limit: input }, user: { userId: "user-1" } }, res, (error) => { throw error; });
    });

    assert.equal(appliedLimit, expected, `limit input ${input}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.unreadCount, 7);
  }
});


test("notification list normalizes legacy external links before returning them to the learner", async () => {
  const notification = {
    _id: "507f1f77bcf86cd799439012",
    title: "Account update",
    message: "A notification",
    link: "https://attacker.example/phishing"
  };
  const query = {
    sort() { return this; },
    limit() { return this; },
    lean: async () => [notification]
  };
  const res = responseRecorder();
  await withMocks([
    [Notification, {
      find: () => query,
      countDocuments: async () => 1
    }]
  ], async () => {
    await list({ query: {}, user: { userId: "507f1f77bcf86cd799439011" } }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notifications[0].link, "/notifications");
  assert.equal(notification.link, "https://attacker.example/phishing");
});

test("mark-read only decrements unread count for the request that changes unread to read", async () => {
  const notificationId = "507f1f77bcf86cd799439012";
  const userId = "507f1f77bcf86cd799439011";
  const existing = { _id: notificationId, user: userId, readAt: new Date("2026-10-28T12:00:00Z") };
  const updateFilters = [];
  let firstUpdate = true;
  await withMocks([
    [Notification, {
      findOneAndUpdate: (filter) => {
        updateFilters.push(filter);
        return { lean: async () => {
          if (!firstUpdate) return null;
          firstUpdate = false;
          return existing;
        } };
      },
      findOne: (filter) => ({ lean: async () => {
        assert.deepEqual(filter, { _id: notificationId, user: userId });
        return existing;
      } })
    }]
  ], async () => {
    const first = responseRecorder();
    await markRead({ params: { notificationId }, user: { userId } }, first, (error) => { throw error; });
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.wasUnread, true);

    const retry = responseRecorder();
    await markRead({ params: { notificationId }, user: { userId } }, retry, (error) => { throw error; });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.wasUnread, false);
  });

  assert.equal(updateFilters.length, 2);
  for (const filter of updateFilters) {
    assert.deepEqual(filter, { _id: notificationId, user: userId, readAt: null });
  }
});

test("mark-all-read updates only the authenticated user's visible unread notifications", async () => {
  const userId = "507f1f77bcf86cd799439011";
  let capturedFilter;
  let capturedUpdate;
  const res = responseRecorder();
  await withMocks([
    [Notification, {
      updateMany: async (filter, update) => {
        capturedFilter = filter;
        capturedUpdate = update;
        return { modifiedCount: 3 };
      }
    }]
  ], async () => {
    await markAllRead({ user: { userId } }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.updated, 3);
  assert.deepEqual(capturedFilter, { user: userId, showInApp: { $ne: false }, readAt: null });
  assert.ok(capturedUpdate.$set.readAt instanceof Date);
});

test("notification preferences persist category-specific email and in-app channels", async () => {
  let capturedUpdate;
  const preferenceStorage = {
    findOne: () => ({
      select() { return this; },
      lean: async () => null
    }),
    findOneAndUpdate: (_filter, update) => {
      capturedUpdate = update;
      return { lean: async () => ({ user: "507f1f77bcf86cd799439011", ...(update.$setOnInsert || {}), ...(update.$set || {}) }) };
    }
  };
  const res = responseRecorder();
  await withMocks([
    [NotificationPreference, preferenceStorage],
    [User, { updateOne: async () => ({ acknowledged: true, modifiedCount: 1 }) }],
    [UserConsentEvent, { create: async () => { throw new Error("Non-marketing preferences must not create a consent event"); } }]
  ], async () => {
    await updatePreferences({
      body: {
        emailCourseUpdates: false,
        inAppCourseUpdates: true,
        emailProjectUpdates: false,
        inAppProjectUpdates: true,
        emailAnnouncements: false,
        inAppAnnouncements: true
      },
      user: { userId: "507f1f77bcf86cd799439011" }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(capturedUpdate.$set.emailCourseUpdates, false);
  assert.equal(capturedUpdate.$set.inAppCourseUpdates, true);
  assert.equal(capturedUpdate.$set.emailProjectUpdates, false);
  assert.equal(capturedUpdate.$set.inAppProjectUpdates, true);
  assert.equal(capturedUpdate.$set.emailAnnouncements, false);
  assert.equal(capturedUpdate.$set.inAppAnnouncements, true);
});

test("push endpoint ownership guard prevents cross-account reassignment", () => {
  assert.equal(isPushSubscriptionOwnedByUser(null, "user-1"), true);
  assert.equal(isPushSubscriptionOwnedByUser({ user: "user-1" }, "user-1"), true);
  assert.equal(isPushSubscriptionOwnedByUser({ user: { toString: () => "user-1" } }, "user-1"), true);
  assert.equal(isPushSubscriptionOwnedByUser({ user: "user-2" }, "user-1"), false);
});


function mockPreferenceStorage() {
  return {
    findOne: () => ({ lean: async () => null }),
    findOneAndUpdate: (_filter, update) => ({
      lean: async () => ({
        user: "507f1f77bcf86cd799439011",
        ...(update.$setOnInsert || {}),
        ...(update.$set || {})
      })
    })
  };
}

test("saving general notification settings does not create a push consent event", async () => {
  let consentEvents = 0;
  const res = responseRecorder();
  await withMocks([
    [NotificationPreference, mockPreferenceStorage()],
    [UserConsentEvent, { create: async () => { consentEvents += 1; return {}; } }]
  ], async () => {
    await updatePreferences({
      body: { emailCourseUpdates: false },
      user: { userId: "507f1f77bcf86cd799439011" }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(consentEvents, 0);
});

test("explicit push enable/disable preferences create push consent audit events", async () => {
  const events = [];
  const res = responseRecorder();
  await withMocks([
    [NotificationPreference, mockPreferenceStorage()],
    [UserConsentEvent, { create: async (event) => { events.push(event); return event; } }]
  ], async () => {
    await updatePreferences({
      body: { pushEnabled: true },
      user: { userId: "507f1f77bcf86cd799439011" }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "push_notifications");
  assert.equal(events[0].accepted, true);
  assert.equal(events[0].source, "settings");
});

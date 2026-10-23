import test from "node:test";
import assert from "node:assert/strict";
import { Notification } from "../src/models/Notification.js";
import { NotificationPreference } from "../src/models/NotificationPreference.js";
import { UserConsentEvent } from "../src/models/UserConsentEvent.js";
import { list, updatePreferences, isPushSubscriptionOwnedByUser } from "../src/controllers/notification.controller.js";

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
        countDocuments: async () => 0
      }]
    ], async () => {
      await list({ query: { limit: input }, user: { userId: "user-1" } }, res, (error) => { throw error; });
    });

    assert.equal(appliedLimit, expected, `limit input ${input}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  }
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

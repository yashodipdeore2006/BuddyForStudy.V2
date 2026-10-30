import test from "node:test";
import assert from "node:assert/strict";
import { Notification } from "../src/models/Notification.js";
import { NotificationPreference } from "../src/models/NotificationPreference.js";
import { dispatchEmail } from "../src/services/notification.service.js";

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

function deliveryQuery(notification) {
  return { populate: async () => notification };
}

const platform = { emailEnabled: true, emailRetryAttempts: 3 };

test("SMTP failure remains retryable before the configured final attempt", async () => {
  const updates = [];
  let claimFilter;
  const notification = {
    _id: "507f1f77bcf86cd799439012",
    type: "billing",
    title: "Receipt",
    message: "Payment received",
    link: "/billing",
    emailSubject: "Receipt",
    emailAttempts: 1,
    user: { _id: "507f1f77bcf86cd799439011", email: "learner@example.test" }
  };

  await withMocks([
    [Notification, {
      findOneAndUpdate: (filter) => {
        claimFilter = filter;
        return deliveryQuery(notification);
      },
      updateOne: async (_filter, update) => { updates.push(update); return { modifiedCount: 1 }; }
    }],
    [NotificationPreference, { findOne: () => ({ lean: async () => null }) }]
  ], async () => {
    const result = await dispatchEmail(notification._id, {
      platform,
      mailer: { sendMail: async () => { throw new Error("temporary SMTP outage"); } }
    });
    assert.deepEqual(result, { status: "retrying" });
  });

  assert.equal(claimFilter.emailAttempts.$lt, 3);
  assert.equal(updates.at(-1).$set.emailStatus, "pending");
  assert.ok(updates.at(-1).$set.emailError.length > 0);
});

test("SMTP failure on the final configured attempt becomes terminal", async () => {
  const updates = [];
  const notification = {
    _id: "507f1f77bcf86cd799439013",
    type: "billing",
    title: "Receipt",
    message: "Payment received",
    link: "/billing",
    emailSubject: "Receipt",
    emailAttempts: 3,
    user: { _id: "507f1f77bcf86cd799439011", email: "learner@example.test" }
  };

  await withMocks([
    [Notification, {
      findOneAndUpdate: () => deliveryQuery(notification),
      updateOne: async (_filter, update) => { updates.push(update); return { modifiedCount: 1 }; }
    }],
    [NotificationPreference, { findOne: () => ({ lean: async () => null }) }]
  ], async () => {
    const result = await dispatchEmail(notification._id, {
      platform,
      mailer: { sendMail: async () => { throw new Error("permanent SMTP rejection"); } }
    });
    assert.deepEqual(result, { status: "failed" });
  });

  assert.equal(updates.at(-1).$set.emailStatus, "failed");
});

test("email delivery is suppressed when platform email delivery is disabled", async () => {
  let sendCalls = 0;
  const result = await dispatchEmail("507f1f77bcf86cd799439014", {
    platform: { ...platform, emailEnabled: false },
    mailer: { sendMail: async () => { sendCalls += 1; } }
  });
  assert.deepEqual(result, { status: "skipped" });
  assert.equal(sendCalls, 0);
});

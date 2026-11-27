import test from "node:test";
import assert from "node:assert/strict";
import { Payment } from "../src/models/Payment.js";
import { Enrollment } from "../src/models/Enrollment.js";
import {
  reconcilePendingCoursePurchaseNotifications,
  reconcilePendingSubscriptionActivationNotifications
} from "../src/services/notification.service.js";

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
    for (const { target, key, original } of originals.reverse()) {
      target[key] = original;
    }
  }
}

function query(rows, observed) {
  return {
    sort(value) { observed.sorts.push(value); return this; },
    limit(value) { observed.limits.push(value); return this; },
    select() { return this; },
    populate() { return this; },
    lean: async () => rows
  };
}

const now = new Date("2026-11-18T12:00:00.000Z");

test("inline course-purchase reconciliation processes one fair page and stops", async () => {
  const observed = { sorts: [], limits: [], updates: [] };
  const payments = Array.from({ length: 10 }, (_, index) => ({
    _id: "payment-" + index,
    user: "user-" + index,
    course: { _id: "course-" + index, title: "Course " + index }
  }));

  await withMocks([
    [Payment, {
      findOne: () => query({ _id: "payment-9" }, observed),
      find: () => query(payments, observed),
      updateOne: async (...args) => { observed.updates.push(args); return { modifiedCount: 1 }; }
    }],
    [Enrollment, {
      findOne: () => ({ lean: async () => null })
    }]
  ], async () => {
    const result = await reconcilePendingCoursePurchaseNotifications(now, 10, {
      maxPages: 1,
      fair: true
    });

    assert.equal(result.checked, 10);
    assert.equal(result.waitingForEnrollment, 10);
    assert.equal(result.failures, 0);
  });

  assert.ok(observed.sorts.some((sort) =>
    sort.purchaseNotificationLastCheckedAt === 1 && sort._id === 1
  ));
  assert.equal(observed.limits.at(-1), 10);
  assert.equal(observed.updates.length, 10);
  assert.ok(observed.updates.every(([, update]) =>
    update.$set.purchaseNotificationLastCheckedAt.toISOString() === now.toISOString()
  ));
});

test("inline subscription-activation reconciliation processes one fair page and stops", async () => {
  const observed = { sorts: [], limits: [], updates: [] };
  const payments = Array.from({ length: 10 }, (_, index) => ({
    _id: "subscription-payment-" + index,
    user: "user-" + index,
    providerOrderId: "",
    plan: null
  }));

  await withMocks([
    [Payment, {
      findOne: () => query({ _id: "subscription-payment-9" }, observed),
      find: () => query(payments, observed),
      updateOne: async (...args) => { observed.updates.push(args); return { modifiedCount: 1 }; }
    }]
  ], async () => {
    const result = await reconcilePendingSubscriptionActivationNotifications(now, 10, {
      maxPages: 1,
      fair: true
    });

    assert.equal(result.checked, 10);
    assert.equal(result.waitingForActive, 0);
    assert.equal(result.failures, 10);
  });

  assert.ok(observed.sorts.some((sort) =>
    sort.subscriptionNotificationLastCheckedAt === 1 && sort._id === 1
  ));
  assert.equal(observed.limits.at(-1), 10);
  assert.equal(observed.updates.length, 10);
  assert.ok(observed.updates.every(([, update]) =>
    update.$set.subscriptionNotificationLastCheckedAt.toISOString() === now.toISOString()
  ));
});

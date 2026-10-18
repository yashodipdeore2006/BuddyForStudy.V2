import test from "node:test";
import assert from "node:assert/strict";
import { Payment } from "../src/models/Payment.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { WebhookEvent } from "../src/models/WebhookEvent.js";
import { subscriptionEventFreshnessFilter, subscriptionEventTimestamp } from "../src/services/subscriptionWebhookTransitions.js";

test("Razorpay provider payment IDs have a database-level uniqueness guard", () => {
  const index = Payment.schema.indexes().find(([keys, options]) =>
    keys.provider === 1 && keys.providerPaymentId === 1 && options.unique === true
  );
  assert.ok(index, "Expected unique provider/payment ID index");
  assert.deepEqual(index[0], { provider: 1, providerPaymentId: 1 });
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    provider: "razorpay",
    providerPaymentId: { $type: "string", $gt: "" }
  });
});

test("subscription event ordering metadata is private but queryable", () => {
  const field = UserSubscription.schema.path("providerEventAt");
  assert.ok(field);
  assert.equal(field.options.select, false);
});

test("an older cancellation event cannot match a subscription updated by a newer activation", () => {
  const newerActivation = subscriptionEventTimestamp({ created_at: 1792324802 });
  const olderCancellation = subscriptionEventTimestamp({ created_at: 1792324801 });
  const filter = subscriptionEventFreshnessFilter(olderCancellation);
  assert.equal(newerActivation > olderCancellation, true);
  assert.equal(filter.$or.some((clause) => clause.providerEventAt?.$lt === olderCancellation), true);
  assert.equal(filter.$or.some((clause) => clause.providerEventAt?.$lte === olderCancellation), false);
});

test("conflicting events from the same provider second are deliberately first-applied-wins", () => {
  const activation = subscriptionEventTimestamp({ created_at: 1792324800 });
  const cancellation = subscriptionEventTimestamp({ created_at: 1792324800 });
  assert.equal(activation.getTime(), cancellation.getTime());
  const filter = subscriptionEventFreshnessFilter(cancellation);
  assert.equal(filter.$or.some((clause) => clause.providerEventAt?.$lt === cancellation), true);
  assert.equal(filter.$or.some((clause) => clause.providerEventAt?.$lte === cancellation), false);
});

test("events without timestamps cannot change a timestamped subscription or trigger guarded transition notifications", () => {
  const filter = subscriptionEventFreshnessFilter(null);
  assert.deepEqual(filter, {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null }
    ]
  });
});

import { SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES, TERMINAL_PAYMENT_STATUSES } from "../src/services/subscriptionWebhookTransitions.js";

test("activation webhooks cannot revive refunded, partially refunded, or cancelled payments", () => {
  assert.deepEqual(SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES, ["created", "pending", "paid", "failed"]);
  for (const terminalStatus of TERMINAL_PAYMENT_STATUSES) {
    assert.equal(SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES.includes(terminalStatus), false);
  }
  assert.deepEqual(TERMINAL_PAYMENT_STATUSES, ["refunded", "partially_refunded", "cancelled"]);
});

test("webhook event IDs have a unique database index for concurrent delivery claims", () => {
  const index = WebhookEvent.schema.indexes().find(([keys, options]) =>
    keys.eventId === 1 && options.unique === true
  );
  assert.ok(index, "Expected a unique webhook event ID index");
  assert.deepEqual(index[0], { eventId: 1 });
  assert.equal(index[1].unique, true);
});

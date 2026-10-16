import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Notification } from "../src/models/Notification.js";
import { Payment } from "../src/models/Payment.js";
import { WebhookEvent } from "../src/models/WebhookEvent.js";

test("notification event keys are unique per user when an event key is present", () => {
  const eventIndex = Notification.schema.indexes().find(([keys]) =>
    keys.user === 1 && keys.eventKey === 1
  );
  assert.ok(eventIndex, "user/eventKey index should exist");
  assert.equal(eventIndex[1].unique, true);
  assert.deepEqual(eventIndex[1].partialFilterExpression, {
    eventKey: { $type: "string" }
  });
});

test("Razorpay webhook event IDs are unique to prevent duplicate processing", () => {
  const eventIndex = WebhookEvent.schema.indexes().find(([keys]) => keys.eventId === 1);
  assert.ok(eventIndex, "eventId index should exist");
  assert.equal(eventIndex[1].unique, true);
});

test("new notifications receive a stable UUIDv4 push idempotency key", () => {
  const notification = new Notification({
    user: new mongoose.Types.ObjectId(),
    title: "Test notice",
    message: "Test message"
  });
  assert.match(
    notification.pushIdempotencyKey,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test("subscription outbox state is independent from course purchase outbox state", () => {
  const payment = new Payment({
    user: new mongoose.Types.ObjectId(),
    amount: 0
  });
  assert.equal(payment.purchaseNotificationStatus, "not_applicable");
  assert.equal(payment.subscriptionNotificationStatus, "not_applicable");

  payment.purchaseNotificationStatus = "queued";
  payment.subscriptionNotificationStatus = "pending";
  assert.equal(payment.purchaseNotificationStatus, "queued");
  assert.equal(payment.subscriptionNotificationStatus, "pending");
  assert.ok(Payment.schema.path("subscriptionNotificationLastCheckedAt"));
  assert.ok(Payment.schema.path("subscriptionNotificationQueuedAt"));
});

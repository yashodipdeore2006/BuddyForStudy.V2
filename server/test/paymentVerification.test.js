import test from "node:test";
import assert from "node:assert/strict";
import { capturedPaymentValidationError } from "../src/services/paymentVerification.js";

const payment = {
  providerOrderId: "order_123",
  amount: 499,
  currency: "INR"
};

const captured = {
  order_id: "order_123",
  status: "captured",
  amount: 49900,
  currency: "INR"
};

test("only a captured provider payment matching order, amount, and currency is valid", () => {
  assert.equal(capturedPaymentValidationError(payment, captured), null);
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, status: "authorized" }),
    "Payment has not been captured"
  );
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, status: "failed" }),
    "Payment has not been captured"
  );
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, status: "created" }),
    "Payment has not been captured"
  );
});

test("provider payment for a different order is rejected", () => {
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, order_id: "order_other" }),
    "Provider payment order mismatch"
  );
});

test("provider amount must match the stored payment amount in minor units", () => {
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, amount: 49999 }),
    "Payment amount mismatch"
  );
});

test("provider currency comparison is case-insensitive but must match", () => {
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, currency: "inr" }),
    null
  );
  assert.equal(
    capturedPaymentValidationError(payment, { ...captured, currency: "USD" }),
    "Payment currency mismatch"
  );
});

import { CAPTURED_PAYMENT_SOURCE_STATUSES, FAILED_PAYMENT_SOURCE_STATUSES } from "../src/services/paymentWebhookTransitions.js";

test("captured webhooks can recover failed attempts but never rewrite refunded payments", () => {
  assert.deepEqual(CAPTURED_PAYMENT_SOURCE_STATUSES, ["created", "pending", "failed"]);
  for (const terminalStatus of ["paid", "refunded", "partially_refunded", "cancelled"]) {
    assert.equal(CAPTURED_PAYMENT_SOURCE_STATUSES.includes(terminalStatus), false);
  }
});

test("failed webhooks cannot overwrite successful or refunded payment states", () => {
  assert.deepEqual(FAILED_PAYMENT_SOURCE_STATUSES, ["created", "pending"]);
  for (const protectedStatus of ["paid", "failed", "refunded", "partially_refunded", "cancelled"]) {
    assert.equal(FAILED_PAYMENT_SOURCE_STATUSES.includes(protectedStatus), false);
  }
});

test("subscription checkout rejects a pending checkout for a different plan", async () => {
  const { readFile } = await import("node:fs/promises");
  const controller = await readFile("src/controllers/payment.controller.js", "utf8");
  const start = controller.indexOf("const pendingCheckout = await Payment.findOne");
  const end = controller.indexOf("const intervalMap =", start);
  assert.ok(start >= 0 && end > start, "pending subscription checkout block should exist");
  const block = controller.slice(start, end);
  assert.match(block, /pendingPlanId/);
  assert.match(block, /pendingPlanId !== String\(plan\._id\)/);
  assert.match(block, /different subscription plan is already pending/);
  assert.ok(
    block.indexOf("pendingPlanId !== String(plan._id)") < block.indexOf("Existing subscription checkout reused"),
    "the requested plan must be checked before reusing a pending checkout"
  );
});

test("course and subscription checkout creation is serialized before provider calls", async () => {
  const { readFile } = await import("node:fs/promises");
  const controller = await readFile("src/controllers/payment.controller.js", "utf8");
  const courseStart = controller.indexOf("export async function createCourseOrder");
  const courseEnd = controller.indexOf("export async function verifyCoursePayment", courseStart);
  const subscriptionStart = controller.indexOf("export async function createSubscriptionOrder");
  assert.ok(courseStart >= 0 && courseEnd > courseStart);
  assert.ok(subscriptionStart >= 0);
  const course = controller.slice(courseStart, courseEnd);
  const subscription = controller.slice(subscriptionStart);
  assert.ok(course.indexOf('acquireCheckoutLock(lockKey)') < course.indexOf("razorpay.createOrder("));
  assert.ok(course.indexOf("const pendingCourseCheckout = await Payment.findOne") < course.indexOf("razorpay.createOrder("));
  assert.ok(course.indexOf("Existing course checkout reused") < course.indexOf("razorpay.createOrder("));
  assert.ok(course.indexOf('releaseCheckoutLock(lockKey, lockToken)') > course.indexOf("razorpay.createOrder("));
  assert.ok(subscription.indexOf('acquireCheckoutLock(lockKey)') < subscription.indexOf("razorpay.createSubscription("));
  assert.ok(subscription.indexOf('releaseCheckoutLock(lockKey, lockToken)') > subscription.indexOf("razorpay.createSubscription("));
});


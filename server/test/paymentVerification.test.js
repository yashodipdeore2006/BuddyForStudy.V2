import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("course payment webhook reconciles captured payment before marking it paid", () => {
  const webhook = readFileSync(new URL("../src/controllers/webhook.controller.js", import.meta.url), "utf8");
  assert.match(webhook, /capturedPaymentValidationError\(pendingCoursePayment, paymentEntity\)/);
  assert.match(webhook, /if \(validationError\)[\s\S]*?ignored course capture because provider payment did not match checkout/);
  assert.match(webhook, /_id: pendingCoursePayment\._id,[\s\S]*?status: \{ \$in: CAPTURED_PAYMENT_SOURCE_STATUSES \}/);
});

test("course webhook validation rejects missing or mismatched capture fields", () => {
  assert.equal(capturedPaymentValidationError(payment, null), "Provider payment order mismatch");
  assert.equal(capturedPaymentValidationError(payment, { ...captured, amount: undefined }), "Payment amount mismatch");
  assert.equal(capturedPaymentValidationError(payment, { ...captured, currency: undefined }), "Payment currency mismatch");
  assert.equal(capturedPaymentValidationError(payment, { ...captured, order_id: undefined }), "Provider payment order mismatch");
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


test("failure webhooks update only retryable payment source states", () => {
  const webhook = readFileSync(new URL("../src/controllers/webhook.controller.js", import.meta.url), "utf8");
  assert.match(webhook, /Payment\.updateOne\([\s\S]*?providerOrderId: orderId,[\s\S]*?status: \{ \$in: FAILED_PAYMENT_SOURCE_STATUSES \}[\s\S]*?\$set: buildFailedPaymentUpdate\(paymentEntity\)/);
  for (const protectedStatus of ["paid", "refunded", "partially_refunded", "cancelled"]) {
    assert.equal(FAILED_PAYMENT_SOURCE_STATUSES.includes(protectedStatus), false);
  }
});

test("course payment verification restores enrollment on success and idempotent retry", () => {
  const controller = readFileSync(new URL("../src/controllers/payment.controller.js", import.meta.url), "utf8");
  const courseDetails = readFileSync(new URL("../../src/pages/CourseDetails.tsx", import.meta.url), "utf8");

  assert.match(controller, /async function restorePurchasedCourseEnrollment\(payment, userId, enrollUser = enroll\)/);
  assert.match(controller, /Payment already verified; course access restored/);
  assert.match(controller, /await payment\.save\(\);[\s\S]*?restorePurchasedCourseEnrollment\(payment, req\.user\.userId, enrollUser\)/);
  assert.match(courseDetails, /const verificationData = await apiFetch\('\/api\/payments\/course\/verify'/);
  assert.match(courseDetails, /verificationData\?\.enrollment/);
});

test("course checkout reuses the latest pending order instead of creating duplicate payable orders", () => {
  const controller = readFileSync(new URL("../src/controllers/payment.controller.js", import.meta.url), "utf8");
  assert.match(controller, /const PaymentModel = dependencies\.Payment \|\| Payment/);
  assert.match(controller, /const pendingCourseCheckout = await PaymentModel\.findOne\([\s\S]*?course: course\._id,[\s\S]*?provider: "razorpay",[\s\S]*?status: "pending"[\s\S]*?\)\.sort\(\{ createdAt: -1 \}\)/);
  assert.match(controller, /if \(pendingCourseCheckout\)[\s\S]*?order: \{[\s\S]*?id: pendingCourseCheckout\.providerOrderId,[\s\S]*?toRazorpayMinorUnits\(pendingAmount, pendingCourseCheckout\.currency \|\| "INR"\)/);
  assert.match(controller, /Existing course checkout reused/);
  assert.match(controller, /checkoutLockKey\("course", req\.user\.userId, String\(course\._id\)\)/);
  assert.match(controller, /const acquireLock = dependencies\.acquireCheckoutLock \|\| acquireCheckoutLock/);
  const courseCheckout = controller.slice(
    controller.indexOf("export async function createCourseOrder"),
    controller.indexOf("export async function verifyCoursePayment")
  );
  assert.ok(courseCheckout.indexOf("acquireCheckoutLock(lockKey)") < courseCheckout.indexOf("const priorPurchase = await PaymentModel.findOne"),
    "The course lock must be acquired before querying purchases or creating the provider order");
  assert.match(controller, /!payment\?\.providerOrderId \|\| pendingCurrency !== requestedCurrency/);
});


test("subscription checkout only reuses a pending provider checkout for the same plan and conversion intent", () => {
  const controller = readFileSync(new URL("../src/controllers/payment.controller.js", import.meta.url), "utf8");
  const start = controller.indexOf("const pendingCheckouts = await PaymentModel.find({");
  const end = controller.indexOf("const intervalMap", start);
  assert.ok(start >= 0 && end > start, "Expected pending subscription checkout guard");
  const block = controller.slice(start, end);

  assert.match(block, /"metadata\.checkoutType": "subscription"/);
  assert.match(block, /candidatePlanId === String\(plan\._id\)/);
  assert.match(block, /candidateGrantId === requestedConversionGrantId/);
  assert.match(block, /if \(matchingPendingCheckout\)/);
  assert.match(block, /if \(pendingCheckouts\.length\)/);
  assert.match(block, /different plan or trial conversion is already pending/);
  assert.match(block, /pendingPlanId:/);
  assert.match(controller, /checkoutLockKey\("subscription", req\.user\.userId\)/);
  assert.match(controller, /acquireCheckoutLock\(lockKey\)/);
  const subscriptionCheckout = controller.slice(controller.indexOf("export async function createSubscriptionOrder"));
  assert.ok(subscriptionCheckout.indexOf("acquireLock(lockKey)") < subscriptionCheckout.indexOf("const existingSubscription = await UserSubscriptionModel.findOne"),
    "The subscription lock must be acquired before subscription eligibility and pending-checkout checks");
});


test("billing value summaries keep different currencies separate", () => {
  const controller = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const learnerBilling = readFileSync(new URL("../../src/pages/Billing.tsx", import.meta.url), "utf8");
  const adminBilling = readFileSync(new URL("../../src/pages/admin/AdminBilling.tsx", import.meta.url), "utf8");

  assert.match(controller, /paidTotalsByCurrency: Object\.fromEntries\(paidValues\.map/);
  assert.match(controller, /status: \{ \$in: \["paid", "partially_refunded", "refunded"\] \}/);
  assert.match(learnerBilling, /\["paid", "partially_refunded", "refunded"\]\.includes\(payment\.status\)/);
  assert.match(controller, /\$group:[\s\S]*?\$toUpper: \{ \$ifNull: \["\$currency", "INR"\] \}/);
  assert.match(controller, /paidTotal: Number\(paidValues\.find\(\(item\) => item\._id === "INR"\)/);
  assert.match(learnerBilling, /paidTotalsByCurrency/);
  assert.match(learnerBilling, /money\(amount, currency\)/);
  assert.match(adminBilling, /paidTotalsByCurrency/);
  assert.match(adminBilling, /money\(amount, currency\)/);
});

test("course checkout refuses to reuse pending orders when the current price or currency changed", () => {
  const controller = readFileSync(new URL("../src/controllers/payment.controller.js", import.meta.url), "utf8");
  assert.match(controller, /function pendingCourseCheckoutMatchesPrice\(payment, amount, currency\)/);
  assert.match(controller, /toRazorpayMinorUnits\(pendingAmount, pendingCurrency\) === toRazorpayMinorUnits\(Number\(amount\), requestedCurrency\)/);
  assert.match(controller, /pendingCurrency !== requestedCurrency/);
  assert.match(controller, /pendingCourseCheckoutMatchesPrice\(pending, amount, course\.pricing\.currency \|\| "INR"\)/);
  assert.match(controller, /pendingCourseCheckoutMatchesPrice\(pendingCourseCheckout, amount, course\.pricing\.currency \|\| "INR"\)/);
  assert.match(controller, /amount or currency no longer matches the current price/);
});

test("quiz progress-save failures preserve graded results instead of replacing the course player", () => {
  const player = readFileSync(new URL("../../src/pages/CoursePlayer.tsx", import.meta.url), "utf8");
  const submitStart = player.indexOf("const handleQuizSubmit");
  const submitEnd = player.indexOf("\n\n  if (loading)", submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart, "Expected course quiz submit handler");
  const submitHandler = player.slice(submitStart, submitEnd);
  assert.match(submitHandler, /setQuizSubmitted\(true\)/);
  assert.match(submitHandler, /Quiz graded, but lesson completion could not be saved/);
  assert.match(submitHandler, /setQuizActionError\(/);
  assert.doesNotMatch(submitHandler, /setError\(progressError/);
});

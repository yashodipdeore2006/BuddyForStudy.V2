import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoursePurchaseNotificationPayload,
  buildSubscriptionActivatedNotificationPayload,
  formatBillingNotificationDate
} from "../src/services/billingNotificationPayloads.js";

test("course receipt includes amount, date, provider reference and confirmed enrollment", () => {
  const payload = buildCoursePurchaseNotificationPayload({
    userId: "user-1",
    payment: { _id: "payment-1", user: "user-1", course: "course-1", amount: 499, currency: "INR", providerPaymentId: "pay_safe_reference", paidAt: new Date("2026-10-14T07:30:00Z") },
    course: { _id: "course-1", title: "Node.js API" },
    enrollment: { _id: "enrollment-1" }
  });
  assert.equal(payload.type, "billing");
  assert.equal(payload.eventKey, "course-purchase-confirmed:payment-1");
  assert.equal(payload.link, "/courses/course-1/roadmap");
  assert.match(payload.message, /INR 499/);
  assert.match(payload.message, /Node\.js API/);
  assert.match(payload.message, /pay_safe_reference/);
  assert.match(payload.message, /enrollment is confirmed/i);
  assert.ok(payload.metadata.purchaseDate);
  assert.equal(payload.metadata.enrollmentId, "enrollment-1");
});

test("course receipt falls back to internal reference and omits unknown date", () => {
  const payload = buildCoursePurchaseNotificationPayload({
    userId: "user-2", payment: { _id: "payment-2", course: "course-2", amount: 125.5, currency: "INR" },
    course: { _id: "course-2", title: "SQL Basics" }, enrollment: { _id: "enrollment-2" }
  });
  assert.equal(payload.metadata.paymentReference, "payment-2");
  assert.match(payload.message, /Payment reference: payment-2/);
  assert.equal(payload.metadata.purchaseDate, "");
});

test("subscription receipt contains interval, payment and provider billing-period dates", () => {
  const payload = buildSubscriptionActivatedNotificationPayload({
    userId: "user-3",
    payment: { _id: "payment-3", user: "user-3", plan: "plan-3", amount: 799, currency: "INR" },
    plan: { _id: "plan-3", name: "Pro", billingInterval: "monthly" },
    subscription: { id: "sub_123", current_start: 1791964800, current_end: 1794556800 }
  });
  assert.equal(payload.eventKey, "subscription-activated:sub_123");
  assert.match(payload.message, /Pro plan is active with monthly billing/);
  assert.match(payload.message, /INR 799/);
  assert.ok(payload.metadata.currentPeriodStart);
  assert.ok(payload.metadata.currentPeriodEnd);
  assert.match(payload.metadata.periodSummary, /–/);
});

test("invalid dates are omitted instead of being fabricated", () => {
  assert.equal(formatBillingNotificationDate("not-a-date"), "");
  assert.equal(formatBillingNotificationDate(null), "");
});

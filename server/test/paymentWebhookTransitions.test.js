import test from "node:test";
import assert from "node:assert/strict";
import { buildCapturedPaymentUpdate, CAPTURED_PAYMENT_SOURCE_STATUSES, FAILED_PAYMENT_SOURCE_STATUSES } from "../src/services/paymentWebhookTransitions.js";

test("captured payment update records provider ID when present and resets receipt delivery", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");
  assert.deepEqual(buildCapturedPaymentUpdate({ id: "pay_123" }, now), {
    status: "paid",
    providerPaymentId: "pay_123",
    paidAt: now,
    purchaseNotificationStatus: "pending",
    purchaseNotificationLastCheckedAt: null
  });
});

test("capture webhook without provider payment ID does not overwrite an existing ID with an empty string", () => {
  const update = buildCapturedPaymentUpdate({}, new Date("2026-10-18T12:00:00.000Z"));
  assert.equal(Object.hasOwn(update, "providerPaymentId"), false);
  assert.equal(update.status, "paid");
});

test("provider payment ID is trimmed and blank IDs are omitted", () => {
  assert.equal(buildCapturedPaymentUpdate({ id: " pay_456 " }).providerPaymentId, "pay_456");
  assert.equal(Object.hasOwn(buildCapturedPaymentUpdate({ id: "  " }), "providerPaymentId"), false);
});

test("capture and failure transitions only accept their intended source statuses", () => {
  assert.deepEqual(CAPTURED_PAYMENT_SOURCE_STATUSES, ["created", "pending", "failed"]);
  assert.deepEqual(FAILED_PAYMENT_SOURCE_STATUSES, ["created", "pending"]);
});

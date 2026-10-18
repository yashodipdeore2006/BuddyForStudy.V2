import test from "node:test";
import assert from "node:assert/strict";
import { calculateRemainingRefundableAmount, validateRefundAmount, matchesProviderRefund, ACTIVE_REFUND_STATUSES, classifyProviderRefundStatus, paymentStatusForRemainingBalance } from "../src/services/refundBalance.service.js";
import { RefundRequest } from "../src/models/RefundRequest.js";
import { PaymentIssue } from "../src/models/PaymentIssue.js";

test("remaining refundable balance subtracts only already-processed refunds", () => {
  assert.equal(calculateRemainingRefundableAmount(100, 25), 75);
  assert.equal(calculateRemainingRefundableAmount(100, 100), 0);
  assert.equal(calculateRemainingRefundableAmount(100, 125), 0);
});

test("remaining refundable balance safely handles invalid values", () => {
  assert.equal(calculateRemainingRefundableAmount("invalid", 0), 0);
  assert.equal(calculateRemainingRefundableAmount(100, -1), 0);
});

test("refund amount defaults to the remaining balance and rejects invalid or excessive values", () => {
  assert.deepEqual(validateRefundAmount(undefined, 75), { valid: true, amount: 75 });
  assert.deepEqual(validateRefundAmount("25.555", 75), { valid: true, amount: 25.56 });
  assert.equal(validateRefundAmount(0, 75).valid, false);
  assert.equal(validateRefundAmount(-1, 75).valid, false);
  assert.equal(validateRefundAmount("abc", 75).valid, false);
  assert.equal(validateRefundAmount(76, 75).valid, false);
  assert.equal(validateRefundAmount(1, 0).valid, false);
});

test("refund request schema enforces one active refund claim per payment", () => {
  const activeIndex = RefundRequest.schema.indexes().find(([, options]) => options.name === "unique_active_refund_per_payment");
  assert.ok(activeIndex, "Expected a unique active-refund index");
  assert.deepEqual(activeIndex[0], { activePaymentKey: 1 });
  assert.equal(activeIndex[1].unique, true);
  assert.equal(activeIndex[1].sparse, true);
});

test("refund reconciliation has private lease fields for concurrency control", () => {
  assert.ok(RefundRequest.schema.path("reconciliationToken"));
  assert.ok(RefundRequest.schema.path("reconciliationStartedAt"));
  assert.equal(RefundRequest.schema.path("reconciliationToken").options.select, false);
  assert.equal(RefundRequest.schema.path("reconciliationStartedAt").options.select, false);
});

test("payment issue schema enforces one active issue per payment", () => {
  const activeIndex = PaymentIssue.schema.indexes().find(([, options]) => options.name === "unique_active_payment_issue_per_payment");
  assert.ok(activeIndex, "Expected a unique active-payment-issue index");
  assert.deepEqual(activeIndex[0], { activePaymentKey: 1 });
  assert.equal(activeIndex[1].unique, true);
  assert.equal(activeIndex[1].sparse, true);
});

test("provider refund reconciliation requires exact ID, payment, amount and currency", () => {
  const input = {
    providerRefundId: "rfnd_123abc",
    paymentId: "pay_456def",
    amount: 25.5,
    currency: "INR",
    providerRefund: { id: "rfnd_123abc", payment_id: "pay_456def", amount: 2550, currency: "INR", status: "processed" }
  };
  assert.equal(matchesProviderRefund(input), true);
  assert.equal(matchesProviderRefund({ ...input, providerRefund: { ...input.providerRefund, payment_id: "pay_other" } }), false);
  assert.equal(matchesProviderRefund({ ...input, providerRefund: { ...input.providerRefund, amount: 2500 } }), false);
  assert.equal(matchesProviderRefund({ ...input, providerRefund: { ...input.providerRefund, currency: "USD" } }), false);
  assert.equal(matchesProviderRefund({ ...input, providerRefund: { ...input.providerRefund, id: "rfnd_other" } }), false);
  assert.equal(matchesProviderRefund({ ...input, providerRefund: null }), false);
});

test("processed refunds release the active-request claim so partial balances remain refundable", () => {
  assert.deepEqual(ACTIVE_REFUND_STATUSES, ["pending", "approved"]);
  assert.equal(ACTIVE_REFUND_STATUSES.includes("processed"), false);
  assert.equal(ACTIVE_REFUND_STATUSES.includes("rejected"), false);
});

test("provider refund status never treats pending or unknown states as processed", () => {
  assert.equal(classifyProviderRefundStatus("processed"), "processed");
  assert.equal(classifyProviderRefundStatus("failed"), "retryable");
  assert.equal(classifyProviderRefundStatus("rejected"), "retryable");
  assert.equal(classifyProviderRefundStatus("pending"), "pending");
  assert.equal(classifyProviderRefundStatus("created"), "pending");
  assert.equal(classifyProviderRefundStatus(""), "pending");
  assert.equal(classifyProviderRefundStatus(undefined), "pending");
});

test("payment status can be repaired from aggregate confirmed refund balance", () => {
  assert.equal(paymentStatusForRemainingBalance(70), "partially_refunded");
  assert.equal(paymentStatusForRemainingBalance(0), "refunded");
  assert.equal(paymentStatusForRemainingBalance(-0.001), "refunded");
  assert.equal(paymentStatusForRemainingBalance(0.00000001), "refunded");
  assert.equal(paymentStatusForRemainingBalance("invalid"), "refunded");
});

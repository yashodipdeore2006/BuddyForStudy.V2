import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateRemainingRefundableAmount, validateRefundAmount, matchesProviderRefund, normalizeProcessedProviderRefund, ACTIVE_REFUND_STATUSES, classifyProviderRefundStatus, paymentStatusForRemainingBalance } from "../src/services/refundBalance.service.js";
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
  assert.deepEqual(validateRefundAmount(0.001, 75), {
    valid: false,
    amount: 0,
    message: "Refund amount must be at least 0.01."
  });
  assert.deepEqual(validateRefundAmount(25.554, 25.55), { valid: true, amount: 25.55 });
  assert.equal(validateRefundAmount(25.555, 25.55).valid, false);
  assert.deepEqual(validateRefundAmount(0.02, 0.01), {
    valid: false,
    amount: 0,
    message: "Refund amount cannot exceed the remaining refundable balance of 0.01."
  });
});

test("refund request schema rejects zero and sub-cent amounts", () => {
  const amountPath = RefundRequest.schema.path("amount");
  assert.equal(amountPath.options.min[0], 0.01);
  const zero = new RefundRequest({ user: "507f1f77bcf86cd799439011", payment: "507f1f77bcf86cd799439012", amount: 0 });
  assert.equal(zero.validateSync().errors.amount.kind, "min");
  const subCent = new RefundRequest({ user: "507f1f77bcf86cd799439011", payment: "507f1f77bcf86cd799439012", amount: 1.234 });
  assert.equal(subCent.validateSync().errors.amount.kind, "user defined");
  const valid = new RefundRequest({ user: "507f1f77bcf86cd799439011", payment: "507f1f77bcf86cd799439012", amount: 1.23 });
  assert.equal(valid.validateSync(), undefined);
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

test("admin refund processing validates provider identity and amount before the processed transition", () => {
  const controller = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const start = controller.indexOf("export async function updateRefund");
  const end = controller.indexOf("export async function reconcileRefund", start);
  assert.ok(start >= 0 && end > start, "Expected the admin refund handlers");
  const handler = controller.slice(start, end);
  const validation = handler.indexOf("if (!matchesProviderRefund({");
  const processedTransition = handler.indexOf('if (providerOutcome === "processed")');
  assert.ok(validation >= 0, "Provider response must be checked against the refund request");
  assert.ok(processedTransition > validation, "Provider validation must precede marking a refund processed");
  assert.match(handler, /refund\.provider_response_mismatch/);
  assert.match(handler, /payment status was not changed/);
});

test("payment status can be repaired from aggregate confirmed refund balance", () => {
  assert.equal(paymentStatusForRemainingBalance(70), "partially_refunded");
  assert.equal(paymentStatusForRemainingBalance(0), "refunded");
  assert.equal(paymentStatusForRemainingBalance(-0.001), "refunded");
  assert.equal(paymentStatusForRemainingBalance(0.00000001), "refunded");
  assert.equal(paymentStatusForRemainingBalance("invalid"), "partially_refunded");
});


test("processed refund webhook normalization validates payment identity, amount, and currency", () => {
  const payment = { providerPaymentId: "pay_123", currency: "INR" };
  assert.deepEqual(normalizeProcessedProviderRefund({
    id: "rfnd_123",
    payment_id: "pay_123",
    amount: 2550,
    currency: "inr",
    status: "processed"
  }, payment), {
    valid: true,
    providerRefundId: "rfnd_123",
    paymentId: "pay_123",
    amount: 25.5,
    currency: "INR"
  });
  assert.equal(normalizeProcessedProviderRefund({ id: "rfnd_123", payment_id: "pay_other", amount: 2550, currency: "INR", status: "processed" }, payment).reason, "Provider refund payment mismatch");
  assert.equal(normalizeProcessedProviderRefund({ id: "rfnd_123", payment_id: "pay_123", amount: 0, currency: "INR", status: "processed" }, payment).reason, "Invalid provider refund amount");
  assert.equal(normalizeProcessedProviderRefund({ id: "rfnd_123", payment_id: "pay_123", amount: 2550, currency: "USD", status: "processed" }, payment).reason, "Provider refund currency mismatch");
  assert.equal(normalizeProcessedProviderRefund({ id: "rfnd_123", payment_id: "pay_123", amount: 2550, currency: "INR", status: "pending" }, payment).reason, "Provider refund is not processed");
  assert.equal(normalizeProcessedProviderRefund({ id: "rfnd_123", payment_id: "pay_123", amount: 2550, currency: "INR" }, payment).reason, "Provider refund is not processed");
});

test("refund.processed webhook reconciles external refunds into payment status and learner notifications", () => {
  const webhook = readFileSync(new URL("../src/controllers/webhook.controller.js", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const razorpay = readFileSync(new URL("../src/services/razorpay.service.js", import.meta.url), "utf8");
  assert.match(webhook, /event\.event === "refund\.processed"/);
  assert.match(webhook, /normalizeProcessedProviderRefund\(providerRefund, payment\)/);
  assert.match(webhook, /RefundRequest\.findOne\(\{ providerRefundId: normalized\.providerRefundId \}\)/);
  assert.match(webhook, /RefundRequest\.create\([\s\S]*?status: "processed"[\s\S]*?providerRefundId: normalized\.providerRefundId/);
  assert.match(webhook, /providerRefund\?\.notes\?\.bfs_refund_request_id/);
  assert.match(webhook, /RefundRequest\.findById\(requestedRefundId\)/);
  assert.match(webhook, /Never guess by amount alone/);
  assert.doesNotMatch(webhook, /status: \{ \$in: \["pending", "approved"\] \},\s*amount: normalized\.amount,\s*providerRefundId: \{ \$in: \["", null\] \}\)\.sort/);
  assert.match(admin, /notes: \{ bfs_refund_request_id: String\(refund\._id\) \}/);
  assert.match(razorpay, /if \(notes && typeof notes === "object" && !Array\.isArray\(notes\)\) payload\.notes = notes/);
  assert.match(webhook, /getRemainingRefundableAmount\(payment\._id, payment\.amount, null, payment\.currency \|\| "INR"\)/);
  assert.match(webhook, /payment\.status = paymentStatusForRemainingBalance\(remainingAmount, payment\.currency \|\| "INR"\)/);
  assert.match(webhook, /eventKey: `refund-status:\$\{refund\._id\}:processed`/);
  assert.match(webhook, /external-refund-reconciled:/);
});


test("admin refund payment status is recomputed from all confirmed refunds after persisting the refund", () => {
  const controller = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const start = controller.indexOf("export async function updateRefund");
  const end = controller.indexOf("export async function reconcileRefund", start);
  assert.ok(start >= 0 && end > start, "Expected the admin refund handler");
  const handler = controller.slice(start, end);
  const refundPersist = handler.indexOf("await refund.save()");
  const aggregateBalance = handler.indexOf("const remainingAfterConfirmedRefunds = await getRemainingRefundableAmount(payment._id, payment.amount, null, payment.currency || \"INR\")");
  const paymentWrite = handler.indexOf("payment.status = paymentStatusForRemainingBalance(remainingAfterConfirmedRefunds, payment.currency || \"INR\")");
  assert.ok(refundPersist >= 0 && aggregateBalance > refundPersist, "Calculate from processed refunds only after saving the new processed refund");
  assert.ok(paymentWrite > aggregateBalance, "Set payment status from the aggregate confirmed balance");
  assert.doesNotMatch(handler, /const isFullRefund = refund\.amount >= remainingAmount/);
});

test("provider refund IDs have a unique index when populated", () => {
  const index = RefundRequest.schema.indexes().find(([, options]) => options.name === "unique_provider_refund_id");
  assert.ok(index, "Expected a unique refund provider reference index");
  assert.deepEqual(index[0], { providerRefundId: 1 });
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    providerRefundId: { $type: "string", $gt: "" }
  });
});
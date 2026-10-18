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

import { RefundRequest } from "../models/RefundRequest.js";

export const ACTIVE_REFUND_STATUSES = Object.freeze(["pending", "approved"]);

/**
 * Returns the remaining refundable balance after already processed refunds.
 * Pending, approved, and rejected requests do not reduce the balance because
 * only a confirmed provider refund changes the amount already returned.
 */
export async function getRemainingRefundableAmount(paymentId, totalAmount, excludeRefundId = null) {
  const match = { payment: paymentId, status: "processed" };
  if (excludeRefundId) match._id = { $ne: excludeRefundId };
  const rows = await RefundRequest.aggregate([
    { $match: match },
    { $group: { _id: null, refunded: { $sum: "$amount" } } }
  ]);
  return calculateRemainingRefundableAmount(totalAmount, rows[0]?.refunded || 0);
}

export function calculateRemainingRefundableAmount(totalAmount, alreadyRefunded) {
  const total = Number(totalAmount);
  const refunded = Number(alreadyRefunded);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(refunded) || refunded < 0) return 0;
  return Math.max(0, Number((total - refunded).toFixed(2)));
}


/** Derive the payment status from the aggregate confirmed refund balance. */
export function paymentStatusForRemainingBalance(remainingAmount) {
  const remaining = Number(remainingAmount);
  if (!Number.isFinite(remaining)) return "partially_refunded";
  if (Number(remaining.toFixed(2)) <= 0) return "refunded";
  return "partially_refunded";
}

export function validateRefundAmount(requestedAmount, remainingAmount) {
  const remaining = Number(remainingAmount);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { valid: false, amount: 0, message: "This payment has no refundable balance remaining." };
  }
  if (requestedAmount === undefined || requestedAmount === null || requestedAmount === "") {
    return { valid: true, amount: remaining };
  }
  const amount = Number(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: 0, message: "Refund amount must be a positive number." };
  }

  // Provider APIs accept integer minor units. Normalize before comparing so a
  // tiny positive input cannot become a zero-value refund after rounding.
  const normalizedAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (normalizedAmount <= 0) {
    return { valid: false, amount: 0, message: "Refund amount must be at least 0.01." };
  }
  const normalizedRemaining = Math.round((remaining + Number.EPSILON) * 100) / 100;
  if (normalizedAmount > normalizedRemaining) {
    return { valid: false, amount: 0, message: `Refund amount cannot exceed the remaining refundable balance of ${normalizedRemaining}.` };
  }
  return { valid: true, amount: normalizedAmount };
}

/** Validate a provider refund against the exact local payment/refund record. */
export function matchesProviderRefund({ providerRefund, providerRefundId, paymentId, amount, currency }) {
  if (!providerRefund || typeof providerRefund !== "object") return false;
  const expectedAmount = Math.round(Number(amount) * 100);
  return Boolean(
    providerRefundId &&
    String(providerRefund.id || "") === String(providerRefundId) &&
    String(providerRefund.payment_id || "") === String(paymentId) &&
    Number.isFinite(expectedAmount) &&
    expectedAmount > 0 &&
    Number(providerRefund.amount) === expectedAmount &&
    String(providerRefund.currency || "").toUpperCase() === String(currency || "INR").toUpperCase()
  );
}

/** Normalize provider states into safe local handling categories. */
export function classifyProviderRefundStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "processed") return "processed";
  if (["failed", "rejected"].includes(normalized)) return "retryable";
  return "pending";
}

/** Validate a processed refund webhook against its original local payment. */
export function normalizeProcessedProviderRefund(providerRefund, payment) {
  const providerRefundId = String(providerRefund?.id || "").trim();
  const providerPaymentId = String(providerRefund?.payment_id || "").trim();
  const expectedPaymentId = String(payment?.providerPaymentId || "").trim();
  const amountMinor = Number(providerRefund?.amount);
  const currency = String(providerRefund?.currency || "").trim().toUpperCase();
  const status = String(providerRefund?.status || "").trim().toLowerCase();

  if (!providerRefundId) return { valid: false, reason: "Missing provider refund ID" };
  if (!expectedPaymentId || providerPaymentId !== expectedPaymentId) {
    return { valid: false, reason: "Provider refund payment mismatch" };
  }
  if (status && status !== "processed") {
    return { valid: false, reason: "Provider refund is not processed" };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { valid: false, reason: "Invalid provider refund amount" };
  }
  if (!/^[A-Z]{3}$/.test(currency) ||
      currency !== String(payment?.currency || "INR").trim().toUpperCase()) {
    return { valid: false, reason: "Provider refund currency mismatch" };
  }

  return { valid: true, providerRefundId, paymentId: providerPaymentId, amount: amountMinor / 100, currency };
}

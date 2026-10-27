import { RefundRequest } from "../models/RefundRequest.js";
import { toRazorpayMinorUnits, fromRazorpayMinorUnits, normalizeRazorpayAmount } from "../utils/razorpayAmounts.js";

export const ACTIVE_REFUND_STATUSES = Object.freeze(["pending", "approved"]);

/**
 * Returns the remaining refundable balance after already processed refunds.
 * Pending, approved, and rejected requests do not reduce the balance because
 * only a confirmed provider refund changes the amount already returned.
 */
export async function getRemainingRefundableAmount(paymentId, totalAmount, excludeRefundId = null, currency = "INR") {
  const match = { payment: paymentId, status: "processed" };
  if (excludeRefundId) match._id = { $ne: excludeRefundId };
  const rows = await RefundRequest.aggregate([
    { $match: match },
    { $group: { _id: null, refunded: { $sum: "$amount" } } }
  ]);
  return calculateRemainingRefundableAmount(totalAmount, rows[0]?.refunded || 0, currency);
}

/** Compare stored major-unit amounts using the exact precision for their provider currency. */
export function refundAmountsMatch(leftAmount, rightAmount, currency = "INR") {
  if (
    leftAmount === null || leftAmount === undefined || leftAmount === "" ||
    rightAmount === null || rightAmount === undefined || rightAmount === ""
  ) return false;
  try {
    return toRazorpayMinorUnits(Number(leftAmount), currency) ===
      toRazorpayMinorUnits(Number(rightAmount), currency);
  } catch {
    return false;
  }
}

export function calculateRemainingRefundableAmount(totalAmount, alreadyRefunded, currency = "INR") {
  const total = Number(totalAmount);
  const refunded = Number(alreadyRefunded);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(refunded) || refunded < 0) return 0;
  try {
    const totalMinor = toRazorpayMinorUnits(total, currency);
    const refundedMinor = toRazorpayMinorUnits(refunded, currency);
    return fromRazorpayMinorUnits(Math.max(0, totalMinor - refundedMinor), currency);
  } catch {
    return 0;
  }
}


/** Derive the payment status from the aggregate confirmed refund balance. */
export function paymentStatusForRemainingBalance(remainingAmount, currency = "INR") {
  const remaining = Number(remainingAmount);
  if (!Number.isFinite(remaining)) return "partially_refunded";
  // An exhausted or overdrawn balance is fully refunded; don't let currency
  // normalization reject a negative floating-point remainder and downgrade it.
  if (remaining <= 0) return "refunded";
  try {
    return toRazorpayMinorUnits(normalizeRazorpayAmount(remaining, currency), currency) <= 0
      ? "refunded"
      : "partially_refunded";
  } catch {
    return "partially_refunded";
  }
}

export function validateRefundAmount(requestedAmount, remainingAmount, currency = "INR") {
  const remaining = Number(remainingAmount);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { valid: false, amount: 0, message: "This payment has no refundable balance remaining." };
  }
  let normalizedRemaining;
  let remainingMinor;
  try {
    normalizedRemaining = normalizeRazorpayAmount(remaining, currency);
    remainingMinor = toRazorpayMinorUnits(normalizedRemaining, currency);
  } catch {
    return { valid: false, amount: 0, message: "Remaining refundable balance is invalid for the selected currency." };
  }
  if (remainingMinor <= 0) {
    return { valid: false, amount: 0, message: "This payment has no refundable balance remaining." };
  }
  if (requestedAmount === undefined || requestedAmount === null || requestedAmount === "") {
    return { valid: true, amount: normalizedRemaining };
  }
  const amount = Number(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: 0, message: "Refund amount must be a positive number." };
  }
  let normalizedAmount;
  let amountMinor;
  try {
    normalizedAmount = normalizeRazorpayAmount(amount, currency);
    amountMinor = toRazorpayMinorUnits(normalizedAmount, currency);
  } catch {
    return { valid: false, amount: 0, message: "Refund amount is invalid for the selected currency." };
  }
  if (amountMinor <= 0) {
    return { valid: false, amount: 0, message: `Refund amount must be at least ${currency === "JPY" ? "1" : "0.01"}.` };
  }
  if (amountMinor > remainingMinor) {
    return { valid: false, amount: 0, message: `Refund amount cannot exceed the remaining refundable balance of ${normalizedRemaining}.` };
  }
  return { valid: true, amount: fromRazorpayMinorUnits(amountMinor, currency) };
}

/** Validate a provider refund against the exact local payment/refund record. */
export function matchesProviderRefund({ providerRefund, providerRefundId, paymentId, amount, currency }) {
  if (!providerRefund || typeof providerRefund !== "object") return false;
  let expectedAmount;
  try { expectedAmount = toRazorpayMinorUnits(Number(amount), currency || "INR"); }
  catch { return false; }
  return Boolean(
    providerRefundId &&
    String(providerRefund.id || "") === String(providerRefundId) &&
    String(providerRefund.payment_id || "") === String(paymentId) &&
    Number.isSafeInteger(expectedAmount) &&
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
  if (status !== "processed") {
    return { valid: false, reason: "Provider refund is not processed" };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { valid: false, reason: "Invalid provider refund amount" };
  }
  if (!/^[A-Z]{3}$/.test(currency) ||
      currency !== String(payment?.currency || "INR").trim().toUpperCase()) {
    return { valid: false, reason: "Provider refund currency mismatch" };
  }

  let amount;
  try { amount = fromRazorpayMinorUnits(amountMinor, currency); } catch {
    return { valid: false, reason: "Invalid provider refund amount" };
  }
  return { valid: true, providerRefundId, paymentId: providerPaymentId, amount, currency };
}

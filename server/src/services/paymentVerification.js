import { toRazorpayMinorUnits } from "../utils/razorpayAmounts.js";

/**
 * Validate the provider's authoritative payment resource before a course
 * payment can transition to paid. The checkout signature is verified by the
 * controller before this helper is called.
 *
 * Returns the existing API error message or null when the payment is captured
 * and matches the expected order, amount, and currency.
 */
export function capturedPaymentValidationError(payment, providerPayment) {
  if (providerPayment?.order_id !== payment?.providerOrderId) {
    return "Provider payment order mismatch";
  }
  if (providerPayment?.status !== "captured") {
    return "Payment has not been captured";
  }
  let expectedAmount;
  try {
    expectedAmount = toRazorpayMinorUnits(Number(payment.amount), payment.currency || "INR");
  } catch {
    return "Payment amount mismatch";
  }
  if (expectedAmount <= 0 || Number(providerPayment.amount) !== expectedAmount) {
    return "Payment amount mismatch";
  }
  if (String(providerPayment.currency || "").toUpperCase() !== String(payment.currency).toUpperCase()) {
    return "Payment currency mismatch";
  }
  return null;
}

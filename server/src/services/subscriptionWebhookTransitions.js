/**
 * Normalize a provider-confirmed subscription charge before writing billing
 * history. subscription.charged is the event signal; when the payment snapshot
 * includes a status or subscription ID, those fields must agree as well.
 */
export function normalizeSubscriptionCharge(subscription, paymentEntity) {
  const subscriptionId = String(subscription?.id || "").trim();
  const providerPaymentId = String(paymentEntity?.id || "").trim();
  const amountMinor = Number(paymentEntity?.amount);
  const currency = String(paymentEntity?.currency || "").trim().toUpperCase();
  const providerStatus = String(paymentEntity?.status || "").trim().toLowerCase();
  const paymentSubscriptionId = String(paymentEntity?.subscription_id || "").trim();

  if (!subscriptionId) return { valid: false, reason: "Missing provider subscription ID" };
  if (!providerPaymentId) return { valid: false, reason: "Missing provider payment ID" };
  if (paymentSubscriptionId && paymentSubscriptionId !== subscriptionId) {
    return { valid: false, reason: "Provider payment subscription mismatch" };
  }
  if (providerStatus && providerStatus !== "captured") {
    return { valid: false, reason: "Subscription payment is not captured" };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { valid: false, reason: "Invalid subscription payment amount" };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { valid: false, reason: "Invalid subscription payment currency" };
  }

  return {
    valid: true,
    providerPaymentId,
    amount: amountMinor / 100,
    currency
  };
}

export function subscriptionEventTimestamp(event) {
  const seconds = Number(event?.created_at);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function subscriptionEventFreshnessFilter(eventAt, eventId = "", eventName = "") {
  const legacyRecords = [
    { providerEventAt: { $exists: false } },
    { providerEventAt: null }
  ];
  if (!(eventAt instanceof Date) || Number.isNaN(eventAt.getTime())) {
    // Unknown-order events may only update legacy records with no provider
    // ordering metadata.
    return { $or: legacyRecords };
  }

  const eligible = [
    ...legacyRecords,
    { providerEventAt: { $lt: eventAt } }
  ];

  // An exact retry may repeat the transition and recover downstream work.
  // Different events with the same second-level timestamp remain first-applied-wins.
  if (eventId && eventName) {
    eligible.push({
      providerEventAt: eventAt,
      providerEventId: eventId,
      providerEventName: eventName
    });
  }
  return { $or: eligible };
}

export const SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES = Object.freeze([
  "created",
  "pending",
  "paid",
  "failed"
]);

export const TERMINAL_PAYMENT_STATUSES = Object.freeze([
  "refunded",
  "partially_refunded",
  "cancelled"
]);

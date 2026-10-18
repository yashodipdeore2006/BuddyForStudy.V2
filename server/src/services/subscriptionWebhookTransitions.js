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

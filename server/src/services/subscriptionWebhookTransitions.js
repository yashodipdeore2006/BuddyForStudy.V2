export function subscriptionEventTimestamp(event) {
  const seconds = Number(event?.created_at);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function subscriptionEventFreshnessFilter(eventAt) {
  if (!(eventAt instanceof Date) || Number.isNaN(eventAt.getTime())) {
    // Without provider ordering metadata, only legacy untracked records are
    // eligible. Unknown-order events must not overwrite timestamped state.
    return {
      $or: [
        { providerEventAt: { $exists: false } },
        { providerEventAt: null }
      ]
    };
  }

  // Razorpay created_at has second-level precision. Strictly older timestamps
  // are stale; equal timestamps are ambiguous, so first applied event wins.
  // This avoids arrival-order flapping between activation/cancellation events.
  return {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null },
      { providerEventAt: { $lt: eventAt } }
    ]
  };
}

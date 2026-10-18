export function subscriptionEventTimestamp(event) {
  const seconds = Number(event?.created_at);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function subscriptionEventFreshnessFilter(eventAt) {
  if (!(eventAt instanceof Date) || Number.isNaN(eventAt.getTime())) {
    // An event without a provider timestamp can update legacy records only;
    // it must not overwrite a state already ordered by a timestamped event.
    return {
      $or: [
        { providerEventAt: { $exists: false } },
        { providerEventAt: null }
      ]
    };
  }
  return {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null },
      { providerEventAt: { $lte: eventAt } }
    ]
  };
}

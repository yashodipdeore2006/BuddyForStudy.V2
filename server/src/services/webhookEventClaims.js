export const WEBHOOK_EVENT_LEASE_MS = 5 * 60 * 1000;

export function getWebhookClaimDisposition(existing, now = new Date()) {
  if (!existing) return "claim";

  const status = existing.status;
  // Treat records created by the previous implementation as completed.
  if (status === "processed" || (!status && existing.processedAt)) return "duplicate";

  if (status === "processing") {
    const claimedAt = existing.claimedAt ? new Date(existing.claimedAt).getTime() : 0;
    return claimedAt > now.getTime() - WEBHOOK_EVENT_LEASE_MS ? "in_progress" : "reclaim";
  }

  return "reclaim";
}

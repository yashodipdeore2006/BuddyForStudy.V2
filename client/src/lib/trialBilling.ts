const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function isTrialCurrentlyActive(status: string, endsAt: string | null | undefined, now = Date.now()): boolean {
  const end = Date.parse(String(endsAt || ""));
  return status === "trialing" && Number.isFinite(end) && end > now;
}

export function formatTrialRemaining(endsAt: string | null | undefined, now = Date.now()): string {
  const end = Date.parse(String(endsAt || ""));
  if (!Number.isFinite(end)) return "Unavailable";
  const remaining = end - now;
  if (remaining <= 0) return "Ended";
  const totalMinutes = Math.ceil(remaining / MINUTE_MS);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function getTrialStatusLabel(status: string, endsAt: string | null | undefined, now = Date.now()): string {
  if (status === "trialing") {
    const end = Date.parse(String(endsAt || ""));
    if (!Number.isFinite(end)) return "Status unavailable";
    if (end <= now) return "Ended";
    return end - now <= DAY_MS ? "Ending soon" : "Active";
  }
  const labels: Record<string, string> = { expired: "Ended", revoked: "Revoked", converted: "Converted to paid" };
  return labels[status] || "Status unavailable";
}

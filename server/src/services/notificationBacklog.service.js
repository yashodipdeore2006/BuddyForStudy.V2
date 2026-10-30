import { Notification } from "../models/Notification.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";

const DEFAULT_THRESHOLD = 100;
const DEFAULT_AGE_MS = 15 * 60 * 1000;

export async function checkNotificationDeliveryBacklog(now = new Date(), options = {}, dependencies = {}) {
  const threshold = Math.max(1, Math.min(10000, Math.trunc(Number(options.threshold) || DEFAULT_THRESHOLD)));
  const ageMs = Math.max(60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(options.ageMs) || DEFAULT_AGE_MS));
  const cutoff = new Date(now.getTime() - ageMs);
  const countPending = dependencies.countPending || ((channel, before) => Notification.countDocuments({
    [`${channel}Status`]: "pending",
    createdAt: { $lte: before }
  }));
  const recordAlert = dependencies.recordAlert || recordOperationalAlert;
  const resolveAlert = dependencies.resolveAlert || resolveOperationalAlert;
  const counts = {};

  for (const channel of ["email", "push"]) {
    const count = await countPending(channel, cutoff);
    counts[channel] = count;
    const key = `notification-delivery-backlog-${channel}`;
    if (count >= threshold) {
      await recordAlert({
        key,
        severity: count >= threshold * 5 ? "critical" : "warning",
        source: `notification-worker:${channel}-backlog`,
        message: `${count} ${channel} notifications have remained pending for at least ${Math.round(ageMs / 60000)} minutes (alert threshold: ${threshold}).`
      });
    } else {
      await resolveAlert(key);
    }
  }

  return { checkedAt: now, cutoff, threshold, counts };
}

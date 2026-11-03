import { WebhookEvent } from "../models/WebhookEvent.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { getState as getYouTubeQuotaState } from "./quota.service.js";

export const WEBHOOK_STALE_PROCESSING_AFTER_MS = 5 * 60 * 1000;

export async function checkPaymentWebhookBacklog(now = new Date(), options = {}, dependencies = {}) {
  const configuredAge = Number(options.staleAfterMs);
  const staleAfterMs = Number.isFinite(configuredAge)
    ? Math.max(60 * 1000, Math.min(60 * 60 * 1000, Math.trunc(configuredAge)))
    : WEBHOOK_STALE_PROCESSING_AFTER_MS;
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const countFailed = dependencies.countFailed || (() => WebhookEvent.countDocuments({ status: "failed" }));
  const countStaleProcessing = dependencies.countStaleProcessing || ((before) => WebhookEvent.countDocuments({
    status: "processing",
    claimedAt: { $lte: before }
  }));
  const recordAlert = dependencies.recordAlert || recordOperationalAlert;
  const resolveAlert = dependencies.resolveAlert || resolveOperationalAlert;

  const [failed, staleProcessing] = await Promise.all([
    countFailed(),
    countStaleProcessing(cutoff)
  ]);

  if (failed > 0) {
    await recordAlert({
      key: "razorpay-webhook-failed-events",
      severity: "critical",
      source: "razorpay-webhook-monitor",
      message: `${failed} Razorpay webhook event(s) are marked failed and require reconciliation or provider retry.`
    });
  } else {
    await resolveAlert("razorpay-webhook-failed-events");
  }

  if (staleProcessing > 0) {
    await recordAlert({
      key: "razorpay-webhook-stuck-processing",
      severity: "critical",
      source: "razorpay-webhook-monitor",
      message: `${staleProcessing} Razorpay webhook event(s) have remained processing for at least ${Math.floor(staleAfterMs / 60000)} minutes.`
    });
  } else {
    await resolveAlert("razorpay-webhook-stuck-processing");
  }

  return { checkedAt: now, cutoff, staleAfterMs, failed, staleProcessing };
}

export async function checkYouTubeQuotaOperationalState(dependencies = {}) {
  const getQuotaState = dependencies.getQuotaState || getYouTubeQuotaState;
  const recordAlert = dependencies.recordAlert || recordOperationalAlert;
  const resolveAlert = dependencies.resolveAlert || resolveOperationalAlert;
  const quota = await getQuotaState();
  const unavailable = quota?.store === "unavailable";
  const severity = unavailable || quota?.state === "exhausted"
    ? "critical"
    : quota?.state === "degraded"
      ? "warning"
      : null;

  if (severity) {
    await recordAlert({
      key: "youtube-daily-quota-degraded",
      severity,
      source: "youtube-quota-monitor",
      message: unavailable
        ? "YouTube quota usage storage is unavailable; provider requests are being refused to avoid exceeding the daily quota."
        : `YouTube daily quota is ${quota.state}: ${Number(quota.units) || 0} of ${Number(quota.budget) || 0} units used; search capacity may be restricted until the Pacific reset.`
    });
  } else {
    await resolveAlert("youtube-daily-quota-degraded");
  }

  return quota;
}

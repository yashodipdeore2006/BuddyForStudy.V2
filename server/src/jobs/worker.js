import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { processPendingAuditOutbox } from "../services/auditOutbox.service.js";
import "../models/Course.js";
import { Payment } from "../models/Payment.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { heartbeatWorker, markMaintenanceStarted, markMaintenanceCompleted, markMaintenanceFailed } from "../services/jobHeartbeat.service.js";
import { checkNotificationDeliveryBacklog } from "../services/notificationBacklog.service.js";
import { deliverPendingNotificationEmails, deliverPendingNotificationPush, processLearningReminders, reconcilePendingCoursePurchaseNotifications, reconcilePendingSubscriptionActivationNotifications, processSubscriptionExpiryReminders } from "../services/notification.service.js";
import { processScheduledAnnouncements } from "../services/announcement.service.js";
import { refreshStaleVideos } from "../services/youtubeCompliance.service.js";
import { rebuildSkillPriors } from "../services/skillResourcePrior.service.js";
import { recoverExpiredRoadmapAdmissions } from "../services/roadmapAdmission.service.js";

const intervalMs = 15 * 60 * 1000;
let maintenanceInProgress = false;
let stopping = false;
let intervalHandle;
let heartbeatHandle;
let heartbeatInProgress = Promise.resolve();
let announcementHandle;
let announcementRunInProgress = false;
let nightlyRunInProgress = false;
let lastNightlyRunDate = "";

async function runNightlyCurationJobs(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (!env.enableCurationComplianceWorkers || now.getUTCHours() < 2 || lastNightlyRunDate === day || nightlyRunInProgress || stopping) return;
  nightlyRunInProgress = true;
  try {
    const results = await Promise.allSettled([
      refreshStaleVideos(),
      rebuildSkillPriors()
    ]);
    const failed = results.some((result) => result.status === "rejected");
    for (let index = 0; index < results.length; index += 1) {
      const name = index === 0 ? "youtube-stale-refresh" : "skill-resource-priors";
      const result = results[index];
      if (result.status === "fulfilled") {
        console.info("[worker] nightly curation job completed", { job: name, ...result.value });
      } else {
        console.error("[worker] nightly curation job failed", { job: name, name: result.reason?.name || "Error", code: result.reason?.code || null, message: String(result.reason?.message || "Job failed").slice(0, 300) });
      }
    }
    if (!failed) lastNightlyRunDate = day;
  } finally {
    nightlyRunInProgress = false;
  }
}

async function runMaintenance() {
  if (maintenanceInProgress || stopping) {
    console.info("[worker] maintenance run skipped because another run is active or shutdown has started");
    return;
  }

  maintenanceInProgress = true;
  const startedAt = Date.now();
  await markMaintenanceStarted().catch((error) => console.error("[worker] unable to record maintenance start", { code: error?.code }));

  try {
    const now = new Date();
    const recoveredRoadmapAdmissions = await recoverExpiredRoadmapAdmissions({ now });
    if (recoveredRoadmapAdmissions) console.warn("[worker] recovered expired roadmap admission leases", { count: recoveredRoadmapAdmissions });
    await runNightlyCurationJobs(now);
    const [subscriptions, payments, trialGrants] = await Promise.all([
      UserSubscription.updateMany(
        { status: { $in: ["trialing", "active", "past_due"] }, currentPeriodEnd: { $lt: now } },
        { $set: { status: "expired" } }
      ),
      Payment.updateMany(
        { status: { $in: ["created", "pending"] }, createdAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        { $set: { status: "cancelled" } }
      ),
      TrialGrant.updateMany(
        { status: "trialing", endsAt: { $lte: now } },
        { $set: { status: "expired" } }
      )
    ]);
    const notificationJobs = await Promise.allSettled([
      processPendingAuditOutbox(100, now),
      deliverPendingNotificationEmails(50),
      deliverPendingNotificationPush(50),
      processLearningReminders(now, 500),
      reconcilePendingCoursePurchaseNotifications(now, 100),
      reconcilePendingSubscriptionActivationNotifications(now, 100),
      processSubscriptionExpiryReminders(now)
    ]);
    const notificationJobNames = [
      "audit-outbox",
      "email-delivery",
      "push-delivery",
      "learning-reminders",
      "course-purchase-reconciliation",
      "subscription-activation-reconciliation",
      "subscription-expiry-reminders"
    ];
    for (let index = 0; index < notificationJobs.length; index += 1) {
      const result = notificationJobs[index];
      const jobName = notificationJobNames[index] || `notification-job-${index + 1}`;
      const itemFailures = result.status === "fulfilled"
        ? Math.max(0, Number(result.value?.failures) || 0)
        : 1;
      const jobFailed = result.status === "rejected" || itemFailures > 0;
      const alertKey = `notification-job-${jobName}-failure`;

      if (jobFailed) {
        const errorMessage = result.status === "rejected"
          ? String(result.reason?.message || "Unknown notification job error").slice(0, 500)
          : `The job reported ${itemFailures} item-level failure(s).`;
        await recordOperationalAlert({
          key: alertKey,
          severity: "critical",
          source: `notification-worker:${jobName}`,
          message: `${jobName} failed: ${errorMessage}`
        });
        console.error("[worker] notification job failed", {
          job: jobName,
          failures: itemFailures,
          message: errorMessage
        });
      } else {
        await resolveOperationalAlert(alertKey);
      }
    }
    await checkNotificationDeliveryBacklog(now).catch((error) => console.error("[worker] notification backlog check failed", { code: error?.code, name: error?.name }));
    await resolveOperationalAlert("background-maintenance-failure");
    await markMaintenanceCompleted().catch((error) => console.error("[worker] unable to record maintenance completion", { code: error?.code }));
    console.info(`[worker] maintenance completed in ${Date.now() - startedAt}ms; subscriptions expired=${subscriptions.modifiedCount}; trial grants expired=${trialGrants.modifiedCount}; stale payments cancelled=${payments.modifiedCount}; notification jobs=${notificationJobs.map((item) => item.status).join(",")}`);
  } catch (error) {
    await markMaintenanceFailed(error).catch((heartbeatError) => console.error("[worker] unable to record maintenance failure", { code: heartbeatError?.code }));
    // Do not dump provider payloads or raw objects into logs; the message is bounded.
    try {
      await recordOperationalAlert({ key: "background-maintenance-failure", severity: "critical", source: "background-worker", message: `Maintenance failed: ${String(error?.message || "Unknown error").slice(0, 700)}` });
    } catch (alertError) {
      console.error("[worker] failed to persist operational alert", { name: alertError?.name || "Error", code: alertError?.code });
    }
    console.error("[worker] maintenance failed", {
      name: error?.name || "Error",
      message: String(error?.message || "Unknown maintenance error").slice(0, 500),
      code: error?.code
    });
  } finally {
    maintenanceInProgress = false;
  }
}

async function runAnnouncementBatches() {
  if (announcementRunInProgress || stopping) return;
  announcementRunInProgress = true;
  try {
    let totalBatches = 0;
    let totalQueued = 0;
    let totalFailures = 0;
    for (let batch = 0; batch < 5; batch += 1) {
      const result = await processScheduledAnnouncements(new Date(), 1, 100);
      totalBatches += result.batches || 0;
      totalQueued += result.recipientsQueued || 0;
      totalFailures += result.failures || 0;
      if (!result.batches) break;
      // Drain each newly queued batch before claiming more recipients, keeping provider queues bounded.
      await deliverPendingNotificationEmails(100);
      await deliverPendingNotificationPush(100);
    }
    if (!totalBatches) {
      await deliverPendingNotificationEmails(100);
      await deliverPendingNotificationPush(100);
    }
    if (totalBatches) console.info("[worker] announcement batches processed", { batches: totalBatches, recipientsQueued: totalQueued, failures: totalFailures });
  } catch (error) {
    console.error("[worker] announcement processing failed", { name: error?.name || "Error", message: String(error?.message || "Announcement processing failed").slice(0, 300) });
  } finally {
    announcementRunInProgress = false;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] received ${signal}; stopping maintenance scheduler`);
  if (intervalHandle) clearInterval(intervalHandle);
  if (heartbeatHandle) clearInterval(heartbeatHandle);
  if (announcementHandle) clearInterval(announcementHandle);
  try {
    while (maintenanceInProgress || announcementRunInProgress || nightlyRunInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await heartbeatInProgress;
    await heartbeatWorker("stopped").catch((error) => console.error("[worker] unable to record shutdown heartbeat", { code: error?.code }));
    await mongoose.disconnect();
    console.info("[worker] database connection closed");
    process.exitCode = 0;
  } catch (error) {
    console.error("[worker] shutdown failed", { name: error?.name || "Error", code: error?.code });
    process.exitCode = 1;
  }
}

await connectDatabase();
await heartbeatWorker("running");
heartbeatHandle = setInterval(() => {
  heartbeatInProgress = heartbeatWorker("running").catch((error) => {
    console.error("[worker] heartbeat write failed", { code: error?.code, name: error?.name });
  });
}, 60 * 1000);
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
intervalHandle = setInterval(() => void runMaintenance(), intervalMs);
announcementHandle = setInterval(() => void runAnnouncementBatches(), 30 * 1000);
await runMaintenance();
await runAnnouncementBatches();
console.info("[worker] background maintenance worker started");

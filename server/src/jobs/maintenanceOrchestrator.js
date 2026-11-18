import { env } from "../config/env.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { processPendingAuditOutbox } from "../services/auditOutbox.service.js";
import "../models/Course.js";
import { Payment } from "../models/Payment.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { markMaintenanceStarted, markMaintenanceCompleted, markMaintenanceFailed } from "../services/jobHeartbeat.service.js";
import { checkNotificationDeliveryBacklog } from "../services/notificationBacklog.service.js";
import { deliverPendingNotificationEmails, deliverPendingNotificationPush, processLearningReminders, reconcilePendingCoursePurchaseNotifications, reconcilePendingSubscriptionActivationNotifications, processSubscriptionExpiryReminders } from "../services/notification.service.js";
import { processScheduledAnnouncements } from "../services/announcement.service.js";
import { refreshStaleVideos } from "../services/youtubeCompliance.service.js";
import { rebuildSkillPriors } from "../services/skillResourcePrior.service.js";
import { recoverExpiredRoadmapAdmissions } from "../services/roadmapAdmission.service.js";
import { checkPaymentWebhookBacklog, checkYouTubeQuotaOperationalState, resolveRecoveredApi5xxAlert } from "../services/operationalMonitoring.service.js";

/**
 * Creates process-local overlap guards around the shared maintenance
 * handlers. API-inline and standalone processes use the same handlers;
 * cross-process ownership is enforced by leasedJobRunner.js.
 */
export function createMaintenanceOrchestrator() {
  let maintenanceInProgress = false;
  let stopping = false;
  let announcementRunInProgress = false;
  let nightlyRunInProgress = false;
  let lastNightlyRunDate = "";

  async function runNightlyCurationJobs(now = new Date(), { shouldContinue = async () => true } = {}) {
    const day = now.toISOString().slice(0, 10);
    if (!env.enableCurationComplianceWorkers || now.getUTCHours() < 2 || lastNightlyRunDate === day || nightlyRunInProgress || stopping) return { skipped: "not_due_or_disabled" };
    if (!(await shouldContinue())) return { skipped: "lease_lost" };
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

  async function updateLimitedRecords(Model, filter, status, limit = 25) {
    const records = await Model.find(filter).sort({ _id: 1 }).limit(limit).select('_id').lean();
    if (!records.length) return { modifiedCount: 0 };
    return Model.updateMany(
      { ...filter, _id: { $in: records.map((record) => record._id) } },
      { $set: { status } }
    );
  }

  async function runInlineMaintenance({ shouldContinue = async () => true } = {}) {
    if (maintenanceInProgress || stopping) {
      console.info('[inline-worker] maintenance pass skipped because another pass is active or shutdown has started');
      return { skipped: 'busy_or_stopping' };
    }

    maintenanceInProgress = true;
    const startedAt = Date.now();
    await markMaintenanceStarted().catch((error) => console.error('[inline-worker] unable to record maintenance start', { code: error?.code }));

    try {
      const now = new Date();
      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      const recoveredRoadmapAdmissions = await recoverExpiredRoadmapAdmissions({
        now,
        maxItems: 10,
        shouldContinue
      });
      if (recoveredRoadmapAdmissions) console.warn('[inline-worker] recovered expired roadmap admission leases', { count: recoveredRoadmapAdmissions });

      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      const [webhookBacklog, youtubeQuota, api5xxRecovery] = await Promise.all([
        checkPaymentWebhookBacklog(now),
        checkYouTubeQuotaOperationalState(),
        resolveRecoveredApi5xxAlert(now)
      ]);
      if (api5xxRecovery.resolved) console.info('[inline-worker] resolved API 5xx alert after the recovery window elapsed');
      if (webhookBacklog.failed || webhookBacklog.staleProcessing) {
        console.warn('[inline-worker] Razorpay webhook backlog requires attention', {
          failed: webhookBacklog.failed,
          staleProcessing: webhookBacklog.staleProcessing
        });
      }
      if (youtubeQuota.state !== 'ok' || youtubeQuota.store === 'unavailable') {
        console.warn('[inline-worker] YouTube quota is not fully available', {
          state: youtubeQuota.state,
          units: youtubeQuota.units,
          budget: youtubeQuota.budget,
          store: youtubeQuota.store,
          resetDay: youtubeQuota.resetDay
        });
      }

      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      const expiryCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [subscriptions, payments, trialGrants] = await Promise.all([
        updateLimitedRecords(UserSubscription, {
          status: { $in: ['trialing', 'active', 'past_due'] },
          currentPeriodEnd: { $lt: now }
        }, 'expired', 25),
        updateLimitedRecords(Payment, {
          status: { $in: ['created', 'pending'] },
          createdAt: { $lt: expiryCutoff }
        }, 'cancelled', 25),
        updateLimitedRecords(TrialGrant, {
          status: 'trialing',
          endsAt: { $lte: now }
        }, 'expired', 25)
      ]);

      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      const notificationJobSpecs = [
        ['audit-outbox', () => processPendingAuditOutbox(25, now, { maxRecoveries: 25 })],
        ['email-delivery', () => deliverPendingNotificationEmails(10)],
        ['push-delivery', () => deliverPendingNotificationPush(10)],
        ['course-purchase-reconciliation', () => reconcilePendingCoursePurchaseNotifications(now, 10, { maxPages: 1, fair: true })],
        ['subscription-activation-reconciliation', () => reconcilePendingSubscriptionActivationNotifications(now, 10, { maxPages: 1, fair: true })]
      ];
      const notificationJobNames = [];
      const notificationJobs = [];
      for (const [jobName, runJob] of notificationJobSpecs) {
        if (!(await shouldContinue())) return { skipped: 'lease_lost' };
        notificationJobNames.push(jobName);
        const [result] = await Promise.allSettled([runJob()]);
        notificationJobs.push(result);
      }
      for (let index = 0; index < notificationJobs.length; index += 1) {
        const result = notificationJobs[index];
        const jobName = notificationJobNames[index] || ('notification-job-' + (index + 1));
        const itemFailures = result.status === 'fulfilled'
          ? Math.max(0, Number(result.value?.failures) || 0)
          : 1;
        const jobFailed = result.status === 'rejected' || itemFailures > 0;
        const alertKey = 'notification-job-' + jobName + '-failure';
        if (jobFailed) {
          const errorMessage = result.status === 'rejected'
            ? String(result.reason?.message || 'Unknown notification job error').slice(0, 500)
            : 'The job reported ' + itemFailures + ' item-level failure(s).';
          await recordOperationalAlert({
            key: alertKey,
            severity: 'critical',
            source: 'inline-notification-worker:' + jobName,
            message: jobName + ' failed: ' + errorMessage
          });
          console.error('[inline-worker] notification job failed', { job: jobName, failures: itemFailures, message: errorMessage });
        } else {
          await resolveOperationalAlert(alertKey);
        }
      }

      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      await checkNotificationDeliveryBacklog(now).catch((error) => console.error('[inline-worker] notification backlog check failed', { code: error?.code, name: error?.name }));
      if (!(await shouldContinue())) return { skipped: 'lease_lost' };
      await resolveOperationalAlert('background-maintenance-failure');
      await markMaintenanceCompleted().catch((error) => console.error('[inline-worker] unable to record maintenance completion', { code: error?.code }));
      console.info('[inline-worker] bounded maintenance completed in ' + (Date.now() - startedAt) + 'ms', {
        subscriptionsExpired: subscriptions.modifiedCount || 0,
        trialGrantsExpired: trialGrants.modifiedCount || 0,
        stalePaymentsCancelled: payments.modifiedCount || 0,
        notificationJobs: notificationJobs.map((item) => item.status)
      });
      return {
        subscriptionsExpired: subscriptions.modifiedCount || 0,
        trialGrantsExpired: trialGrants.modifiedCount || 0,
        stalePaymentsCancelled: payments.modifiedCount || 0,
        notificationJobs: notificationJobs.map((item) => item.status)
      };
    } catch (error) {
      await markMaintenanceFailed(error).catch((heartbeatError) => console.error('[inline-worker] unable to record maintenance failure', { code: heartbeatError?.code }));
      try {
        await recordOperationalAlert({
          key: 'background-maintenance-failure',
          severity: 'critical',
          source: 'inline-background-worker',
          message: 'Maintenance failed: ' + String(error?.message || 'Unknown error').slice(0, 700)
        });
      } catch (alertError) {
        console.error('[inline-worker] failed to persist operational alert', { name: alertError?.name || 'Error', code: alertError?.code });
      }
      console.error('[inline-worker] maintenance failed', {
        name: error?.name || 'Error',
        message: String(error?.message || 'Unknown maintenance error').slice(0, 500),
        code: error?.code
      });
      return { failed: true };
    } finally {
      maintenanceInProgress = false;
    }
  }
  async function runMaintenance({ shouldContinue = async () => true } = {}) {
    if (maintenanceInProgress || stopping) {
      console.info("[worker] maintenance run skipped because another run is active or shutdown has started");
      return;
    }

    maintenanceInProgress = true;
    const startedAt = Date.now();
    await markMaintenanceStarted().catch((error) => console.error("[worker] unable to record maintenance start", { code: error?.code }));

    try {
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
      const now = new Date();
      const recoveredRoadmapAdmissions = await recoverExpiredRoadmapAdmissions({ now, shouldContinue });
      if (recoveredRoadmapAdmissions) console.warn("[worker] recovered expired roadmap admission leases", { count: recoveredRoadmapAdmissions });
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
      const [webhookBacklog, youtubeQuota, api5xxRecovery] = await Promise.all([
        checkPaymentWebhookBacklog(now),
        checkYouTubeQuotaOperationalState(),
        resolveRecoveredApi5xxAlert(now)
      ]);
      if (api5xxRecovery.resolved) console.info("[worker] resolved API 5xx alert after the recovery window elapsed");
      if (webhookBacklog.failed || webhookBacklog.staleProcessing) {
        console.warn("[worker] Razorpay webhook backlog requires attention", {
          failed: webhookBacklog.failed,
          staleProcessing: webhookBacklog.staleProcessing
        });
      }
      if (youtubeQuota.state !== "ok" || youtubeQuota.store === "unavailable") {
        console.warn("[worker] YouTube quota is not fully available", {
          state: youtubeQuota.state,
          units: youtubeQuota.units,
          budget: youtubeQuota.budget,
          store: youtubeQuota.store,
          resetDay: youtubeQuota.resetDay
        });
      }
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
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
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
      const notificationJobs = await Promise.allSettled([
        processPendingAuditOutbox(100, now, { shouldContinue }),
        deliverPendingNotificationEmails(50),
        deliverPendingNotificationPush(50),
        processLearningReminders(now, 500, { shouldContinue }),
        reconcilePendingCoursePurchaseNotifications(now, 100, { shouldContinue }),
        reconcilePendingSubscriptionActivationNotifications(now, 100, { shouldContinue }),
        processSubscriptionExpiryReminders(now, { shouldContinue })
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
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
      await checkNotificationDeliveryBacklog(now).catch((error) => console.error("[worker] notification backlog check failed", { code: error?.code, name: error?.name }));
      if (!(await shouldContinue())) return { skipped: "lease_lost" };
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

  async function runAnnouncementBatches({ maxBatches = 5, deliveryLimit = 100, shouldContinue = async () => true } = {}) {
    if (announcementRunInProgress || stopping) return { skipped: 'busy_or_stopping' };
    const safeMaxBatches = Math.max(1, Math.min(5, Math.trunc(Number(maxBatches) || 5)));
    const safeDeliveryLimit = Math.max(1, Math.min(100, Math.trunc(Number(deliveryLimit) || 100)));
    announcementRunInProgress = true;
    try {
      let totalBatches = 0;
      let totalQueued = 0;
      let totalFailures = 0;
      for (let batch = 0; batch < safeMaxBatches; batch += 1) {
        if (stopping || !(await shouldContinue())) break;
        const result = await processScheduledAnnouncements(new Date(), 1, 100);
        totalBatches += result.batches || 0;
        totalQueued += result.recipientsQueued || 0;
        totalFailures += result.failures || 0;
        if (!result.batches) break;
        // Drain each newly queued batch before claiming more recipients, keeping provider queues bounded.
        if (stopping || !(await shouldContinue())) break;
        await deliverPendingNotificationEmails(safeDeliveryLimit);
        await deliverPendingNotificationPush(safeDeliveryLimit);
      }
      if (!totalBatches && !stopping && await shouldContinue()) {
        await deliverPendingNotificationEmails(safeDeliveryLimit);
        await deliverPendingNotificationPush(safeDeliveryLimit);
      }
      if (totalBatches) console.info('[worker] announcement batches processed', { batches: totalBatches, recipientsQueued: totalQueued, failures: totalFailures });
      return { batches: totalBatches, recipientsQueued: totalQueued, failures: totalFailures };
    } catch (error) {
      console.error('[worker] announcement processing failed', { name: error?.name || 'Error', message: String(error?.message || 'Announcement processing failed').slice(0, 300) });
      return { failed: true };
    } finally {
      announcementRunInProgress = false;
    }
  }



  function stop() {
    stopping = true;
  }

  function isBusy() {
    return maintenanceInProgress || announcementRunInProgress || nightlyRunInProgress;
  }

  async function waitForIdle(pollIntervalMs = 100) {
    const interval = Math.max(10, Math.min(1000, Number(pollIntervalMs) || 100));
    while (isBusy()) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  return Object.freeze({
    runMaintenance,
    runNightlyCurationJobs,
    runInlineMaintenance,
    runAnnouncementBatches,
    stop,
    isBusy,
    waitForIdle
  });
}

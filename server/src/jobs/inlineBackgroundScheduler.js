import crypto from "node:crypto";
import { heartbeatWorker } from "../services/jobHeartbeat.service.js";
import {
  acquireJobLease,
  isJobLeaseOwned,
  renewJobLease,
  releaseJobLease,
  DEFAULT_JOB_LEASE_DURATION_MS,
  DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS,
  JOB_LEASE_KEYS
} from "../services/jobLease.service.js";
import { createMaintenanceOrchestrator } from "./maintenanceOrchestrator.js";

export const INLINE_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
export const INLINE_ANNOUNCEMENT_INTERVAL_MS = 30 * 1000;
export const INLINE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * Runs small, lease-protected job passes inside the API process.
 *
 * Every scheduler category has a dedicated MongoDB lease. The handler receives
 * an asynchronous ownership checkpoint and must stop claiming new work when
 * the lease is lost or shutdown begins.
 */
export function createInlineBackgroundScheduler({
  ownerId = String(process.pid) + ":" + crypto.randomUUID(),
  leaseDurationMs = DEFAULT_JOB_LEASE_DURATION_MS,
  leaseRenewalIntervalMs = DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS,
  maintenanceIntervalMs = INLINE_MAINTENANCE_INTERVAL_MS,
  announcementIntervalMs = INLINE_ANNOUNCEMENT_INTERVAL_MS,
  heartbeatIntervalMs = INLINE_HEARTBEAT_INTERVAL_MS,
  orchestrator = createMaintenanceOrchestrator(),
  dependencies = {},
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  const acquireLease = dependencies.acquireJobLease || acquireJobLease;
  const renewLease = dependencies.renewJobLease || renewJobLease;
  const releaseLease = dependencies.releaseJobLease || releaseJobLease;
  const checkLease = dependencies.isJobLeaseOwned || isJobLeaseOwned;
  const writeHeartbeat = dependencies.heartbeatWorker || heartbeatWorker;

  const normalizedOwnerId = String(ownerId || "").trim();
  if (!normalizedOwnerId || normalizedOwnerId.length > 128) {
    throw new TypeError("A non-empty background scheduler ownerId of at most 128 characters is required.");
  }
  if (!orchestrator || typeof orchestrator.runInlineMaintenance !== "function" ||
      typeof orchestrator.runAnnouncementBatches !== "function" ||
      typeof orchestrator.stop !== "function" || typeof orchestrator.waitForIdle !== "function") {
    throw new TypeError("A compatible maintenance orchestrator is required.");
  }

  let started = false;
  let stopping = false;
  let maintenanceTimer;
  let announcementTimer;
  let heartbeatTimer;
  let heartbeatInProgress = Promise.resolve();
  const activeJobs = new Map();

  function logLeaseLost(jobKey, reason) {
    logger.warn?.("[inline-worker] scheduler lease lost; stopping new batches", {
      jobKey,
      ownerId: normalizedOwnerId,
      reason
    });
  }

  async function runLeasedJob(jobKey, handler) {
    if (stopping) return { skipped: "stopping" };
    if (activeJobs.has(jobKey)) return { skipped: "local_run_active" };

    const runPromise = (async () => {
      let lease;
      try {
        lease = await acquireLease({
          jobKey,
          ownerId: normalizedOwnerId,
          leaseDurationMs
        });
      } catch (error) {
        logger.error?.("[inline-worker] unable to acquire scheduler lease", {
          jobKey,
          name: error?.name || "Error",
          code: error?.code
        });
        return { skipped: "lease_acquisition_failed" };
      }

      if (!lease) {
        return { skipped: "lease_held_by_another_instance" };
      }

      const leaseIdentity = {
        jobKey,
        ownerId: normalizedOwnerId,
        leaseToken: lease.leaseToken
      };
      let leaseLost = false;
      let renewalPromise = null;

      const renew = async () => {
        if (leaseLost || stopping || renewalPromise) return renewalPromise;
        renewalPromise = (async () => {
          try {
            const renewed = await renewLease({
              ...leaseIdentity,
              leaseDurationMs
            });
            if (!renewed) {
              leaseLost = true;
              logLeaseLost(jobKey, "renewal_rejected");
            }
          } catch (error) {
            leaseLost = true;
            logLeaseLost(jobKey, error?.code || error?.name || "renewal_error");
          } finally {
            renewalPromise = null;
          }
        })();
        return renewalPromise;
      };

      const renewalTimer = setIntervalFn(() => {
        void renew();
      }, leaseRenewalIntervalMs);
      renewalTimer?.unref?.();

      const shouldContinue = async () => {
        if (stopping || leaseLost) return false;
        try {
          const owned = await checkLease(leaseIdentity);
          if (!owned) {
            leaseLost = true;
            logLeaseLost(jobKey, "ownership_check_failed");
          }
          return owned;
        } catch (error) {
          leaseLost = true;
          logLeaseLost(jobKey, error?.code || error?.name || "ownership_check_error");
          return false;
        }
      };

      try {
        if (!(await shouldContinue())) return { skipped: "lease_not_owned" };
        const result = await handler({ shouldContinue, lease });
        return leaseLost ? { ...(result || {}), leaseLost: true } : result;
      } finally {
        clearIntervalFn(renewalTimer);
        if (renewalPromise) await renewalPromise;
        await releaseLease(leaseIdentity).catch((error) => {
          logger.warn?.("[inline-worker] unable to release scheduler lease", {
            jobKey,
            name: error?.name || "Error",
            code: error?.code
          });
        });
      }
    })();

    activeJobs.set(jobKey, runPromise);
    try {
      return await runPromise;
    } finally {
      activeJobs.delete(jobKey);
    }
  }

  function runMaintenance() {
    return runLeasedJob(
      JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE,
      ({ shouldContinue }) => orchestrator.runInlineMaintenance({ shouldContinue })
    );
  }

  function runAnnouncements() {
    return runLeasedJob(
      JOB_LEASE_KEYS.ANNOUNCEMENT_DISPATCH,
      ({ shouldContinue }) => orchestrator.runAnnouncementBatches({
        maxBatches: 1,
        deliveryLimit: 10,
        shouldContinue
      })
    );
  }

  function pulseHeartbeat() {
    heartbeatInProgress = heartbeatInProgress
      .then(() => writeHeartbeat("running"))
      .catch((error) => {
        logger.error?.("[inline-worker] heartbeat write failed", {
          name: error?.name || "Error",
          code: error?.code
        });
      });
    return heartbeatInProgress;
  }

  async function start() {
    if (started) return { started: false, reason: "already_started" };
    if (stopping) return { started: false, reason: "already_stopped" };
    started = true;

    await writeHeartbeat("running");
    heartbeatTimer = setIntervalFn(() => {
      void pulseHeartbeat();
    }, heartbeatIntervalMs);
    heartbeatTimer?.unref?.();

    maintenanceTimer = setIntervalFn(() => {
      void runMaintenance();
    }, maintenanceIntervalMs);
    maintenanceTimer?.unref?.();

    announcementTimer = setIntervalFn(() => {
      void runAnnouncements();
    }, announcementIntervalMs);
    announcementTimer?.unref?.();

    // Opportunistic startup pass; API listening does not wait for job completion.
    void runMaintenance();
    void runAnnouncements();

    logger.info?.("[inline-worker] bounded API-side scheduler started", {
      ownerId: normalizedOwnerId,
      maintenanceIntervalMs,
      announcementIntervalMs,
      leaseDurationMs,
      leaseRenewalIntervalMs
    });
    return { started: true, ownerId: normalizedOwnerId };
  }

  async function stop() {
    if (stopping) {
      await Promise.allSettled([...activeJobs.values()]);
      return { stopped: true, alreadyStopping: true };
    }
    stopping = true;
    if (maintenanceTimer) clearIntervalFn(maintenanceTimer);
    if (announcementTimer) clearIntervalFn(announcementTimer);
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer);

    orchestrator.stop();
    await Promise.allSettled([...activeJobs.values()]);
    await orchestrator.waitForIdle();
    await heartbeatInProgress;
    await writeHeartbeat("stopped");
    logger.info?.("[inline-worker] scheduler stopped and active jobs drained", { ownerId: normalizedOwnerId });
    return { stopped: true, ownerId: normalizedOwnerId };
  }

  return Object.freeze({
    start,
    stop,
    runMaintenance,
    runAnnouncements,
    isRunning: () => started && !stopping,
    isBusy: () => activeJobs.size > 0,
    getActiveJobKeys: () => [...activeJobs.keys()],
    ownerId: normalizedOwnerId
  });
}

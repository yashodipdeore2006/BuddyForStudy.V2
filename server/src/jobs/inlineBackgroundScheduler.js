import { heartbeatWorker } from "../services/jobHeartbeat.service.js";
import { JOB_LEASE_KEYS } from "../services/jobLease.service.js";
import { createLeasedJobRunner } from "./leasedJobRunner.js";
import { createMaintenanceOrchestrator } from "./maintenanceOrchestrator.js";

export const INLINE_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
export const INLINE_ANNOUNCEMENT_INTERVAL_MS = 30 * 1000;
export const INLINE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * Runs bounded job passes in the API process. The same shared lease runner is
 * also used by the standalone worker so both modes coordinate through MongoDB.
 */
export function createInlineBackgroundScheduler({
  ownerId,
  leaseDurationMs,
  leaseRenewalIntervalMs,
  maintenanceIntervalMs = INLINE_MAINTENANCE_INTERVAL_MS,
  announcementIntervalMs = INLINE_ANNOUNCEMENT_INTERVAL_MS,
  heartbeatIntervalMs = INLINE_HEARTBEAT_INTERVAL_MS,
  orchestrator = createMaintenanceOrchestrator(),
  dependencies = {},
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  const writeHeartbeat = dependencies.heartbeatWorker || heartbeatWorker;
  const leaseRunner = createLeasedJobRunner({
    ownerId,
    leaseDurationMs,
    leaseRenewalIntervalMs,
    dependencies,
    logger,
    setIntervalFn,
    clearIntervalFn
  });

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
  let stopPromise = null;

  function runMaintenance() {
    return leaseRunner.run(
      JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE,
      ({ shouldContinue }) => orchestrator.runInlineMaintenance({ shouldContinue })
    );
  }

  function runAnnouncements() {
    return leaseRunner.run(
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
    heartbeatTimer = setIntervalFn(() => { void pulseHeartbeat(); }, heartbeatIntervalMs);
    heartbeatTimer?.unref?.();
    maintenanceTimer = setIntervalFn(() => { void runMaintenance(); }, maintenanceIntervalMs);
    maintenanceTimer?.unref?.();
    announcementTimer = setIntervalFn(() => { void runAnnouncements(); }, announcementIntervalMs);
    announcementTimer?.unref?.();

    // Opportunistic startup pass; API listening does not wait for job completion.
    void runMaintenance();
    void runAnnouncements();

    logger.info?.("[inline-worker] bounded API-side scheduler started", {
      ownerId: leaseRunner.ownerId,
      maintenanceIntervalMs,
      announcementIntervalMs,
      leaseDurationMs: leaseDurationMs,
      leaseRenewalIntervalMs: leaseRenewalIntervalMs
    });
    return { started: true, ownerId: leaseRunner.ownerId };
  }

  function stop() {
    if (stopPromise) return stopPromise;
    stopping = true;
    if (maintenanceTimer) clearIntervalFn(maintenanceTimer);
    if (announcementTimer) clearIntervalFn(announcementTimer);
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer);

    orchestrator.stop();
    stopPromise = (async () => {
      await leaseRunner.stop();
      await orchestrator.waitForIdle();
      await heartbeatInProgress;
      await writeHeartbeat("stopped");
      logger.info?.("[inline-worker] scheduler stopped and active jobs drained", { ownerId: leaseRunner.ownerId });
      return { stopped: true, ownerId: leaseRunner.ownerId };
    })();
    return stopPromise;
  }

  return Object.freeze({
    start,
    stop,
    runMaintenance,
    runAnnouncements,
    isRunning: () => started && !stopping,
    isBusy: () => leaseRunner.isBusy(),
    getActiveJobKeys: () => leaseRunner.getActiveJobKeys(),
    ownerId: leaseRunner.ownerId
  });
}

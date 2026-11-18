import crypto from "node:crypto";
import {
  acquireJobLease,
  isJobLeaseOwned,
  renewJobLease,
  releaseJobLease,
  DEFAULT_JOB_LEASE_DURATION_MS,
  DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS
} from "../services/jobLease.service.js";

/**
 * Shared distributed-lease runner for both API-inline and standalone jobs.
 * Handlers receive shouldContinue() and must check it before claiming the
 * next durable batch. Existing per-record claims remain the idempotency layer.
 */
export function createLeasedJobRunner({
  ownerId = String(process.pid) + ":" + crypto.randomUUID(),
  leaseDurationMs = DEFAULT_JOB_LEASE_DURATION_MS,
  leaseRenewalIntervalMs = DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS,
  dependencies = {},
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  const acquireLease = dependencies.acquireJobLease || acquireJobLease;
  const renewLease = dependencies.renewJobLease || renewJobLease;
  const releaseLease = dependencies.releaseJobLease || releaseJobLease;
  const checkLease = dependencies.isJobLeaseOwned || isJobLeaseOwned;

  const normalizedOwnerId = String(ownerId || "").trim();
  if (!normalizedOwnerId || normalizedOwnerId.length > 128) {
    throw new TypeError("A non-empty lease runner ownerId of at most 128 characters is required.");
  }
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1000 ||
      leaseDurationMs > 24 * 60 * 60 * 1000) {
    throw new RangeError("leaseDurationMs must be an integer between 1000 and 86400000.");
  }
  if (!Number.isSafeInteger(leaseRenewalIntervalMs) || leaseRenewalIntervalMs < 250 ||
      leaseRenewalIntervalMs >= leaseDurationMs) {
    throw new RangeError("leaseRenewalIntervalMs must be an integer below the lease duration and at least 250.");
  }

  let stopping = false;
  const activeJobs = new Map();

  async function execute(jobKey, handler) {
    let lease;
    try {
      lease = await acquireLease({ jobKey, ownerId: normalizedOwnerId, leaseDurationMs });
    } catch (error) {
      logger.error?.("[background-worker] unable to acquire scheduler lease", {
        jobKey,
        name: error?.name || "Error",
        code: error?.code
      });
      return { skipped: "lease_acquisition_failed" };
    }

    if (!lease) return { skipped: "lease_held_by_another_instance" };

    const identity = { jobKey, ownerId: normalizedOwnerId, leaseToken: lease.leaseToken };
    let leaseLost = false;
    let renewalPromise = null;

    const markLost = (reason) => {
      if (leaseLost) return;
      leaseLost = true;
      logger.warn?.("[background-worker] scheduler lease lost; stopping new batches", {
        jobKey,
        ownerId: normalizedOwnerId,
        reason
      });
    };

    const renew = async () => {
      if (leaseLost || stopping || renewalPromise) return renewalPromise;
      renewalPromise = (async () => {
        try {
          const renewed = await renewLease({ ...identity, leaseDurationMs });
          if (!renewed) markLost("renewal_rejected");
        } catch (error) {
          markLost(error?.code || error?.name || "renewal_error");
        } finally {
          renewalPromise = null;
        }
      })();
      return renewalPromise;
    };

    const renewalTimer = setIntervalFn(() => { void renew(); }, leaseRenewalIntervalMs);
    renewalTimer?.unref?.();

    const shouldContinue = async () => {
      if (stopping || leaseLost) return false;
      try {
        const owned = await checkLease(identity);
        if (!owned) markLost("ownership_check_failed");
        return owned;
      } catch (error) {
        markLost(error?.code || error?.name || "ownership_check_error");
        return false;
      }
    };

    try {
      if (!(await shouldContinue())) return { skipped: "lease_not_owned" };
      const result = await handler({ shouldContinue, lease });
      return leaseLost ? { ...(result || {}), leaseLost: true } : result;
    } catch (error) {
      logger.error?.("[background-worker] scheduled job handler failed", {
        jobKey,
        name: error?.name || "Error",
        code: error?.code,
        message: String(error?.message || "Scheduled job failed").slice(0, 300)
      });
      return { failed: true };
    } finally {
      clearIntervalFn(renewalTimer);
      if (renewalPromise) await renewalPromise;
      await releaseLease(identity).catch((error) => {
        logger.warn?.("[background-worker] unable to release scheduler lease", {
          jobKey,
          name: error?.name || "Error",
          code: error?.code
        });
      });
    }
  }

  function run(jobKey, handler) {
    if (stopping) return Promise.resolve({ skipped: "stopping" });
    if (typeof jobKey !== "string" || !jobKey.trim()) {
      return Promise.reject(new TypeError("jobKey is required."));
    }
    if (typeof handler !== "function") {
      return Promise.reject(new TypeError("A job handler is required."));
    }
    if (activeJobs.has(jobKey)) {
      return Promise.resolve({ skipped: "local_run_active" });
    }

    const promise = execute(jobKey, handler);
    activeJobs.set(jobKey, promise);
    return promise.finally(() => activeJobs.delete(jobKey));
  }

  function stop() {
    stopping = true;
    return waitForIdle();
  }

  async function waitForIdle() {
    while (activeJobs.size) {
      await Promise.allSettled([...activeJobs.values()]);
    }
  }

  return Object.freeze({
    run,
    stop,
    waitForIdle,
    isStopping: () => stopping,
    isBusy: () => activeJobs.size > 0,
    getActiveJobKeys: () => [...activeJobs.keys()],
    ownerId: normalizedOwnerId
  });
}

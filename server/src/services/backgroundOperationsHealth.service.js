import { JobLease } from "../models/JobLease.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { env } from "../config/env.js";
import { JOB_LEASE_KEYS } from "./jobLease.service.js";
import {
  checkWorkerHeartbeat,
  WORKER_HEARTBEAT_STALE_AFTER_MS
} from "./jobHeartbeat.service.js";

export const BACKGROUND_JOB_LEASES = Object.freeze([
  { jobKey: JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE, label: "Background maintenance" },
  { jobKey: JOB_LEASE_KEYS.ANNOUNCEMENT_DISPATCH, label: "Announcement dispatch" },
  { jobKey: JOB_LEASE_KEYS.YOUTUBE_CURATION, label: "YouTube curation" }
]);

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyJobLease(lease, now = new Date()) {
  if (!lease) return "idle";

  const leaseUntil = dateOrNull(lease.leaseUntil);
  if (leaseUntil && leaseUntil.getTime() > now.getTime()) return "active";

  const releasedAt = dateOrNull(lease.releasedAt);
  if (releasedAt) return "released";

  // Compatibility for lease documents created before releasedAt was added.
  // The previous release implementation wrote leaseUntil and renewedAt to
  // exactly the same timestamp, while an interrupted lease expires later.
  const renewedAt = dateOrNull(lease.renewedAt);
  if (leaseUntil && renewedAt &&
      Math.abs(leaseUntil.getTime() - renewedAt.getTime()) <= 1000) {
    return "released";
  }

  return "expired";
}

export async function checkBackgroundJobLeases(
  now = new Date(),
  mode = env.backgroundWorkerMode,
  dependencies = {}
) {
  const findLeases = dependencies.findLeases || (() => JobLease.find({
    jobKey: { $in: BACKGROUND_JOB_LEASES.map((entry) => entry.jobKey) }
  }).lean());
  const recordAlert = dependencies.recordAlert || recordOperationalAlert;
  const resolveAlert = dependencies.resolveAlert || resolveOperationalAlert;

  const rows = await findLeases();
  const byKey = new Map((rows || []).map((lease) => [lease.jobKey, lease]));
  const jobs = [];

  for (const definition of BACKGROUND_JOB_LEASES) {
    const lease = byKey.get(definition.jobKey) || null;
    const leaseStatus = classifyJobLease(lease, now);
    const alertKey = "background-job-lease-expired:" + definition.jobKey;

    if (mode !== "disabled" && leaseStatus === "expired") {
      await recordAlert({
        key: alertKey,
        severity: "warning",
        source: "background-job-lease",
        message: definition.label + " lease expired without a recorded release. The next scheduler pass may recover it."
      });
    } else {
      await resolveAlert(alertKey);
    }

    const leaseUntil = dateOrNull(lease?.leaseUntil);
    const renewedAt = dateOrNull(lease?.renewedAt);
    const acquiredAt = dateOrNull(lease?.acquiredAt);
    const remainingMs = leaseStatus === "active" && leaseUntil
      ? Math.max(0, leaseUntil.getTime() - now.getTime())
      : null;

    jobs.push({
      jobKey: definition.jobKey,
      label: definition.label,
      status: mode === "disabled" && leaseStatus === "expired" ? "not_expected" : leaseStatus,
      leaseUntil: leaseUntil?.toISOString() || null,
      remainingSeconds: remainingMs === null ? null : Math.ceil(remainingMs / 1000),
      acquiredAt: acquiredAt?.toISOString() || null,
      lastRenewedAt: renewedAt?.toISOString() || null,
      fencingToken: Number(lease?.fencingToken || 0)
    });
  }

  return jobs;
}

export async function getBackgroundOperationsHealth({
  now = new Date(),
  mode = env.backgroundWorkerMode,
  staleAfterMs = WORKER_HEARTBEAT_STALE_AFTER_MS,
  workerCheck = checkWorkerHeartbeat,
  leaseCheck = checkBackgroundJobLeases
} = {}) {
  const [worker, jobs] = await Promise.all([
    workerCheck(now, staleAfterMs, mode),
    leaseCheck(now, mode)
  ]);

  const hasExpiredLease = jobs.some((job) => job.status === "expired");
  const status = mode === "disabled"
    ? "disabled"
    : worker.status === "stale" || hasExpiredLease || Number(worker.consecutiveFailures || 0) > 0
      ? "degraded"
      : worker.status === "stopping"
        ? "stopping"
        : "healthy";

  return {
    mode,
    status,
    checkedAt: now.toISOString(),
    worker,
    jobs
  };
}

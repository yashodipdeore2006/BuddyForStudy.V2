import { JobHeartbeat } from "../models/JobHeartbeat.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { env } from "../config/env.js";

export const WORKER_JOB_NAME = "background-maintenance-worker";
export const WORKER_HEARTBEAT_STALE_AFTER_MS = 5 * 60 * 1000;
export const MAINTENANCE_FAILURE_ALERT_KEY = "background-worker-maintenance-failures";

function heartbeatMetadata(metadata = {}) {
  const result = {};
  if (["inline", "standalone", "disabled"].includes(metadata.executionMode)) {
    result.executionMode = metadata.executionMode;
  }
  if (typeof metadata.instanceId === "string" && metadata.instanceId.trim()) {
    result.instanceId = metadata.instanceId.trim().slice(0, 128);
  }
  return result;
}

export async function heartbeatWorker(workerStatus = "running", now = new Date(), metadata = {}) {
  const fields = { workerStatus, lastHeartbeatAt: now, ...heartbeatMetadata(metadata) };
  if (workerStatus === "running" && metadata.started === true) fields.lastStartedAt = now;
  if (workerStatus === "stopping") fields.shutdownStartedAt = now;
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: fields },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export function markWorkerStopping(now = new Date(), metadata = {}) {
  return heartbeatWorker("stopping", now, metadata);
}

export async function markMaintenanceStarted(now = new Date()) {
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { lastHeartbeatAt: now, lastMaintenanceStartedAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export async function markMaintenanceCompleted(now = new Date()) {
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { lastHeartbeatAt: now, lastMaintenanceCompletedAt: now, lastError: "", consecutiveFailures: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export async function markMaintenanceFailed(error, now = new Date()) {
  const message = String(error?.message || "Unknown maintenance failure").slice(0, 500);
  const heartbeat = await JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { lastHeartbeatAt: now, lastError: message }, $inc: { consecutiveFailures: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return heartbeat;
}

export async function checkWorkerHeartbeat(
  now = new Date(),
  staleAfterMs = WORKER_HEARTBEAT_STALE_AFTER_MS,
  mode = env.backgroundWorkerMode
) {
  if (mode === "disabled") {
    await resolveOperationalAlert("background-worker-heartbeat-stale");
    await resolveOperationalAlert(MAINTENANCE_FAILURE_ALERT_KEY);
    return {
      jobName: WORKER_JOB_NAME,
      mode,
      status: "disabled",
      workerStatus: "not_expected",
      lastHeartbeatAt: null,
      heartbeatAgeSeconds: null,
      staleAfterSeconds: Math.floor(staleAfterMs / 1000),
      lastMaintenanceStartedAt: null,
      lastMaintenanceCompletedAt: null,
      lastError: "",
      consecutiveFailures: 0
    };
  }

  const heartbeat = await JobHeartbeat.findOne({ jobName: WORKER_JOB_NAME }).lean();
  const lastHeartbeatAt = heartbeat?.lastHeartbeatAt ? new Date(heartbeat.lastHeartbeatAt) : null;
  const ageMs = lastHeartbeatAt ? Math.max(0, now.getTime() - lastHeartbeatAt.getTime()) : null;
  const stopping = heartbeat?.workerStatus === "stopping" && lastHeartbeatAt && ageMs <= staleAfterMs;
  const stale = !stopping && (!heartbeat || heartbeat.workerStatus !== "running" || !lastHeartbeatAt || ageMs > staleAfterMs);

  if (stale) {
    const reason = !heartbeat || !lastHeartbeatAt
      ? "The background worker has not reported a heartbeat."
      : heartbeat.workerStatus === "stopped"
        ? "The background worker reported that it stopped."
        : `The background worker heartbeat is stale (${Math.floor(ageMs / 1000)} seconds old).`;
    await recordOperationalAlert({
      key: "background-worker-heartbeat-stale",
      severity: "critical",
      source: "background-worker-heartbeat",
      message: `${reason} Expected a heartbeat at least every 60 seconds; stale threshold is ${Math.floor(staleAfterMs / 1000)} seconds.`
    });
  } else {
    await resolveOperationalAlert("background-worker-heartbeat-stale");
  }

  const consecutiveFailures = Number(heartbeat?.consecutiveFailures || 0);
  if (consecutiveFailures > 0) {
    await recordOperationalAlert({
      key: MAINTENANCE_FAILURE_ALERT_KEY,
      severity: consecutiveFailures >= 5 ? "critical" : "warning",
      source: "background-worker-maintenance",
      message: `Background maintenance has ${consecutiveFailures} consecutive failure(s). Last error: ${String(heartbeat?.lastError || "No error detail reported").slice(0, 300)}`
    });
  } else {
    await resolveOperationalAlert(MAINTENANCE_FAILURE_ALERT_KEY);
  }

  return {
    jobName: WORKER_JOB_NAME,
    mode,
    status: stale ? "stale" : stopping ? "stopping" : consecutiveFailures > 0 ? "degraded" : "healthy",
    workerStatus: heartbeat?.workerStatus || "unknown",
    instanceId: heartbeat?.instanceId || "",
    lastHeartbeatAt: lastHeartbeatAt?.toISOString() || null,
    heartbeatAgeSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    staleAfterSeconds: Math.floor(staleAfterMs / 1000),
    lastStartedAt: heartbeat?.lastStartedAt || null,
    shutdownStartedAt: heartbeat?.shutdownStartedAt || null,
    lastMaintenanceStartedAt: heartbeat?.lastMaintenanceStartedAt || null,
    lastMaintenanceCompletedAt: heartbeat?.lastMaintenanceCompletedAt || null,
    lastError: heartbeat?.lastError || "",
    consecutiveFailures: heartbeat?.consecutiveFailures || 0
  };
}

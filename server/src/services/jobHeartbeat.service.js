import { JobHeartbeat } from "../models/JobHeartbeat.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";

export const WORKER_JOB_NAME = "background-maintenance-worker";
export const WORKER_HEARTBEAT_STALE_AFTER_MS = 5 * 60 * 1000;

export async function heartbeatWorker(workerStatus = "running", now = new Date()) {
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { workerStatus, lastHeartbeatAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export async function markMaintenanceStarted(now = new Date()) {
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { workerStatus: "running", lastHeartbeatAt: now, lastMaintenanceStartedAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export async function markMaintenanceCompleted(now = new Date()) {
  return JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { workerStatus: "running", lastHeartbeatAt: now, lastMaintenanceCompletedAt: now, lastError: "" }, $setOnInsert: { consecutiveFailures: 0 }, $inc: { consecutiveFailures: -1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).then(async (heartbeat) => {
    if (heartbeat && heartbeat.consecutiveFailures < 0) {
      heartbeat.consecutiveFailures = 0;
      await heartbeat.save();
    }
    return heartbeat;
  });
}

export async function markMaintenanceFailed(error, now = new Date()) {
  const message = String(error?.message || "Unknown maintenance failure").slice(0, 500);
  const heartbeat = await JobHeartbeat.findOneAndUpdate(
    { jobName: WORKER_JOB_NAME },
    { $set: { workerStatus: "running", lastHeartbeatAt: now, lastError: message }, $inc: { consecutiveFailures: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return heartbeat;
}

export async function checkWorkerHeartbeat(now = new Date(), staleAfterMs = WORKER_HEARTBEAT_STALE_AFTER_MS) {
  const heartbeat = await JobHeartbeat.findOne({ jobName: WORKER_JOB_NAME }).lean();
  const lastHeartbeatAt = heartbeat?.lastHeartbeatAt ? new Date(heartbeat.lastHeartbeatAt) : null;
  const ageMs = lastHeartbeatAt ? Math.max(0, now.getTime() - lastHeartbeatAt.getTime()) : null;
  const stale = !heartbeat || heartbeat.workerStatus === "stopped" || !lastHeartbeatAt || ageMs > staleAfterMs;

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

  return {
    jobName: WORKER_JOB_NAME,
    status: stale ? "stale" : "healthy",
    workerStatus: heartbeat?.workerStatus || "unknown",
    lastHeartbeatAt: lastHeartbeatAt?.toISOString() || null,
    heartbeatAgeSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    staleAfterSeconds: Math.floor(staleAfterMs / 1000),
    lastMaintenanceStartedAt: heartbeat?.lastMaintenanceStartedAt || null,
    lastMaintenanceCompletedAt: heartbeat?.lastMaintenanceCompletedAt || null,
    lastError: heartbeat?.lastError || "",
    consecutiveFailures: heartbeat?.consecutiveFailures || 0
  };
}

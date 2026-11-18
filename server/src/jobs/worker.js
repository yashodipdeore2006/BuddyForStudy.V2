import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { heartbeatWorker } from "../services/jobHeartbeat.service.js";
import { env } from "../config/env.js";
import { JOB_LEASE_KEYS } from "../services/jobLease.service.js";
import { createLeasedJobRunner } from "./leasedJobRunner.js";
import { createMaintenanceOrchestrator } from "./maintenanceOrchestrator.js";

const maintenanceIntervalMs = 15 * 60 * 1000;
const announcementIntervalMs = 30 * 1000;
if (env.backgroundWorkerMode !== "standalone") {
  console.error("[worker] refusing to start: BACKGROUND_WORKER_MODE must be standalone", {
    configuredMode: env.backgroundWorkerMode
  });
  process.exit(1);
}

const orchestrator = createMaintenanceOrchestrator();
const leaseRunner = createLeasedJobRunner();

let maintenanceHandle;
let stopping = false;
let heartbeatHandle;
let heartbeatInProgress = Promise.resolve();
let announcementHandle;

function runMaintenance() {
  return leaseRunner.run(
    JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE,
    ({ shouldContinue }) => orchestrator.runMaintenance({ shouldContinue })
  );
}

function runAnnouncementBatches() {
  return leaseRunner.run(
    JOB_LEASE_KEYS.ANNOUNCEMENT_DISPATCH,
    ({ shouldContinue }) => orchestrator.runAnnouncementBatches({ shouldContinue })
  );
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.info("[worker] received " + signal + "; stopping maintenance scheduler");
  if (maintenanceHandle) clearInterval(maintenanceHandle);
  if (heartbeatHandle) clearInterval(heartbeatHandle);
  if (announcementHandle) clearInterval(announcementHandle);
  orchestrator.stop();

  try {
    await leaseRunner.stop();
    await orchestrator.waitForIdle();
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
  heartbeatInProgress = heartbeatInProgress.then(() => heartbeatWorker("running")).catch((error) => {
    console.error("[worker] heartbeat write failed", { code: error?.code, name: error?.name });
  });
}, 60 * 1000);
heartbeatHandle.unref?.();
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
maintenanceHandle = setInterval(() => void runMaintenance(), maintenanceIntervalMs);
announcementHandle = setInterval(() => void runAnnouncementBatches(), announcementIntervalMs);
maintenanceHandle.unref?.();
announcementHandle.unref?.();
await runMaintenance();
await runAnnouncementBatches();
console.info("[worker] background maintenance worker started", {
  ownerId: leaseRunner.ownerId,
  maintenanceIntervalMs,
  announcementIntervalMs
});

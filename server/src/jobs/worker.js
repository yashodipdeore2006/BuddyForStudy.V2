import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { heartbeatWorker } from "../services/jobHeartbeat.service.js";
import { env } from "../config/env.js";
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

let maintenanceHandle;
let stopping = false;
let heartbeatHandle;
let heartbeatInProgress = Promise.resolve();
let announcementHandle;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.info("[worker] received " + signal + "; stopping maintenance scheduler");
  orchestrator.stop();
  if (maintenanceHandle) clearInterval(maintenanceHandle);
  if (heartbeatHandle) clearInterval(heartbeatHandle);
  if (announcementHandle) clearInterval(announcementHandle);

  try {
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
  heartbeatInProgress = heartbeatWorker("running").catch((error) => {
    console.error("[worker] heartbeat write failed", { code: error?.code, name: error?.name });
  });
}, 60 * 1000);
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
maintenanceHandle = setInterval(() => void orchestrator.runMaintenance(), maintenanceIntervalMs);
announcementHandle = setInterval(() => void orchestrator.runAnnouncementBatches(), announcementIntervalMs);
await orchestrator.runMaintenance();
await orchestrator.runAnnouncementBatches();
console.info("[worker] background maintenance worker started");

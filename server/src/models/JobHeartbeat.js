import mongoose from "mongoose";

const jobHeartbeatSchema = new mongoose.Schema({
  jobName: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  lastHeartbeatAt: { type: Date, default: null, index: true },
  workerStatus: { type: String, enum: ["running", "stopping", "stopped", "unknown"], default: "unknown", index: true },
  executionMode: { type: String, enum: ["inline", "standalone", "disabled"], default: null, index: true },
  instanceId: { type: String, default: "", maxlength: 128 },
  lastStartedAt: { type: Date, default: null },
  shutdownStartedAt: { type: Date, default: null },
  lastMaintenanceStartedAt: { type: Date, default: null },
  lastMaintenanceCompletedAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 500 },
  consecutiveFailures: { type: Number, default: 0, min: 0 }
}, { timestamps: true, collection: "job_heartbeats" });


export const JobHeartbeat = mongoose.model("JobHeartbeat", jobHeartbeatSchema);

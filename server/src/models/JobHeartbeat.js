import mongoose from "mongoose";

const jobHeartbeatSchema = new mongoose.Schema({
  jobName: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  lastHeartbeatAt: { type: Date, default: null, index: true },
  workerStatus: { type: String, enum: ["running", "stopped", "unknown"], default: "unknown", index: true },
  lastMaintenanceStartedAt: { type: Date, default: null },
  lastMaintenanceCompletedAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 500 },
  consecutiveFailures: { type: Number, default: 0, min: 0 }
}, { timestamps: true, collection: "job_heartbeats" });

jobHeartbeatSchema.index({ jobName: 1 }, { unique: true });

export const JobHeartbeat = mongoose.model("JobHeartbeat", jobHeartbeatSchema);

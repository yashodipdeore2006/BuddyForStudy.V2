import mongoose from "mongoose";

const operationalAlertSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 160 },
  severity: { type: String, enum: ["info", "warning", "critical"], default: "warning", index: true },
  source: { type: String, required: true, trim: true, maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  occurrenceCount: { type: Number, default: 1, min: 1 },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  acknowledgedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true, collection: "operational_alerts" });

operationalAlertSchema.index({ key: 1 }, { unique: true });
operationalAlertSchema.index({ status: 1, lastSeenAt: -1 });

export const OperationalAlert = mongoose.model("OperationalAlert", operationalAlertSchema);
export async function recordOperationalAlert({ key, severity = "warning", source, message }) {
  const now = new Date();
  return OperationalAlert.findOneAndUpdate(
    { key },
    { $set: { severity, source, message: String(message || "Operational issue detected").slice(0, 1000), status: "open", lastSeenAt: now, resolvedAt: null }, $setOnInsert: { firstSeenAt: now }, $inc: { occurrenceCount: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  );
}
export async function resolveOperationalAlert(key) {
  return OperationalAlert.findOneAndUpdate({ key, status: { $ne: "resolved" } }, { $set: { status: "resolved", resolvedAt: new Date() } }, { new: true });
}

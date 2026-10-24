import mongoose from "mongoose";

const auditOutboxSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  event: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["pending", "processing"], default: "pending", index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastError: { type: String, default: "" },
  lockedAt: { type: Date, default: null }
}, { timestamps: true, collection: "audit_outbox" });

auditOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
export const AuditOutbox = mongoose.model("AuditOutbox", auditOutboxSchema);

import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  eventId: { type: String, default: undefined, unique: true, sparse: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: "" },
  reason: { type: String, default: "" },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" }
}, { timestamps: true, collection: "audit_logs" });

auditLogSchema.index({ createdAt: -1 });
export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

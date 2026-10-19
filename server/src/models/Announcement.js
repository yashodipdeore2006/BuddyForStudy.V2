import mongoose from "mongoose";

const channelStatsSchema = new mongoose.Schema({
  sent: { type: Number, default: 0, min: 0 },
  pending: { type: Number, default: 0, min: 0 },
  failed: { type: Number, default: 0, min: 0 },
  skipped: { type: Number, default: 0, min: 0 }
}, { _id: false });

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  audience: { type: String, enum: ["all", "active", "subscribers"], default: "all" },
  targetMode: { type: String, enum: ["audience", "selected", "filtered"], default: "audience" },
  targetUserIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  targetFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
  recipientIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  nextRecipientIndex: { type: Number, default: 0, min: 0 },
  batchLockUntil: { type: Date, default: null },
  nextBatchAt: { type: Date, default: null },
  lastBatchAt: { type: Date, default: null },
  batchLockToken: { type: String, default: "", maxlength: 64 },
  batchAttempts: { type: Number, default: 0, min: 0 },
  channel: { type: [String], enum: ["in_app", "email", "push"], default: ["in_app"] },
  link: { type: String, default: "" },
  status: { type: String, enum: ["draft", "scheduled", "sending", "sent", "failed", "cancelled"], default: "draft", index: true },
  scheduledAt: { type: Date, default: null, index: true },
  timezone: { type: String, default: "Asia/Kolkata", maxlength: 64 },
  startedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  lastError: { type: String, default: "", maxlength: 500 },
  stats: {
    total: { type: Number, default: 0, min: 0 },
    sent: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    in_app: { type: channelStatsSchema, default: () => ({}) },
    email: { type: channelStatsSchema, default: () => ({}) },
    push: { type: channelStatsSchema, default: () => ({}) }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, default: "", maxlength: 500 }
}, { timestamps: true, collection: "announcements" });

announcementSchema.index({ status: 1, scheduledAt: 1, createdAt: 1 });
announcementSchema.index({ status: 1, batchLockUntil: 1, createdAt: 1 });
announcementSchema.index({ status: 1, nextBatchAt: 1, lastBatchAt: 1 });

export const Announcement = mongoose.model("Announcement", announcementSchema);

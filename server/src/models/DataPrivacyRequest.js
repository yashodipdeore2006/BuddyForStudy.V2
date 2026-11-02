import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

export const DATA_PRIVACY_REQUEST_STATUSES = Object.freeze([
  "received",
  "identity_pending",
  "in_review",
  "legal_hold",
  "approved",
  "in_progress",
  "partially_fulfilled",
  "fulfilled",
  "denied",
  "appealed",
]);

const dataPrivacyRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, default: randomUUID, immutable: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  type: { type: String, enum: ["correction", "deletion"], required: true, immutable: true },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1500, immutable: true },
  dataCategories: {
    type: [String],
    enum: ["profile", "learning", "ai_interactions", "notifications", "preferences", "subscriptions", "payments", "communications", "other"],
    default: [],
    immutable: true,
  },
  status: { type: String, enum: DATA_PRIVACY_REQUEST_STATUSES, default: "identity_pending", required: true, index: true },
  activeRequestKey: { type: String, default: undefined },
  identityVerifiedAt: { type: Date, default: null },
  identityVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewerNote: { type: String, default: "", maxlength: 500 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, collection: "data_privacy_requests" });

dataPrivacyRequestSchema.index({ activeRequestKey: 1 }, { unique: true, sparse: true, name: "unique_active_privacy_request" });
dataPrivacyRequestSchema.index({ user: 1, createdAt: -1 });
dataPrivacyRequestSchema.index({ status: 1, type: 1, createdAt: -1 });

export const DataPrivacyRequest = mongoose.models.DataPrivacyRequest ||
  mongoose.model("DataPrivacyRequest", dataPrivacyRequestSchema);

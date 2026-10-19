import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  type: { type: String, enum: ["system", "course", "billing", "promotion", "security", "learning"], default: "system" },
  eventKey: { type: String, default: undefined, maxlength: 200 },
  showInApp: { type: Boolean, default: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  emailStatus: { type: String, enum: ["pending", "sent", "skipped", "failed"], default: "skipped" },
  emailSubject: { type: String, default: "", maxlength: 200 },
  emailHtml: { type: String, default: "", maxlength: 20000 },
  emailAttempts: { type: Number, default: 0, min: 0 },
  emailLastAttemptAt: { type: Date, default: null },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: "", maxlength: 500 },
  pushStatus: { type: String, enum: ["pending", "sent", "skipped", "failed"], default: "skipped" },
  pushIdempotencyKey: { type: String, default: () => randomUUID(), maxlength: 64 },
  pushAttempts: { type: Number, default: 0, min: 0 },
  pushLastAttemptAt: { type: Date, default: null },
  pushSentAt: { type: Date, default: null },
  pushError: { type: String, default: "", maxlength: 500 },
  retryHistory: [{
    channel: { type: String, enum: ["email", "push"], required: true },
    priorAttempts: { type: Number, min: 0, default: 0 },
    previousError: { type: String, maxlength: 500, default: "" },
    previousLastAttemptAt: { type: Date, default: null },
    retriedAt: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, maxlength: 500, default: "" }
  }],
  link: { type: String, default: "" },
  readAt: { type: Date, default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "notifications" });

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: "string" } } });
notificationSchema.index({ emailStatus: 1, emailLastAttemptAt: 1, createdAt: 1 });
notificationSchema.index({ pushStatus: 1, pushLastAttemptAt: 1, createdAt: 1 });
export const Notification = mongoose.model("Notification", notificationSchema);

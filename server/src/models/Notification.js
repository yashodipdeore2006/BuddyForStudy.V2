import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  type: { type: String, enum: ["system", "course", "billing", "promotion", "security"], default: "system" },
  link: { type: String, default: "" },
  readAt: { type: Date, default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "notifications" });

notificationSchema.index({ user: 1, createdAt: -1 });
export const Notification = mongoose.model("Notification", notificationSchema);

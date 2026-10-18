import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  audience: { type: String, enum: ["all", "active", "subscribers"], default: "all" },
  targetMode: { type: String, enum: ["audience", "selected", "filtered"], default: "audience" },
  targetUserIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  targetFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
  channel: { type: [String], enum: ["in_app", "email"], default: ["in_app"] },
  link: { type: String, default: "" },
  status: { type: String, enum: ["draft", "sent"], default: "draft" },
  sentAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "announcements" });

export const Announcement = mongoose.model("Announcement", announcementSchema);

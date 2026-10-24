import mongoose from "mongoose";

const youtubeQuotaUsageSchema = new mongoose.Schema({
  dayKey: { type: String, required: true, unique: true, index: true },
  units: { type: Number, required: true, default: 0, min: 0 },
  exhausted: { type: Boolean, default: false }
}, { timestamps: true, collection: "youtube_quota_usage" });

export const YouTubeQuotaUsage = mongoose.model("YouTubeQuotaUsage", youtubeQuotaUsageSchema);

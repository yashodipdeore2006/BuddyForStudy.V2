import mongoose from "mongoose";

const roadmapAdmissionRateWindowSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0, min: 0 },
  expiresAt: { type: Date, required: true }
}, { versionKey: false, collection: "roadmap_admission_rate_windows" });

roadmapAdmissionRateWindowSchema.index(
  { userId: 1, windowStart: 1 },
  { unique: true, name: "roadmap_admission_rate_user_window_unique" }
);
roadmapAdmissionRateWindowSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "roadmap_admission_rate_window_ttl" }
);

export const RoadmapAdmissionRateWindow = mongoose.models.RoadmapAdmissionRateWindow
  || mongoose.model("RoadmapAdmissionRateWindow", roadmapAdmissionRateWindowSchema);

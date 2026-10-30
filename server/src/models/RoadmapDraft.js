import mongoose from "mongoose";

const roadmapDraftSchema = new mongoose.Schema({
  draftId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  query: { type: String, required: true, maxlength: 200 },
  goal: { type: String, enum: ["job_ready", "exam", "project", "learn"], default: "learn" },
  profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["queued", "building", "ready", "failed", "cancelled"], default: "queued", index: true },
  roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  errorCode: { type: String, default: "" },
  idempotencyKey: { type: String, default: "", index: true },
  admissionLeaseToken: { type: String, default: "", select: false },
  events: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false, collection: "roadmap_drafts" });

roadmapDraftSchema.index({ userId: 1, idempotencyKey: 1, createdAt: -1 });
roadmapDraftSchema.pre("save", function updateTimestamp() { this.updatedAt = new Date(); });

export const RoadmapDraft = mongoose.models.RoadmapDraft || mongoose.model("RoadmapDraft", roadmapDraftSchema);

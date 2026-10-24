import mongoose from "mongoose";
const roadmapTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
  canonicalTopic: { type: String, required: true, trim: true, maxlength: 200 },
  goal: { type: String, default: "learn", trim: true, maxlength: 120 },
  level: { type: String, required: true, enum: ["Beginner", "Intermediate", "Advanced"] },
  language: { type: String, required: true, trim: true, maxlength: 10 },
  promptVersion: { type: String, required: true, trim: true, maxlength: 160 },
  roadmap: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false, collection: "roadmap_templates" });
roadmapTemplateSchema.index({ expiresAt: 1 });
export const RoadmapTemplate = mongoose.models.RoadmapTemplate || mongoose.model("RoadmapTemplate", roadmapTemplateSchema);

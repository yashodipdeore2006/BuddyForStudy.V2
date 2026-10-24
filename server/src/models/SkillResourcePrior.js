import mongoose from "mongoose";

const skillResourcePriorSchema = new mongoose.Schema({
  canonicalSkillId: { type: String, required: true, trim: true, maxlength: 160 },
  videoId: { type: String, required: true, trim: true, maxlength: 80 },
  score: { type: Number, required: true, min: -1, max: 1, default: 0 },
  n: { type: Number, required: true, min: 0, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false, collection: "skill_resource_priors" });
skillResourcePriorSchema.index({ canonicalSkillId: 1, videoId: 1 }, { unique: true });
skillResourcePriorSchema.index({ updatedAt: -1 });

export const SkillResourcePrior = mongoose.models.SkillResourcePrior ||
  mongoose.model("SkillResourcePrior", skillResourcePriorSchema);

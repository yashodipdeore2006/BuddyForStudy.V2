import mongoose from "mongoose";

const aiPromptVersionSchema = new mongoose.Schema({
  feature: { type: String, enum: ["build_with_ai", "lesson_summary"], required: true, immutable: true },
  version: { type: Number, required: true, min: 1, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  prompt: { type: String, required: true, maxlength: 30000, immutable: true },
  contentHash: { type: String, required: true, immutable: true },
  notes: { type: String, default: "", maxlength: 500, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true }
}, { timestamps: true, collection: "ai_prompt_versions" });

aiPromptVersionSchema.index({ feature: 1, version: 1 }, { unique: true });
aiPromptVersionSchema.index({ feature: 1, createdAt: -1 });

export const AIPromptVersion = mongoose.model("AIPromptVersion", aiPromptVersionSchema);

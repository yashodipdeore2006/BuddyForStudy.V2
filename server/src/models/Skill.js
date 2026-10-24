import mongoose from "mongoose";
const skillSchema = new mongoose.Schema({
  _id: { type: String, required: true, trim: true, maxlength: 160 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  aliases: { type: [String], default: [] },
  domain: { type: String, default: "general", trim: true, maxlength: 40 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false, collection: "skills" });
skillSchema.index({ aliases: 1 });
skillSchema.index({ domain: 1, name: 1 });
export const Skill = mongoose.models.Skill || mongoose.model("Skill", skillSchema);

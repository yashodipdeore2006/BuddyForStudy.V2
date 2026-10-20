import mongoose from "mongoose";

const courseCurationCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  kind: { type: String, required: true, enum: ["intent", "syllabus", "candidate-search", "curated-results"] },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, {
  timestamps: true,
  collection: "course_curation_cache"
});

courseCurationCacheSchema.index({ kind: 1, expiresAt: 1 });

export const CourseCurationCache = mongoose.models.CourseCurationCache ||
  mongoose.model("CourseCurationCache", courseCurationCacheSchema);

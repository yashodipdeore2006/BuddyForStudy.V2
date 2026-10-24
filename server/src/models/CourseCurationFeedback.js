import mongoose from "mongoose";

const courseCurationFeedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  query: { type: String, required: true, trim: true, maxlength: 200, index: true },
  normalizedQuery: { type: String, required: true, trim: true, maxlength: 200, index: true },
  event: {
    type: String,
    enum: ["preview", "save", "enroll", "thumbs_up", "thumbs_down", "outdated", "report", "helpful", "wrong_level", "completed", "abandoned"],
    required: true,
    index: true
  },
  skillId: { type: String, default: null, trim: true, maxlength: 160, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
  resourceType: { type: String, enum: ["video", "playlist", "series"], required: true },
  resourceId: { type: String, required: true, trim: true, maxlength: 200, index: true },
  engineVersion: { type: String, required: true, trim: true, maxlength: 100 },
  rank: { type: Number, min: 1, max: 100, default: null },
  score: { type: Number, min: 0, max: 100, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  versionKey: false,
  collection: "course_curation_feedback"
});

courseCurationFeedbackSchema.index({ normalizedQuery: 1, resourceId: 1, createdAt: -1 });
courseCurationFeedbackSchema.index({ user: 1, createdAt: -1 });

export const CourseCurationFeedback = mongoose.models.CourseCurationFeedback ||
  mongoose.model("CourseCurationFeedback", courseCurationFeedbackSchema);

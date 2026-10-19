import mongoose from "mongoose";

const aiLessonInsightSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  contentHash: { type: String, required: true },
  summary: { type: String, required: true },
  keyNotes: { type: [String], default: [] },
  model: { type: String, default: "" },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  generatedAt: { type: Date, default: Date.now },
  moderationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  moderationNote: { type: String, default: "", maxlength: 2000 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  moderatedAt: { type: Date, default: null },
  isHidden: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: "ai_lesson_insights" });

aiLessonInsightSchema.index(
  { course: 1, lesson: 1, contentHash: 1 },
  { unique: true }
);

export const AILessonInsight = mongoose.model("AILessonInsight", aiLessonInsightSchema);

import mongoose from "mongoose";

const aiLessonInsightSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  contentHash: { type: String, required: true },
  summary: { type: String, required: true },
  keyNotes: { type: [String], default: [] },
  model: { type: String, default: "" },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "ai_lesson_insights" });

aiLessonInsightSchema.index({ user: 1, course: 1, lesson: 1 }, { unique: true });

export const AILessonInsight = mongoose.model("AILessonInsight", aiLessonInsightSchema);

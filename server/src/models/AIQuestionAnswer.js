import mongoose from "mongoose";

const aiQuestionAnswerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  questionHash: { type: String, required: true },
  question: { type: String, required: true, maxlength: 2000 },
  answer: { type: String, required: true, maxlength: 12000 },
  contextHash: { type: String, required: true },
  model: { type: String, default: "" },
  hitCount: { type: Number, default: 0, min: 0 },
  lastAskedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "ai_question_answers" });

aiQuestionAnswerSchema.index({ user: 1, course: 1, lesson: 1, questionHash: 1 }, { unique: true });

export const AIQuestionAnswer = mongoose.model("AIQuestionAnswer", aiQuestionAnswerSchema);

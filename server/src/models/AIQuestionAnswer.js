import mongoose from "mongoose";

const aiQuestionAnswerSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  questionHash: { type: String, required: true },
  question: { type: String, required: true, maxlength: 2000 },
  answer: { type: String, required: true, maxlength: 12000 },
  contextHash: { type: String, required: true },
  model: { type: String, default: "" },
  firstAskedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  hitCount: { type: Number, default: 0, min: 0 },
  lastAskedAt: { type: Date, default: Date.now },
  moderationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  moderationNote: { type: String, default: "", maxlength: 2000 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  moderatedAt: { type: Date, default: null },
  isHidden: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: "ai_question_answers" });

aiQuestionAnswerSchema.index(
  { course: 1, lesson: 1, questionHash: 1, contextHash: 1 },
  { unique: true }
);

export const AIQuestionAnswer = mongoose.model("AIQuestionAnswer", aiQuestionAnswerSchema);

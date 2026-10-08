import mongoose from "mongoose";

const aiQuestionAskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  questionHash: { type: String, required: true },
  answerCacheId: { type: mongoose.Schema.Types.ObjectId, ref: "AIQuestionAnswer", default: null },
  askedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "ai_question_asks" });

aiQuestionAskSchema.index(
  { user: 1, course: 1, lesson: 1, questionHash: 1 },
  { unique: true }
);

export const AIQuestionAsk = mongoose.model("AIQuestionAsk", aiQuestionAskSchema);

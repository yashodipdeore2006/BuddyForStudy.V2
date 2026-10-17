import mongoose from "mongoose";

const quizQuestionOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true }
}, { _id: false });

const quizQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  topic: { type: String, default: "" },
  question: { type: String, required: true },
  options: { type: [quizQuestionOptionSchema], default: [] },
  correctOptionId: { type: String, required: true },
  explanation: { type: String, default: "" }
}, { _id: false });

const quizAttemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  score: { type: Number, min: 0, max: 100, required: true },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  attemptedAt: { type: Date, default: Date.now }
}, { _id: false });

const quizBankSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  fingerprint: { type: String, required: true },
  title: { type: String, default: "Lesson Practice Quiz" },
  questions: { type: [quizQuestionSchema], required: true },
  attempts: { type: [quizAttemptSchema], default: [] },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "quiz_bank" });

quizBankSchema.index({ course: 1, lesson: 1, fingerprint: 1 }, { unique: true });
quizBankSchema.index({ course: 1, lesson: 1, generatedAt: 1 });

export const QuizBank = mongoose.model("QuizBank", quizBankSchema);

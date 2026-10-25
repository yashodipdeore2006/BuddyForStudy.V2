import mongoose from "mongoose";

const courseQuizAttemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  quizFingerprint: { type: String, required: true, maxlength: 64 },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  score: { type: Number, required: true, min: 0, max: 100 },
  passed: { type: Boolean, required: true },
  correctCount: { type: Number, required: true, min: 0 },
  questionCount: { type: Number, required: true, min: 1 },
  attemptedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true, collection: "course_quiz_attempts" });

courseQuizAttemptSchema.index({ user: 1, course: 1, lesson: 1, attemptedAt: -1 });

export const CourseQuizAttempt = mongoose.model("CourseQuizAttempt", courseQuizAttemptSchema);

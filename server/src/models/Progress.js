import mongoose from "mongoose";

const completedLessonSchema = new mongoose.Schema({
  lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ["tutorial", "project"], required: true },
  completedAt: { type: Date, default: Date.now, required: true }
}, { _id: false });

const progressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  completedLessons: { type: [completedLessonSchema], default: [] },
  completedCount: { type: Number, default: 0, min: 0 },
  totalLessons: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  lastAccessedAt: { type: Date }
}, { timestamps: true, collection: "progress" });

progressSchema.index({ user: 1, course: 1 }, { unique: true });

export const Progress = mongoose.model("Progress", progressSchema);

import mongoose from "mongoose";

const achievementSchema = new mongoose.Schema({
  key: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  unlockedAt: { type: Date, default: Date.now, required: true }
}, { _id: false });

const learningStatsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  currentStreak: { type: Number, default: 0, min: 0 },
  longestStreak: { type: Number, default: 0, min: 0 },
  lastActivityDate: { type: String, default: "" },
  totalActiveDays: { type: Number, default: 0, min: 0 },
  totalLessonsCompleted: { type: Number, default: 0, min: 0 },
  totalCoursesCompleted: { type: Number, default: 0, min: 0 },
  achievements: { type: [achievementSchema], default: [] }
}, { timestamps: true, collection: "learning_stats" });

export const LearningStats = mongoose.model("LearningStats", learningStatsSchema);

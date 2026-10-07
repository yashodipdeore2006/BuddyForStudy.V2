import mongoose from "mongoose";

const roadmapLessonSchema = new mongoose.Schema({
  lessonId: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ["tutorial", "project"], required: true },
  moduleTitle: { type: String, required: true },
  order: { type: Number, required: true }
}, { _id: false });

const roadmapSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  query: { type: String, required: true, trim: true, maxlength: 200 },
  canonicalTopic: { type: String, required: true },
  intent: { type: String, default: "" },
  careerOutcome: { type: String, default: "" },
  level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" },
  course: {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "AI Roadmap" },
    duration: { type: String, default: "" },
    learningOutcomes: { type: [String], default: [] },
    modules: { type: mongoose.Schema.Types.Mixed, default: [] }
  },
  skillGraph: { type: mongoose.Schema.Types.Mixed, default: [] },
  personalization: { type: mongoose.Schema.Types.Mixed, default: {} },
  adaptiveState: { type: mongoose.Schema.Types.Mixed, default: {} },
  lessons: { type: [roadmapLessonSchema], default: [] },
  completedLessonIds: { type: [String], default: [] },
  quizAttempts: {
    type: [{
      moduleIndex: { type: Number, required: true },
      score: { type: Number, required: true },
      total: { type: Number, required: true },
      answers: { type: [Number], default: [] },
      attemptedAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  lastLessonId: { type: String, default: null },
  status: { type: String, enum: ["active", "completed"], default: "active" },
  startedAt: { type: Date, default: Date.now },
  lastAccessedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true, collection: "learning_roadmaps" });

roadmapSchema.index({ user: 1, updatedAt: -1 });

export const LearningRoadmap = mongoose.model("LearningRoadmap", roadmapSchema);

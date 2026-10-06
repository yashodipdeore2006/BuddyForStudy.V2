import mongoose from "mongoose";

const tutorialSchema = new mongoose.Schema({
  content: { type: String, default: "" },
  resources: { type: [String], default: [] }
}, { _id: false });

const projectSchema = new mongoose.Schema({
  description: { type: String, default: "" },
  objectives: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  instructions: { type: String, default: "" },
  expectedOutcome: { type: String, default: "" },
  resources: { type: [String], default: [] },
  submissionRequirements: { type: [String], default: [] }
}, { _id: false });

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", trim: true },
  type: { type: String, enum: ["tutorial", "project"], required: true },
  order: { type: Number, required: true, min: 1 },
  tutorial: { type: tutorialSchema },
  project: { type: projectSchema }
});

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", trim: true },
  order: { type: Number, required: true, min: 1 },
  lessons: { type: [lessonSchema], default: [] }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], required: true },
  duration: { type: String, required: true, trim: true },
  thumbnail: { type: String, default: "" },
  learningOutcomes: { type: [String], default: [] },
  modules: { type: [moduleSchema], default: [] },
  isPublished: { type: Boolean, default: false, required: true }
}, { timestamps: true, collection: "courses" });

courseSchema.index({ isPublished: 1, category: 1, level: 1 });
courseSchema.index({ title: "text", description: "text", category: "text" });

export const Course = mongoose.model("Course", courseSchema);

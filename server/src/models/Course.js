import mongoose from "mongoose";

const videoResourceSchema = new mongoose.Schema({
  videoId: { type: String, default: "" },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  channelTitle: { type: String, default: "" },
  publishedAt: { type: Date, default: null },
  url: { type: String, default: "" },
  thumbnail: { type: String, default: "" },
  durationSeconds: { type: Number, default: 0, min: 0 },
  duration: { type: String, default: "" }
}, { _id: false });
const tutorialSchema = new mongoose.Schema({
  content: { type: String, default: "" },
  resources: { type: [String], default: [] },
  videos: { type: [videoResourceSchema], default: [] },
  playlistId: { type: String, default: "" },
  playlistTitle: { type: String, default: "" }
}, { _id: false });
const projectSchema = new mongoose.Schema({
  description: { type: String, default: "" },
  objectives: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  instructions: { type: String, default: "" },
  expectedOutcome: { type: String, default: "" },
  realWorldScenario: { type: String, default: "" },
  features: { type: [String], default: [] },
  architecture: { type: [String], default: [] },
  milestones: { type: [String], default: [] },
  testingChecklist: { type: [String], default: [] },
  industrySkills: { type: [String], default: [] },
  githubWorkflow: { type: [String], default: [] },
  videoSearchQueries: { type: [String], default: [] },
  videos: { type: [videoResourceSchema], default: [] },
  resources: { type: [String], default: [] },
  submissionRequirements: { type: [String], default: [] }
}, { _id: false });
const quizQuestionOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
}, { _id: false });

const quizQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  topic: { type: String, default: "" },
  question: { type: String, required: true },
  options: { type: [quizQuestionOptionSchema], default: [] },
  correctOptionId: { type: String, required: true },
  explanation: { type: String, default: "" },
}, { _id: false });

const quizSchema = new mongoose.Schema({
  scope: { type: String, enum: ["lesson", "module"], required: true },
  questionCount: { type: Number, required: true, min: 1, max: 20 },
  passingScore: { type: Number, default: 70, min: 50, max: 100 },
  focusTopics: { type: [String], default: [] },
  instructions: { type: String, default: "" },
  questions: { type: [quizQuestionSchema], default: [] },
  generatedAt: { type: Date, default: null },
}, { _id: false });

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 }, description: { type: String, default: "", trim: true },
  type: { type: String, enum: ["tutorial", "project", "quiz"], required: true }, order: { type: Number, required: true, min: 1 },
  tutorial: { type: tutorialSchema }, project: { type: projectSchema }, quiz: { type: quizSchema }
});
const moduleResourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  url: { type: String, required: true, trim: true, maxlength: 1000 },
  type: { type: String, enum: ["link", "document", "repository", "article"], default: "link" }
});

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", trim: true },
  order: { type: Number, required: true, min: 1 },
  resources: { type: [moduleResourceSchema], default: [] },
  lessons: { type: [lessonSchema], default: [] }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, required: true, trim: true }, category: { type: String, required: true, trim: true },
  level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], required: true },
  duration: { type: String, required: true, trim: true }, thumbnail: { type: String, default: "" },
  learningOutcomes: { type: [String], default: [] }, modules: { type: [moduleSchema], default: [] },
  isPublished: { type: Boolean, default: false, required: true },
  pricing: {
    mode: { type: String, enum: ["free", "paid"], default: "free" },
    price: { type: Number, default: 0, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", uppercase: true },
    saleEnabled: { type: Boolean, default: false },
    salePrice: { type: Number, default: 0, min: 0 }
  },
  enrollmentEnabled: { type: Boolean, default: true },
  certificateEnabled: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  generation: {
    mode: { type: String, enum: ["normal", "ai", "module", "discovery"] },
    query: { type: String, default: "" },
    topicKeys: { type: [String], default: [] },
    sourceCourse: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    sourceModuleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceResourceType: { type: String, enum: ["video", "playlist"], default: null },
    sourceResourceId: { type: String, default: "" },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null }
  }
}, { timestamps: true, collection: "courses" });

courseSchema.index({ isPublished: 1, category: 1, level: 1 });
courseSchema.index({ "pricing.mode": 1, isPublished: 1 });
courseSchema.index({ "generation.mode": 1, "generation.topicKeys": 1, createdAt: -1 });
courseSchema.index({ "generation.mode": 1, "generation.sourceCourse": 1, "generation.sourceModuleId": 1 });
courseSchema.index(
  { "generation.sourceResourceType": 1, "generation.sourceResourceId": 1 },
  { unique: true, partialFilterExpression: { "generation.mode": "discovery" } }
);
courseSchema.index({ title: "text", description: "text", category: "text" });

export const Course = mongoose.model("Course", courseSchema);

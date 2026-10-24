import mongoose from "mongoose";
import { CourseRevision } from "./CourseRevision.js";
import { PlatformSetting } from "./PlatformSetting.js";
import { evaluateCourseReadiness } from "../utils/courseReadiness.js";

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

const journeyStageSchema = new mongoose.Schema({
  id: { type: String, required: true }, order: { type: Number, required: true }, title: { type: String, required: true, trim: true, maxlength: 100 },
  hours: { type: Number, default: 0, min: 0 }, lessonIds: { type: [String], default: [] }, skills: { type: [String], default: [] }, outcome: { type: String, default: "", maxlength: 1000 }, emoji: { type: String, default: "" }
}, { _id: false });
const courseRoadmapSchema = new mongoose.Schema({ theme: { type: String, default: "trail", trim: true }, sourceFingerprint: { type: String, default: "" }, generatedAt: { type: Date, default: null }, stages: { type: [journeyStageSchema], default: [] } }, { _id: false });

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, required: true, trim: true }, category: { type: String, required: true, trim: true },
  level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], required: true },
  duration: { type: String, required: true, trim: true }, thumbnail: { type: String, default: "" },
  learningOutcomes: { type: [String], default: [] }, modules: { type: [moduleSchema], default: [] }, roadmap: { type: courseRoadmapSchema, default: () => ({ theme: "trail", stages: [] }) },
  isPublished: { type: Boolean, default: false, required: true },
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  deletedAt: { type: Date, default: null, index: true },
  visibility: { type: String, enum: ["public", "private"], default: "public", index: true },
  createdForUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  aiReviewStatus: { type: String, enum: ["not_required", "pending", "approved", "rejected"], default: "not_required", index: true },
  aiReviewSource: { type: String, enum: ["manual", "automatic"], default: "manual", index: true },
  aiReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  aiReviewedAt: { type: Date, default: null },
  aiReviewNote: { type: String, default: "", maxlength: 2000 },
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
    sourceResourceType: { type: String, enum: ["video", "playlist", "series"], default: null },
    sourceResourceId: { type: String, default: "" },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null }
  }
}, { timestamps: true, collection: "courses" });

async function getCourseApprovalMode() {
  const setting = await PlatformSetting.findOne({ key: "content_approval_ai_courses" }).select("value").lean();
  return setting?.value === "automatic" ? "automatic" : "manual";
}

function isGeneratedCourse(course) {
  return ["normal", "ai", "module", "discovery"].includes(course?.generation?.mode);
}

async function applyAutomaticCourseApproval(course) {
  course.aiReviewStatus = "approved";
  course.aiReviewSource = "automatic";
  course.aiReviewedBy = null;
  course.aiReviewedAt = new Date();
  course.aiReviewNote = "Automatically approved by the platform content policy.";
  const isUserPrivateCourse = course.visibility === "private" && Boolean(course.createdForUser);
  const keepArchived = course.status === "archived";
  const readiness = evaluateCourseReadiness(course);
  if (isUserPrivateCourse || keepArchived || !readiness.ready) {
    course.isPublished = false;
    course.status = keepArchived ? "archived" : "draft";
    return;
  }
  course.isPublished = true;
  course.status = "published";
  course.visibility = "public";
}

courseSchema.pre("validate", async function enforceCourseApprovalPolicy() {
  if (!this.isNew || !isGeneratedCourse(this)) return;
  if (await getCourseApprovalMode() === "automatic") {
    await applyAutomaticCourseApproval(this);
    return;
  }
  this.isPublished = false;
  this.status = "draft";
  this.aiReviewStatus = "pending";
  this.aiReviewSource = "manual";
  this.aiReviewedBy = null;
  this.aiReviewedAt = null;
  this.aiReviewNote = "";
});
courseSchema.index({ isPublished: 1, category: 1, level: 1 });
courseSchema.pre("save", async function createRevisionBeforeCourseChange() {
  if (this.isNew || !this.isModified()) return;
  const previous = await this.constructor.findById(this._id).lean();
  if (!previous) return;
  const snapshot = { ...previous };
  delete snapshot.__v;
  const revisionNumber = (await CourseRevision.countDocuments({ course: this._id })) + 1;
  const context = this.$locals?.revisionContext || {};
  await CourseRevision.create({
    course: this._id, revisionNumber, snapshot, changedBy: context.actor || null,
    changeSource: context.source || (context.actor ? "admin" : "system"),
    reason: String(context.reason || "").slice(0, 500),
    summary: String(context.summary || "Course content or metadata changed").slice(0, 200)
  });
  const modifiedPaths = this.modifiedPaths();
  const contentPaths = ["title", "slug", "description", "category", "level", "duration", "thumbnail", "learningOutcomes", "modules", "generation", "roadmap"];
  const systemMetadataRefresh = ["Video duration metadata refresh", "Video resource normalization", "On-demand quiz generation"].includes(context.summary);
  const contentChanged = !systemMetadataRefresh && modifiedPaths.some((path) => contentPaths.some((contentPath) => path === contentPath || path.startsWith(contentPath + ".")));
  if (contentChanged && isGeneratedCourse(this)) {
    if (await getCourseApprovalMode() === "automatic") {
      await applyAutomaticCourseApproval(this);
    } else {
      if (this.isPublished) {
        this.isPublished = false;
        this.status = "draft";
        if (this.createdForUser) this.visibility = "private";
      } else {
        this.status = this.status === "archived" ? "archived" : "draft";
      }
      this.aiReviewStatus = "pending";
      this.aiReviewSource = "manual";
      this.aiReviewedBy = null;
      this.aiReviewedAt = null;
      this.aiReviewNote = "";
    }
  } else if (contentChanged && this.isPublished) {
    this.isPublished = false;
    this.status = "draft";
    if (this.createdForUser) this.visibility = "private";
  } else {
    this.status = this.isPublished ? "published" : (this.status === "archived" ? "archived" : "draft");
  }
});
courseSchema.index({ "pricing.mode": 1, isPublished: 1 });
courseSchema.index({ "generation.mode": 1, "generation.topicKeys": 1, createdAt: -1 });
courseSchema.index({ "generation.mode": 1, "generation.sourceCourse": 1, "generation.sourceModuleId": 1 });
courseSchema.index(
  { "generation.sourceResourceType": 1, "generation.sourceResourceId": 1 },
  { unique: true, partialFilterExpression: { "generation.mode": "discovery" } }
);
courseSchema.index({ title: "text", description: "text", category: "text" });

export const Course = mongoose.model("Course", courseSchema);

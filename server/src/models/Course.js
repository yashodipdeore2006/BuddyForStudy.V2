import mongoose from "mongoose";
import { CourseRevision } from "./CourseRevision.js";
import { PlatformSetting } from "./PlatformSetting.js";
import { evaluateCourseReadiness } from "../utils/courseReadiness.js";
import { PricingRule } from "./PricingRule.js";
import { calculateNextPricing, getCoursePricingValidationError } from "../utils/coursePricing.js";
import { resolveGeneratedCoursePricingPolicy } from "../utils/generatedCoursePricingPolicy.js";

const videoResourceSchema = new mongoose.Schema({
  videoId: { type: String, default: "" },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  channelTitle: { type: String, default: "" },
  publishedAt: { type: Date, default: null },
  url: { type: String, default: "" },
  thumbnail: { type: String, default: "" },
  durationSeconds: { type: Number, default: 0, min: 0 },
  duration: { type: String, default: "" },
  playlistId: { type: String, default: "" },
  chapters: { type: [{ title: { type: String, default: "" }, timestampSeconds: { type: Number, min: 0 }, timestampLabel: { type: String, default: "" } }], default: [] },
  fetchedAt: { type: Date, default: null },
  state: { type: String, enum: ["ready", "unavailable", "queued", "low_confidence", "failed"], default: "ready" },
  reason: { type: String, default: "", maxlength: 500 },
  alternatives: { type: [{ videoId: { type: String, default: "" }, playlistId: { type: String, default: "" }, title: { type: String, default: "" }, channelTitle: { type: String, default: "" }, durationSeconds: { type: Number, default: 0, min: 0 }, thumbnail: { type: String, default: "" }, fetchedAt: { type: Date, default: null }, reason: { type: String, default: "", maxlength: 500 } }], default: [] },
  startSeconds: { type: Number, min: 0 },
  endSeconds: { type: Number, min: 0 }
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
  canonicalSkillId: { type: String, default: "", maxlength: 160 }, nodeType: { type: String, enum: ["skill", "project", "checkpoint", "interview", "revision", "mock_test"], default: "skill" },
  buildState: { type: String, enum: ["pending", "queued", "ready", "low_confidence", "failed", "unavailable"], default: "pending", index: true },
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


function sanitizePersistedYouTubeData(value, now = new Date()) {
  if (Array.isArray(value)) return value.map((item) => sanitizePersistedYouTubeData(item, now));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const plain = typeof value.toObject === "function" ? value.toObject() : value;
  const output = {};
  for (const [key, child] of Object.entries(plain)) {
    if (/^(viewCount|views|likeCount|likes|subscriberCount|subscribers|commentCount|statistics)$/i.test(key)) continue;
    output[key] = sanitizePersistedYouTubeData(child, now);
  }
  if (output.videoId || output.playlistId) {
    output.fetchedAt = output.fetchedAt ? new Date(output.fetchedAt) : now;
  }
  return output;
}

async function getCourseApprovalMode() {
  const setting = await PlatformSetting.findOne({ key: "content_approval_ai_courses" }).select("value").lean();
  return setting?.value === "automatic" ? "automatic" : "manual";
}

function isGeneratedCourse(course) {
  return ["normal", "ai", "module", "discovery"].includes(course?.generation?.mode);
}

async function applyGeneratedCoursePricing(course) {
  const setting = await PlatformSetting.findOne({ key: "generated_course_pricing_policy" }).select("value").lean();
  const policy = resolveGeneratedCoursePricingPolicy(setting?.value);
  // A disabled policy is a true kill switch: do not change defaults or run rules.
  // If no policy has ever been persisted, use the same defaults shown in Pricing Studio.
  if (!policy.enabled || !policy.applyTo.includes(course.generation?.mode)) return;
  const currency = String(policy.currency || "INR").toUpperCase();
  const mode = policy.mode || "rule_based";
  if (mode === "free") {
    course.pricing = { ...(course.pricing?.toObject?.() || course.pricing || {}), mode: "free", price: 0, currency, saleEnabled: false, salePrice: 0 };
    return;
  }
  if (mode === "fixed") {
    const price = Math.round(Number(policy.fixedPrice) || 0);
    if (course.generation?.mode === "discovery" && price > 0 && (price < 20 || price > 59)) {
      console.warn("[course-pricing] discovery fixed price skipped because paid prices must remain between ₹20 and ₹59", { price });
      return;
    }
    course.pricing = { ...(course.pricing?.toObject?.() || course.pricing || {}), mode: price > 0 ? "paid" : "free", price, currency, saleEnabled: false, salePrice: 0 };
    return;
  }
  if (mode === "level_bands") {
    const band = policy.levelBands?.[course.level];
    if (!band) return;
    const min = Number(band.min), max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return;
    if (course.generation?.mode === "discovery" && (min < 20 || max > 59)) {
      console.warn("[course-pricing] discovery level band skipped because paid prices must remain between ₹20 and ₹59", { level: course.level, min, max });
      return;
    }
    const modules = Array.isArray(course.modules) ? course.modules : [];
    const projects = modules.reduce((count, module) => count + (module.lessons || []).filter((lesson) => lesson.type === "project").length, 0);
    const base = Math.round((min + max) / 2);
    const recommended = Math.min(max, Math.max(min, Math.round(base * (1 + Math.min(25, modules.length * 2) / 100 + Math.min(50, projects * 5) / 100))));
    course.pricing = { mode: recommended > 0 ? "paid" : "free", price: recommended, compareAtPrice: 0, currency, saleEnabled: false, salePrice: 0 };
    return;
  }
  // Rule-based mode: use the same admin-configured rules as existing catalogue
  // pricing. If no rule matches, preserve the course's configured/default price.
  if (mode !== "rule_based") return;
  const rules = await PricingRule.find({ enabled: true, autoApply: true }).sort({ priority: 1, createdAt: 1 }).lean();
  const price = Number(course.pricing?.price) || 0;
  const rule = rules.find((candidate) => {
    const filters = candidate.filters || {};
    return (!filters.category || String(filters.category).toLowerCase() === String(course.category || "").toLowerCase()) &&
      (!filters.level || filters.level === course.level) &&
      (!filters.mode || filters.mode === (course.pricing?.mode || "free")) &&
      (filters.minPrice == null || price >= Number(filters.minPrice)) &&
      (filters.maxPrice == null || price <= Number(filters.maxPrice));
  });
  if (!rule) return;
  try {
    const nextPricing = calculateNextPricing(course.pricing, rule.operation);
    const isYouTubeDiscovery = course.generation?.mode === "discovery";
    if (isYouTubeDiscovery && nextPricing.mode === "paid" && (nextPricing.price < 20 || nextPricing.price > 59)) {
      console.warn("[course-pricing] discovery rule skipped because paid prices must remain between ₹20 and ₹59", {
        ruleId: String(rule._id),
        price: nextPricing.price
      });
      return;
    }
    course.pricing = nextPricing;
    course.$locals.generatedPricingRule = rule.name;
  } catch (error) {
    console.error("[course-pricing] generated-course rule skipped", {
      ruleId: String(rule._id),
      message: String(error?.message || "Invalid pricing rule").slice(0, 200)
    });
  }
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
  const now = new Date();
  for (const module of this.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.tutorial) lesson.tutorial = sanitizePersistedYouTubeData(lesson.tutorial, now);
      if (lesson.project) lesson.project = sanitizePersistedYouTubeData(lesson.project, now);
    }
  }
  if (this.generation?.snapshot) this.generation.snapshot = sanitizePersistedYouTubeData(this.generation.snapshot, now);
  const isNewGeneratedCourse = this.isNew && isGeneratedCourse(this);
  if (isNewGeneratedCourse) await applyGeneratedCoursePricing(this);
  if (this.isNew || this.isModified("pricing")) {
    const pricingError = getCoursePricingValidationError(this.pricing);
    if (pricingError) this.invalidate("pricing", pricingError);
  }
  if (!isNewGeneratedCourse) return;
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

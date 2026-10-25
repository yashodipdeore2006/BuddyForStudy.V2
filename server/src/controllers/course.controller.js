import { z } from "zod";
import * as courseService from "../services/course.service.js";
import { toPublicCoursePreview } from "../utils/coursePreview.js";
import { Enrollment } from "../models/Enrollment.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { getEntitlement, hasPaidCourseAccess } from "../services/subscriptionEntitlement.service.js";

const courseSchema = z.object({
  title: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  description: z.string().trim().min(2),
  category: z.string().trim().min(1),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  duration: z.union([z.string(), z.number()]),
  thumbnail: z.string().optional(),
  learningOutcomes: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  pricing: z.object({
    mode: z.enum(["free", "paid"]).optional(),
    price: z.number().min(0).optional(),
    compareAtPrice: z.number().min(0).optional(),
    currency: z.string().trim().length(3).optional(),
    saleEnabled: z.boolean().optional(),
    salePrice: z.number().min(0).optional()
  }).optional(),
  enrollmentEnabled: z.boolean().optional(),
  certificateEnabled: z.boolean().optional(),
  featured: z.boolean().optional()
});

export async function list(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const result = await courseService.listPublished({
      page,
      limit,
      search: req.query.q,
      category: req.query.category,
      level: req.query.level,
      sort: req.query.sort === "popular" ? "popular" : "recent"
    });
    const courses = result.courses || [];
    const courseIds = courses.map((course) => course?._id).filter(Boolean);
    const enrollmentCounts = courseIds.length ? await Enrollment.aggregate([
      { $match: { course: { $in: courseIds }, status: { $in: ["active", "completed"] } } },
      { $group: { _id: "$course", count: { $sum: 1 } } }
    ]) : [];
    const countsByCourseId = new Map(enrollmentCounts.map((entry) => [String(entry._id), Number(entry.count) || 0]));
    return success(res, {
      ...result,
      courses: courses.map((course) => toPublicCoursePreview({
        ...course,
        enrollmentCount: course.enrollmentCount ?? countsByCourseId.get(String(course._id)) ?? 0
      }))
    });
  } catch (e) { next(e); }
}

export async function search(req, res, next) {
  req.query.q = String(req.query.q || "").trim();
  return list(req, res, next);
}

export async function details(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await courseService.getPublished(req.params.courseId, req.user?.userId || null);
    if (!course) return failure(res, "Course not found", 404);

    const [enrollmentCount] = await Enrollment.aggregate([
      { $match: { course: course._id, status: { $in: ["active", "completed"] } } },
      { $count: "count" }
    ]);
    const source = typeof course.toObject === "function" ? course.toObject() : course;
    const preview = toPublicCoursePreview({
      ...source,
      enrollmentCount: source.enrollmentCount ?? enrollmentCount?.count ?? 0
    });
    return success(res, { course: preview });
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const input = courseSchema.parse(req.body);
    // Creation always starts as a draft; publication has a separate readiness-gated workflow.
    input.isPublished = false;
    const course = await courseService.createCourse(input);
    return success(res, { course }, "Course created successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (Object.hasOwn(req.body || {}, "pricing") && (reason.length < 10 || reason.length > 500)) {
      return failure(res, "A reason between 10 and 500 characters is required to change course pricing.", 400);
    }
    const input = courseSchema.partial().parse(req.body);
    if (req.body?.isPublished === true) return failure(res, "Use the readiness-gated publish action to publish a course.", 400);
    const course = await courseService.updateCourse(req.params.courseId, input, {
      actor: req.user?.user?._id || req.user?.userId || null,
      reason: reason || "Admin course update"
    });
    if (!course) return failure(res, "Course not found", 404);
    return success(res, { course }, "Course updated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) {
      return failure(res, "A reason between 10 and 500 characters is required to delete a course.", 400);
    }
    const course = await courseService.deleteCourse(req.params.courseId, {
      actor: req.user?.user?._id || req.user?.userId || null,
      reason
    });
    if (!course) return failure(res, "Course not found", 404);
    return success(res, { course }, "Course moved to trash. It can be restored from content quality.");
  } catch (e) { next(e); }
}

export async function learn(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await courseService.getPublished(req.params.courseId, req.user?.userId || null);
    if (!course) return failure(res, "Course not found", 404);
    const enrolled = await (await import("../models/Enrollment.js")).Enrollment.findOne({
      user: req.user.userId, course: req.params.courseId, status: { $in: ["active", "completed"] }, revokedBy: null
    });
    if (!enrolled) return failure(res, "Active or completed enrollment required", 403);

    // Opening the authenticated lesson player is a learning activity. Persist it
    // so reminders do not nudge learners who have recently returned to a course.
    const { Progress } = await import("../models/Progress.js");
    await Progress.findOneAndUpdate(
      { user: req.user.userId, course: req.params.courseId },
      {
        $set: { lastAccessedAt: new Date(), totalLessons: courseService.totalLessons(course) },
        $setOnInsert: {
          user: req.user.userId,
          course: req.params.courseId,
          completedCount: 0,
          percentage: 0
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Opening the lesson player is the start signal for My Learning. Avoid
    // downgrading a completed enrollment when the learner opens it to review.
    await (await import("../models/Enrollment.js")).Enrollment.updateOne(
      { user: req.user.userId, course: req.params.courseId, status: "active" },
      { $set: { learningStatus: "in-progress" } }
    );

    const projectsAllowed =
      (req.user.role === "admin" && req.user.accessType === "admin") ||
      (await getEntitlement(req.user.userId, "project_based_learning")).allowed ||
      (await hasPaidCourseAccess(req.user.userId, req.params.courseId));

    if (!projectsAllowed) {
      course.modules = (course.modules || []).map((module) => ({
        ...module,
        lessons: (module.lessons || []).filter((lesson) => lesson.type !== "project")
      }));
    }

    return success(res, { course });
  } catch (e) { next(e); }
}

export async function learningItem(req, res, next) {
  try {
    const { courseId, itemId } = req.params;
    if (!isValidObjectId(courseId) || !isValidObjectId(itemId)) return failure(res, "Invalid identifier", 400);
    const course = await courseService.getPublished(courseId, req.user?.userId || null);
    if (!course) return failure(res, "Course not found", 404);
    const enrolled = await (await import("../models/Enrollment.js")).Enrollment.findOne({
      user: req.user.userId, course: courseId, status: { $in: ["active", "completed"] }
    });
    if (!enrolled) return failure(res, "Active or completed enrollment required", 403);
    const located = courseService.findLearningItem(course, itemId);
    if (!located) return failure(res, "Learning item not found", 404);

    if (
      located.item.type === "project" &&
      !(req.user.role === "admin" && req.user.accessType === "admin") &&
      !(await getEntitlement(req.user.userId, "project_based_learning")).allowed &&
      !(await hasPaidCourseAccess(req.user.userId, courseId))
    ) {
      return failure(res, "Project-based learning is not included in your current plan.", 403);
    }

    const progress = await (await import("../models/Progress.js")).Progress.findOne({ user: req.user.userId, course: courseId });
    const completed = !!progress?.completedLessons.some(x => x.lessonId.toString() === itemId);
    return success(res, { item: located.item, completed });
  } catch (e) { next(e); }
}

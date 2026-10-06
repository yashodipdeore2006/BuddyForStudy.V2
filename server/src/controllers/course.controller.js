import { z } from "zod";
import * as courseService from "../services/course.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

const courseSchema = z.object({
  title: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  description: z.string().trim().min(2),
  category: z.string().trim().min(1),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  duration: z.union([z.string(), z.number()]),
  thumbnail: z.string().optional(),
  learningOutcomes: z.array(z.string()).optional(),
  isPublished: z.boolean().optional()
});

export async function list(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const result = await courseService.listPublished({
      page, limit, search: req.query.q, category: req.query.category, level: req.query.level
    });
    return success(res, result);
  } catch (e) { next(e); }
}

export async function search(req, res, next) {
  req.query.q = String(req.query.q || "").trim();
  return list(req, res, next);
}

export async function details(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await courseService.getPublished(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    return success(res, { course });
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const input = courseSchema.parse(req.body);
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
    const input = courseSchema.partial().parse(req.body);
    const course = await courseService.updateCourse(req.params.courseId, input);
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
    const course = await courseService.deleteCourse(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    return success(res, {}, "Course deleted successfully");
  } catch (e) { next(e); }
}

export async function learn(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await courseService.getPublished(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const enrolled = await (await import("../models/Enrollment.js")).Enrollment.findOne({
      user: req.user.userId, course: req.params.courseId, status: { $in: ["active", "completed"] }
    });
    if (!enrolled) return failure(res, "Active or completed enrollment required", 403);
    return success(res, { course });
  } catch (e) { next(e); }
}

export async function learningItem(req, res, next) {
  try {
    const { courseId, itemId } = req.params;
    if (!isValidObjectId(courseId) || !isValidObjectId(itemId)) return failure(res, "Invalid identifier", 400);
    const course = await courseService.getPublished(courseId);
    if (!course) return failure(res, "Course not found", 404);
    const enrolled = await (await import("../models/Enrollment.js")).Enrollment.findOne({
      user: req.user.userId, course: courseId, status: { $in: ["active", "completed"] }
    });
    if (!enrolled) return failure(res, "Active or completed enrollment required", 403);
    const located = courseService.findLearningItem(course, itemId);
    if (!located) return failure(res, "Learning item not found", 404);
    const progress = await (await import("../models/Progress.js")).Progress.findOne({ user: req.user.userId, course: courseId });
    const completed = !!progress?.completedLessons.some(x => x.lessonId.toString() === itemId);
    return success(res, { item: located.item, completed });
  } catch (e) { next(e); }
}

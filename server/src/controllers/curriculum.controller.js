import { z } from "zod";
import { Course } from "../models/Course.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { cacheDelete } from "../config/cache.js";

const moduleSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  order: z.number().int().min(1)
});

const lessonSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  type: z.enum(["tutorial", "project"]),
  order: z.number().int().min(1),
  tutorial: z.record(z.string(), z.any()).optional(),
  project: z.record(z.string(), z.any()).optional()
});

async function getCourse(courseId) {
  if (!isValidObjectId(courseId)) {
    const error = new Error("Invalid courseId");
    error.status = 400;
    throw error;
  }
  const course = await Course.findById(courseId);
  if (!course) {
    const error = new Error("Course not found");
    error.status = 404;
    throw error;
  }
  return course;
}

async function invalidateCourseCache(courseId) {
  await cacheDelete(`course:${courseId}`);
}

export async function createModule(req, res, next) {
  try {
    const input = moduleSchema.parse(req.body);
    const course = await getCourse(req.params.courseId);
    const module = course.modules.create({ ...input, lessons: [] });
    course.modules.push(module);
    course.modules.sort((a, b) => a.order - b.order);
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, { module }, "Module created successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function updateModule(req, res, next) {
  try {
    const input = moduleSchema.partial().parse(req.body);
    const course = await getCourse(req.params.courseId);
    const module = course.modules.id(req.params.moduleId);
    if (!module) return failure(res, "Module not found", 404);
    Object.assign(module, input);
    course.modules.sort((a, b) => a.order - b.order);
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, { module }, "Module updated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function deleteModule(req, res, next) {
  try {
    const course = await getCourse(req.params.courseId);
    const module = course.modules.id(req.params.moduleId);
    if (!module) return failure(res, "Module not found", 404);
    module.deleteOne();
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, {}, "Module deleted successfully");
  } catch (e) {
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function createLesson(req, res, next) {
  try {
    const input = lessonSchema.parse(req.body);
    if (input.type === "tutorial" && !input.tutorial) input.tutorial = {};
    if (input.type === "project" && !input.project) input.project = {};
    const course = await getCourse(req.params.courseId);
    const module = course.modules.id(req.params.moduleId);
    if (!module) return failure(res, "Module not found", 404);
    const lesson = module.lessons.create(input);
    module.lessons.push(lesson);
    module.lessons.sort((a, b) => a.order - b.order);
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, { lesson }, "Lesson created successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function updateLesson(req, res, next) {
  try {
    const input = lessonSchema.partial().parse(req.body);
    const course = await getCourse(req.params.courseId);
    const module = course.modules.id(req.params.moduleId);
    if (!module) return failure(res, "Module not found", 404);
    const lesson = module.lessons.id(req.params.lessonId);
    if (!lesson) return failure(res, "Lesson not found", 404);
    Object.assign(lesson, input);
    module.lessons.sort((a, b) => a.order - b.order);
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, { lesson }, "Lesson updated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function deleteLesson(req, res, next) {
  try {
    const course = await getCourse(req.params.courseId);
    const module = course.modules.id(req.params.moduleId);
    if (!module) return failure(res, "Module not found", 404);
    const lesson = module.lessons.id(req.params.lessonId);
    if (!lesson) return failure(res, "Lesson not found", 404);
    lesson.deleteOne();
    await course.save();
    await invalidateCourseCache(course._id);
    return success(res, {}, "Lesson deleted successfully");
  } catch (e) {
    if (e?.status === 400 || e?.status === 404) return failure(res, e.message, e.status);
    next(e);
  }
}

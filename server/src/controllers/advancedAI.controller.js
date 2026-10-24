import { z } from "zod";
import { Enrollment } from "../models/Enrollment.js";
import {
  getAdvancedAIUsage,
  getLessonInsight,
  askLessonQuestion
} from "../services/advancedAI.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { getEntitlement } from "../services/subscriptionEntitlement.service.js";

async function requireEnrollment(userId, courseId) {
  if (!isValidObjectId(courseId)) return false;
  return Boolean(await Enrollment.exists({
    user: userId,
    course: courseId,
    status: { $in: ["active", "completed"] }
  }));
}

function validateIds(courseId, lessonId) {
  return isValidObjectId(courseId) && isValidObjectId(lessonId);
}

export async function usage(req, res, next) {
  try {
    const schema = z.object({
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1)
    });
    const input = schema.parse(req.query);
    if (!validateIds(input.courseId, input.lessonId)) return failure(res, "Invalid course or lesson ID", 400);
    if (!await requireEnrollment(req.user.userId, input.courseId)) return failure(res, "Active or completed enrollment required", 403);

    const entitlement = await getEntitlement(req.user.userId, "advanced_ai_paths");
    if (!entitlement.allowed) {
      return success(res, {
        enabled: false,
        plan: { id: entitlement.plan?._id ? String(entitlement.plan._id) : "", name: entitlement.plan?.name || "Free" },
        questions: null,
        recentQuestions: []
      });
    }

    const result = await getAdvancedAIUsage({
      userId: req.user.userId,
      courseId: input.courseId,
      lessonId: input.lessonId
    });
    return success(res, result);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function insight(req, res, next) {
  try {
    const schema = z.object({
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1)
    });
    const input = schema.parse(req.body);
    if (!validateIds(input.courseId, input.lessonId)) return failure(res, "Invalid course or lesson ID", 400);
    if (!await requireEnrollment(req.user.userId, input.courseId)) return failure(res, "Active or completed enrollment required", 403);

    const result = await getLessonInsight({
      userId: req.user.userId,
      courseId: input.courseId,
      lessonId: input.lessonId
    });
    return success(res, result, result.fromCache ? "Lesson insight loaded from cache" : "Lesson insight generated");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function ask(req, res, next) {
  try {
    const schema = z.object({
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1),
      question: z.string().trim().min(2).max(2000)
    });
    const input = schema.parse(req.body);
    if (!validateIds(input.courseId, input.lessonId)) return failure(res, "Invalid course or lesson ID", 400);
    if (!await requireEnrollment(req.user.userId, input.courseId)) return failure(res, "Active or completed enrollment required", 403);

    const result = await askLessonQuestion({
      userId: req.user.userId,
      courseId: input.courseId,
      lessonId: input.lessonId,
      question: input.question
    });
    return success(res, result, result.fromCache ? "Answer loaded from cache" : "Answer generated");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

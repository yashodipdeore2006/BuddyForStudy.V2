import { z } from "zod";
import * as service from "../services/roadmap.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { getActivePlanForUser } from "../services/subscriptionEntitlement.service.js";
import { getEntitlement } from "../services/subscriptionEntitlement.service.js";

async function requireRoadmapAccess(req, res) {
  if (req.user?.role === "admin" || req.user?.user?.role === "admin") return true;
  const entitlement = await getEntitlement(req.user.userId, "personalized_roadmaps");
  if (entitlement.allowed) return true;
  const plan = entitlement.plan || await getActivePlanForUser(req.user.userId);
  failure(res, "Personalized learning roadmaps are not included in your current plan. Upgrade to use this feature.", 403, { feature: "personalized_roadmaps", plan: plan?.name || "Free" });
  return false;
}

const saveSchema = z.object({
  query: z.string().trim().min(2).max(200),
  intent: z.string().optional().default(""),
  canonicalTopic: z.string().trim().min(2),
  careerOutcome: z.string().optional().default(""),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  skillGraph: z.array(z.any()).default([]),
  personalization: z.record(z.any()).default({}),
  course: z.object({
    title: z.string().min(2),
    description: z.string().default(""),
    category: z.string().default("AI Roadmap"),
    level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
    duration: z.string().default(""),
    learningOutcomes: z.array(z.string()).default([]),
    modules: z.array(z.any()).default([])
  })
});

export async function save(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    const input = saveSchema.parse(req.body);
    return success(res, { roadmap: await service.saveRoadmap(req.user.userId, input) }, "Learning roadmap saved", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    return success(res, { roadmaps: await service.listRoadmaps(req.user.userId) });
  }
  catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    if (!isValidObjectId(req.params.roadmapId)) return failure(res, "Invalid roadmapId", 400);
    return success(
      res,
      { roadmap: await service.deleteRoadmap(req.user.userId, req.params.roadmapId) },
      "Learning roadmap removed"
    );
  } catch (e) { next(e); }
}

export async function get(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    if (!isValidObjectId(req.params.roadmapId)) return failure(res, "Invalid roadmapId", 400);
    return success(res, { roadmap: await service.getRoadmap(req.user.userId, req.params.roadmapId) });
  } catch (e) { next(e); }
}

const quizSchema = z.object({
  moduleIndex: z.number().int().min(0),
  answers: z.array(z.number().int().min(0)).max(20)
});

export async function generateQuiz(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    if (!isValidObjectId(req.params.roadmapId)) return failure(res, "Invalid roadmapId", 400);
    const moduleIndex = Number(req.params.moduleIndex);
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0) return failure(res, "Invalid moduleIndex", 400);
    return success(
      res,
      { roadmap: await service.generateModuleQuizForRoadmap(req.user.userId, req.params.roadmapId, moduleIndex) },
      "Module quiz generated"
    );
  } catch (e) {
    next(e);
  }
}

export async function submitQuiz(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    if (!isValidObjectId(req.params.roadmapId)) return failure(res, "Invalid roadmapId", 400);
    const input = quizSchema.parse(req.body);
    return success(res, { roadmap: await service.submitQuiz(req.user.userId, req.params.roadmapId, input.moduleIndex, input.answers) }, "Quiz submitted");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function complete(req, res, next) {
  try {
    if (!(await requireRoadmapAccess(req, res))) return;
    if (!isValidObjectId(req.params.roadmapId)) return failure(res, "Invalid roadmapId", 400);
    return success(res, { roadmap: await service.completeLesson(req.user.userId, req.params.roadmapId, String(req.params.lessonId)) }, "Roadmap lesson completed");
  } catch (e) { next(e); }
}
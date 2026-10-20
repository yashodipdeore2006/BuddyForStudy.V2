import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { getCourseJourney, regenerateCourseJourney, buildJourneyStages } from "../services/courseJourneyRoadmap.service.js";
import { Course } from "../models/Course.js";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { sanitizeAuditSnapshot } from "../utils/auditSanitizer.js";

async function recordRoadmapAudit(req, action, courseId, after) {
  const actor = req.user?.user?._id || req.user?.userId;
  if (!actor) return;
  await recordAuditEvent({
    actor, action, targetType: "course_roadmap", targetId: String(courseId), before: null, after: sanitizeAuditSnapshot(after),
    reason: action === "course.roadmap.regenerate" ? "AI regenerated course journey stages" : "Admin edited course journey stages",
    ip: String(req.ip || "").slice(0, 100), userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}
export async function get(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const roadmap = await getCourseJourney(req.params.courseId, req.user?.userId || null);
    if (!roadmap) return failure(res, "Course not found", 404);
    return success(res, { roadmap });
  } catch (error) { next(error); }
}

const stageSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  order: z.number().int().min(1),
  title: z.string().trim().min(2).max(100),
  hours: z.number().min(0).optional().default(0),
  lessonIds: z.array(z.string().min(1)).min(1),
  skills: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
  outcome: z.string().trim().max(1000).default(""),
  emoji: z.string().max(12).optional().default("")
});

export async function updateAdmin(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const input = z.object({ stages: z.array(stageSchema).min(1).max(7) }).parse(req.body);
    const course = await Course.findById(req.params.courseId);
    if (!course || course.deletedAt) return failure(res, "Course not found", 404);
    const validLessonIds = new Set((course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => String(lesson._id || lesson.id))));
    if (input.stages.some((stage) => stage.lessonIds.some((id) => !validLessonIds.has(id)))) return failure(res, "Every roadmap lesson must belong to this course.", 400);
    const normalized = input.stages.map((stage, index) => ({ ...stage, id: stage.id || "stage-" + (index + 1), order: index + 1 }));
    const allAssigned = normalized.flatMap((stage) => stage.lessonIds);
    if (new Set(allAssigned).size !== allAssigned.length || validLessonIds.size !== allAssigned.length || [...validLessonIds].some((id) => !allAssigned.includes(id))) return failure(res, "Every course lesson must belong to exactly one roadmap stage.", 400);
    const roadmap = await regenerateCourseJourney(course._id, normalized);
    await recordRoadmapAudit(req, "course.roadmap.update", course._id, roadmap);
    return success(res, { roadmap }, "Course journey roadmap saved");
  } catch (error) { if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors); next(error); }
}

export async function regenerateAdmin(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId).lean();
    if (!course || course.deletedAt) return failure(res, "Course not found", 404);
    const baseStages = buildJourneyStages(course.modules || [], []);
    if (!baseStages.length) return failure(res, "Add lessons before generating a journey roadmap.", 400);
    if (!env.geminiApiKey) return failure(res, "AI roadmap generation is unavailable because GEMINI_API_KEY is not configured.", 503);
    const client = new GoogleGenAI({ apiKey: env.geminiApiKey });
    const lessonTitles = (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ id: String(lesson._id || lesson.id), title: lesson.title, module: module.title })));
    const response = await client.models.generateContent({
      model: env.geminiModel,
      contents: "Create concise, domain-neutral learning journey milestone metadata for this course. Keep the provided lesson grouping and lesson IDs unchanged. Return JSON only. Course: " + course.title + ". Description: " + course.description + ". Learning outcomes: " + JSON.stringify(course.learningOutcomes || []) + ". Stages: " + JSON.stringify(baseStages.map((stage) => ({ id: stage.id, order: stage.order, title: stage.title, lessonIds: stage.lessonIds, lessonTitles: lessonTitles.filter((lesson) => stage.lessonIds.includes(lesson.id)) }))) + ". For every stage return id, title (2-5 words), skills (exactly 3 short strings), outcome (one practical sentence), emoji (one emoji). Do not change lessonIds or stage order.",
      config: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { stages: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, title: { type: "STRING" }, skills: { type: "ARRAY", items: { type: "STRING" } }, outcome: { type: "STRING" }, emoji: { type: "STRING" } }, required: ["id", "title", "skills", "outcome"] } } }, required: ["stages"] } }
    });
    const parsed = JSON.parse(response.text || "{}");
    const aiStages = new Map((parsed.stages || []).map((stage) => [String(stage.id), stage]));
    const enriched = baseStages.map((stage) => { const generated = aiStages.get(stage.id) || {}; return { ...stage, title: String(generated.title || stage.title).slice(0, 100), skills: Array.isArray(generated.skills) ? generated.skills.slice(0, 3).map(String) : [], outcome: String(generated.outcome || "").slice(0, 1000), emoji: String(generated.emoji || "") }; });
    const roadmap = await regenerateCourseJourney(course._id, enriched);
    await recordRoadmapAudit(req, "course.roadmap.regenerate", course._id, roadmap);
    return success(res, { roadmap }, "Course journey regenerated with AI");
  } catch (error) { next(error); }
}

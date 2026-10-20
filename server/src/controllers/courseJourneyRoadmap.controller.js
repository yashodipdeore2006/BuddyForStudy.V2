import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { getCourseJourney, regenerateCourseJourney, buildJourneyStages } from "../services/courseJourneyRoadmap.service.js";
import { Course } from "../models/Course.js";

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
    return success(res, { roadmap }, "Course journey roadmap saved");
  } catch (error) { if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors); next(error); }
}

export async function regenerateAdmin(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId).lean();
    if (!course || course.deletedAt) return failure(res, "Course not found", 404);
    const stages = buildJourneyStages(course.modules || [], []);
    const roadmap = await regenerateCourseJourney(course._id, stages);
    return success(res, { roadmap }, "Course journey regenerated from current curriculum");
  } catch (error) { next(error); }
}

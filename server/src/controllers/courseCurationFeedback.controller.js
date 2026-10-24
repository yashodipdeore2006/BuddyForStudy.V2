import { z } from "zod";
import mongoose from "mongoose";
import { CourseCurationFeedback } from "../models/CourseCurationFeedback.js";
import { success, failure } from "../utils/response.js";

const schema = z.object({
  event: z.enum(["helpful", "outdated", "wrong_level", "completed", "abandoned"]),
  query: z.string().trim().min(2).max(200),
  resourceId: z.string().trim().min(1).max(200),
  resourceType: z.enum(["video", "playlist", "series"]).default("video"),
  skillId: z.string().trim().max(160).optional().nullable(),
  courseId: z.string().trim().optional().nullable(),
  rank: z.number().int().min(1).max(100).optional().nullable(),
  score: z.number().min(0).max(100).optional().nullable()
});

function normalizeQuery(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}+#.]+/gu, " ").trim().replace(/\s+/g, " ");
}

export async function recordCurationFeedback(req, res, next) {
  try {
    const input = schema.parse(req.body);
    if (input.courseId && !mongoose.isValidObjectId(input.courseId)) return failure(res, "Invalid courseId", 400);
    const feedback = await CourseCurationFeedback.create({
      user: req.user?.userId || null,
      query: input.query,
      normalizedQuery: normalizeQuery(input.query),
      event: input.event,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      skillId: input.skillId || null,
      courseId: input.courseId || null,
      engineVersion: "course-curation-decision-engine-v1.7",
      rank: input.rank ?? null,
      score: input.score ?? null
    });
    return success(res, { recorded: true, id: String(feedback._id) }, "Curation feedback recorded");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return next(error);
  }
}

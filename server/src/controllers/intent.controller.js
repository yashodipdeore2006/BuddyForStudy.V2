import { z } from "zod";
import { env } from "../config/env.js";
import { parseIntent, IntentQuery } from "../services/intent.service.js";
import { IntentQuestionEvent } from "../models/IntentQuestionEvent.js";
import { failure, success } from "../utils/response.js";
export async function parseIntentController(req, res, next) {
  if (!env.intentV2) return failure(res, "Intent v2 is not enabled.", 404);
  try {
    const body = z.object({ query: IntentQuery }).parse(req.body);
    const result = await parseIntent(body.query);
    return success(res, result, "Intent parsed");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    next(error);
  }
}

const questionEventSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  packId: z.string().trim().max(60).default("core"),
  event: z.enum(["shown", "answered", "skipped", "abandoned"]),
  position: z.number().int().min(0).max(20).default(0)
}).strict();

export async function trackIntentQuestionEventController(req, res, next) {
  try {
    const payload = questionEventSchema.parse(req.body);
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) return failure(res, "Authentication required.", 401);
    await IntentQuestionEvent.create({
      userId,
      questionId: payload.questionId,
      packId: payload.packId || "core",
      event: payload.event,
      position: payload.position
    });
    return success(res, { recorded: true }, "Question event recorded");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    next(error);
  }
}

export async function getRetiredIntentQuestionsController(req, res, next) {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await IntentQuestionEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      // Count each learner once per question and event so repeated client requests
      // cannot manipulate the retirement threshold.
      { $group: {
        _id: { questionId: "$questionId", userId: "$userId" },
        shown: { $max: { $cond: [{ $eq: ["$event", "shown"] }, 1, 0] } },
        answered: { $max: { $cond: [{ $eq: ["$event", "answered"] }, 1, 0] } },
        skipped: { $max: { $cond: [{ $eq: ["$event", "skipped"] }, 1, 0] } },
        abandoned: { $max: { $cond: [{ $eq: ["$event", "abandoned"] }, 1, 0] } }
      } },
      { $group: {
        _id: "$_id.questionId",
        shown: { $sum: "$shown" },
        answered: { $sum: "$answered" },
        skipped: { $sum: "$skipped" },
        abandoned: { $sum: "$abandoned" }
      } },
      { $match: { shown: { $gte: 100 } } }
    ]);
    const retiredQuestionIds = rows.filter((row) => {
      const denominator = Math.max(1, row.shown);
      const answerRate = row.answered / denominator;
      const exitRate = (row.skipped + row.abandoned) / denominator;
      return answerRate < 0.05 && exitRate >= 0.9;
    }).map((row) => row._id);
    return success(res, { retiredQuestionIds, evaluatedAt: new Date().toISOString(), sampleWindowDays: 30, minimumImpressions: 100 }, "Question quality metrics");
  } catch (error) {
    next(error);
  }
}

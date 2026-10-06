import { z } from "zod";
import * as service from "../services/review.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default("")
});

export async function list(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    return success(res, await service.listReviews(req.params.courseId));
  } catch (e) { next(e); }
}

export async function upsert(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const input = reviewSchema.parse(req.body);
    const review = await service.upsertReview(req.user.userId, req.params.courseId, input.rating, input.comment);
    return success(res, { review }, "Review saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    await service.deleteReview(req.user.userId, req.params.courseId);
    return success(res, {}, "Review deleted");
  } catch (e) { next(e); }
}

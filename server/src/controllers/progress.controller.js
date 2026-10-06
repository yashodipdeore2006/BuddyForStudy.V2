import * as service from "../services/progress.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

export async function get(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const progress = await service.getProgress(req.user.userId, req.params.courseId);
    return success(res, { progress });
  } catch (e) { next(e); }
}

export async function complete(req, res, next) {
  try {
    const { courseId, itemId } = req.params;
    if (!isValidObjectId(courseId) || !isValidObjectId(itemId)) return failure(res, "Invalid identifier", 400);
    const progress = await service.completeItem(req.user.userId, courseId, itemId);
    return success(res, {
      message: "Learning item completed",
      progress: {
        course: progress.course,
        completedCount: progress.completedCount,
        totalLessons: progress.totalLessons,
        percentage: progress.percentage
      }
    });
  } catch (e) { next(e); }
}

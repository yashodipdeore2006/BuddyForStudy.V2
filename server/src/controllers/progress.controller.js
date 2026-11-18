import * as service from "../services/progress.service.js";
import { syncProgressOperations, MAX_PROGRESS_SYNC_BATCH_SIZE } from "../services/progressSync.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

function serializeProgress(progress) {
  const value = progress?.toObject ? progress.toObject() : progress || {};
  return {
    _id: value._id ? String(value._id) : value.id,
    user: value.user ? String(value.user._id || value.user) : undefined,
    course: value.course ? String(value.course._id || value.course) : undefined,
    completedLessons: (value.completedLessons || []).map((entry) => ({
      lessonId: String(entry.lessonId),
      type: entry.type,
      completedAt: entry.completedAt
    })),
    completedCount: Number(value.completedCount || 0),
    totalLessons: Number(value.totalLessons || 0),
    percentage: Number(value.percentage || 0),
    lastLessonId: value.lastLessonId ? String(value.lastLessonId) : null,
    lastAccessedAt: value.lastAccessedAt || null,
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null
  };
}

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
      progress: serializeProgress(progress)
    });
  } catch (e) { next(e); }
}

export async function uncomplete(req, res, next) {
  try {
    const { courseId, itemId } = req.params;
    if (!isValidObjectId(courseId) || !isValidObjectId(itemId)) return failure(res, "Invalid identifier", 400);
    const progress = await service.uncompleteItem(req.user.userId, courseId, itemId);
    return success(res, {
      message: "Learning item marked incomplete",
      progress: serializeProgress(progress)
    });
  } catch (e) { next(e); }
}


export async function sync(req, res, next) {
  try {
    const operations = req.body?.operations;
    if (!Array.isArray(operations) || operations.length < 1) {
      return failure(res, "Provide at least one progress operation to synchronize.", 400);
    }
    if (operations.length > MAX_PROGRESS_SYNC_BATCH_SIZE) {
      return failure(
        res,
        "A progress sync batch cannot contain more than " + MAX_PROGRESS_SYNC_BATCH_SIZE + " operations.",
        413,
        { maxBatchSize: MAX_PROGRESS_SYNC_BATCH_SIZE }
      );
    }

    // Identity always comes from authMiddleware. Client-supplied account IDs
    // are intentionally ignored.
    const results = await syncProgressOperations(req.user.userId, operations);
    const summary = results.reduce((counts, result) => {
      counts[result.status] = (counts[result.status] || 0) + 1;
      return counts;
    }, {});
    return success(res, {
      results,
      summary,
      maxBatchSize: MAX_PROGRESS_SYNC_BATCH_SIZE
    }, "Progress synchronization batch processed.");
  } catch (error) {
    next(error);
  }
}

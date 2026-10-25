import * as service from "../services/progress.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { Course } from "../models/Course.js";
import { createNotificationEvent } from "../services/notification.service.js";

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
    if (Number(progress.percentage || 0) >= 100) {
      try {
        const course = await Course.findById(courseId).select("title").lean();
        await createNotificationEvent({
          userId: String(req.user.userId),
          title: "Course completed — congratulations!",
          message: `You completed ${course?.title || "your course"}. Celebrate the progress and choose your next learning goal.`,
          type: "course",
          link: `/courses/${courseId}/roadmap`,
          eventKey: `course-completed:${req.user.userId}:${courseId}`,
          emailSubject: "Congratulations on completing a BuddyForStudy course",
          metadata: { courseId: String(courseId), courseTitle: course?.title || "your course" },
          templateKeys: { notification: "course-completed-in-app", email: "course-completed-email" }
        });
      } catch (notificationError) {
        console.error("[notifications] course completion notice failed", {
          courseId: String(courseId),
          message: String(notificationError?.message || "Unknown notification error").slice(0, 200)
        });
      }
    }
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

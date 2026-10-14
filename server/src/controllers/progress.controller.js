import * as service from "../services/progress.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { Course } from "../models/Course.js";
import { createNotificationEvent } from "../services/notification.service.js";

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
    }
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

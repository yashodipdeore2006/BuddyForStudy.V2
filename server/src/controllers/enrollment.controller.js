import * as service from "../services/enrollment.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { Course } from "../models/Course.js";
import { createNotificationEvent } from "../services/notification.service.js";

export async function enroll(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const enrollment = await service.enroll(req.user.userId, req.params.courseId);
    const course = await Course.findById(req.params.courseId).select("title pricing").lean();
    if (course?.pricing?.mode !== "paid") {
      await createNotificationEvent({
        userId: String(req.user.userId),
        title: "You're enrolled — let's start learning",
        message: `You have been added to ${course?.title || "your course"}. Open your roadmap to choose the next lesson.`,
        type: "course",
        link: `/courses/${req.params.courseId}/roadmap`,
        eventKey: `free-course-enrolled:${enrollment._id}`,
        emailSubject: "You're enrolled in a BuddyForStudy course",
        metadata: { courseId: String(req.params.courseId), courseTitle: course?.title || "your course" }
      });
    }
    return success(res, { enrollment }, "Course enrollment successful", 201);
  } catch (e) { next(e); }
}

export async function mine(req, res, next) {
  try { return success(res, { enrollments: await service.getMine(req.user.userId) }); }
  catch (e) { next(e); }
}

export async function byCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const enrollment = await service.getForCourse(req.user.userId, req.params.courseId);
    if (!enrollment) return failure(res, "Enrollment not found", 404);
    return success(res, { enrollment });
  } catch (e) { next(e); }
}

export async function byId(req, res, next) {
  try {
    if (!isValidObjectId(req.params.enrollmentId)) return failure(res, "Invalid enrollmentId", 400);
    const enrollment = await service.getOne(req.user.userId, req.params.enrollmentId);
    if (!enrollment) return failure(res, "Enrollment not found", 404);
    return success(res, { enrollment });
  } catch (e) { next(e); }
}

export async function cancel(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const enrollment = await service.cancel(req.user.userId, req.params.courseId);
    if (!enrollment) return failure(res, "Enrollment not found", 404);
    return success(res, { enrollment }, "Enrollment cancelled");
  } catch (e) { next(e); }
}

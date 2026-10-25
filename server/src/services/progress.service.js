import { Progress } from "../models/Progress.js";
import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";
import { findLearningItem, totalLessons } from "./course.service.js";
import { recordLearningActivity } from "./achievement.service.js";
import { createNotificationEvent } from "./notification.service.js";
import { deriveLearningStatus, LEARNING_STATUS } from "../utils/learningStatus.js";

async function getAuthorizedCourse(userId, courseId) {
  const [course, enrollment] = await Promise.all([
    Course.findById(courseId),
    Enrollment.findOne({ user: userId, course: courseId, status: { $in: ["active", "completed"] } })
  ]);

  if (!course) {
    const error = new Error("Course not found");
    error.status = 404;
    throw error;
  }

  if (!enrollment) {
    const error = new Error("Active or completed enrollment required");
    error.status = 403;
    throw error;
  }

  return course;
}

export async function getProgress(userId, courseId) {
  const course = await getAuthorizedCourse(userId, courseId);
  let progress = await Progress.findOne({ user: userId, course: courseId });

  if (!progress) {
    progress = await Progress.create({
      user: userId,
      course: courseId,
      totalLessons: totalLessons(course)
    });
  }

  progress.totalLessons = totalLessons(course);
  progress.completedCount = progress.completedLessons.length;
  progress.percentage = progress.totalLessons
    ? Math.round((progress.completedCount / progress.totalLessons) * 100)
    : 0;
  await progress.save();

  return progress;
}

export async function completeItem(userId, courseId, itemId) {
  const course = await getAuthorizedCourse(userId, courseId);
  const located = findLearningItem(course, itemId);

  if (!located) {
    const error = new Error("Learning item not found");
    error.status = 404;
    throw error;
  }

  let progress = await Progress.findOne({ user: userId, course: courseId });
  if (!progress) {
    progress = new Progress({ user: userId, course: courseId });
  }

  progress.totalLessons = totalLessons(course);
  progress.lastAccessedAt = new Date();
  progress.lastLessonId = located.item._id;

  // Course content can change after a learner has completed some lessons.
  // Count only completions that still belong to the current curriculum.
  const currentLessonIds = new Set(
    (course.modules || []).flatMap((module) => module.lessons || [])
      .map((lesson) => String(lesson._id || lesson.id || ""))
      .filter(Boolean)
  );
  progress.completedLessons = progress.completedLessons.filter((entry) =>
    currentLessonIds.has(String(entry.lessonId))
  );

  const alreadyCompleted = progress.completedLessons.some(
    (entry) => entry.lessonId.toString() === itemId
  );

  if (!alreadyCompleted) {
    progress.completedLessons.push({
      lessonId: located.item._id,
      type: located.item.type,
      completedAt: new Date()
    });
  }

  progress.completedCount = progress.completedLessons.length;
  progress.percentage = progress.totalLessons
    ? Math.min(100, Math.round((progress.completedCount / progress.totalLessons) * 100))
    : 0;

  const learningStatus = deriveLearningStatus({
    completedCount: progress.completedCount,
    totalLessons: progress.totalLessons,
    lastAccessedAt: progress.lastAccessedAt,
    lastLessonId: progress.lastLessonId
  });
  await progress.save();

  let courseCompleted = false;
  if (learningStatus === LEARNING_STATUS.COMPLETED) {
    const enrollmentUpdate = await Enrollment.updateOne(
      { user: userId, course: courseId, status: "active" },
      { $set: { status: "completed", learningStatus: LEARNING_STATUS.COMPLETED } }
    );
    courseCompleted = enrollmentUpdate.modifiedCount > 0;
    // Keep previously completed enrollments synchronized even if this is a repeat
    // completion request (the notification only fires on the active -> completed transition).
    await Enrollment.updateOne(
      { user: userId, course: courseId, status: "completed", learningStatus: { $ne: LEARNING_STATUS.COMPLETED } },
      { $set: { learningStatus: LEARNING_STATUS.COMPLETED } }
    );
  } else {
    // If content was added to a previously completed course, it becomes in-progress
    // again until the new curriculum is completed.
    await Enrollment.updateOne(
      { user: userId, course: courseId, status: { $in: ["active", "completed"] } },
      { $set: { status: "active", learningStatus: LEARNING_STATUS.IN_PROGRESS } }
    );
  }

  if (!alreadyCompleted) {
    await recordLearningActivity(userId, { lessonCompleted: true, courseCompleted });
  }

  if (courseCompleted) {
    try {
      await createNotificationEvent({
        userId: String(userId),
        title: "Congratulations on completing your course",
        message: `You completed ${course.title}. Celebrate your progress and choose your next learning goal.`,
        type: "course",
        link: `/courses/${courseId}/roadmap`,
        eventKey: `course-completed:${userId}:${courseId}`,
        emailSubject: "Congratulations on completing a BuddyForStudy course",
        metadata: { courseId: String(courseId), courseTitle: course.title },
        templateKeys: {
          notification: "course-completed-in-app",
          email: "course-completed-email"
        }
      });
    } catch (error) {
      // A delivery issue must never roll back already-saved learning progress.
      console.error("[notifications] course completion notice failed", {
        courseId: String(courseId),
        message: String(error?.message || "Unknown notification error").slice(0, 200)
      });
    }
  }

  return progress;
}

export { getAuthorizedCourse };

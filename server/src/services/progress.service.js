import { Progress } from "../models/Progress.js";
import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";
import { findLearningItem, totalLessons } from "./course.service.js";

async function getAuthorizedCourse(userId, courseId) {
  const [course, enrollment] = await Promise.all([
    Course.findOne({ _id: courseId, isPublished: true }),
    Enrollment.findOne({ user: userId, course: courseId, status: "active" })
  ]);

  if (!course) {
    const error = new Error("Course not found");
    error.status = 404;
    throw error;
  }

  if (!enrollment) {
    const error = new Error("Active enrollment required");
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
    ? Math.round((progress.completedCount / progress.totalLessons) * 100)
    : 0;

  await progress.save();

  if (progress.percentage === 100) {
    await Enrollment.updateOne(
      { user: userId, course: courseId, status: "active" },
      { status: "completed" }
    );
  }

  return progress;
}

export { getAuthorizedCourse };

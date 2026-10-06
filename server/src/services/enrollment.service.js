import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";

export async function enroll(userId, courseId) {
  const course = await Course.findOne({ _id: courseId, isPublished: true }).select("_id");
  if (!course) {
    const error = new Error("Published course not found");
    error.status = 404;
    throw error;
  }

  const existing = await Enrollment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (existing.status === "cancelled") {
      existing.status = "active";
      existing.enrolledAt = new Date();
      return existing.save();
    }
    const error = new Error("Already enrolled in this course");
    error.status = 409;
    throw error;
  }

  return Enrollment.create({ user: userId, course: courseId });
}

export function getMine(userId) {
  return Enrollment.find({ user: userId })
    .populate({ path: "course", select: "title slug description category level duration thumbnail isPublished" })
    .sort({ enrolledAt: -1 });
}

export function getOne(userId, enrollmentId) {
  return Enrollment.findOne({ _id: enrollmentId, user: userId }).populate("course");
}

export function getForCourse(userId, courseId) {
  return Enrollment.findOne({ user: userId, course: courseId }).populate("course");
}

export async function cancel(userId, courseId) {
  return Enrollment.findOneAndUpdate(
    { user: userId, course: courseId, status: { $ne: "cancelled" } },
    { status: "cancelled" },
    { new: true }
  );
}

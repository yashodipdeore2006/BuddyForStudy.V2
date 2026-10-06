import { Review } from "../models/Review.js";
import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";

async function ensureEnrolled(userId, courseId) {
  const enrolled = await Enrollment.exists({ user: userId, course: courseId, status: { $in: ["active", "completed"] } });
  if (!enrolled) {
    const error = new Error("You must be enrolled in this course to review it");
    error.status = 403;
    throw error;
  }
}

export async function listReviews(courseId) {
  const reviews = await Review.find({ course: courseId })
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .lean();
  const stats = reviews.reduce((acc, review) => {
    acc.count += 1;
    acc.total += review.rating;
    acc.distribution[review.rating] += 1;
    return acc;
  }, { count: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  return {
    reviews,
    stats: { count: stats.count, average: stats.count ? Number((stats.total / stats.count).toFixed(1)) : 0, distribution: stats.distribution }
  };
}

export async function upsertReview(userId, courseId, rating, comment) {
  await ensureEnrolled(userId, courseId);
  const course = await Course.findById(courseId).select("_id");
  if (!course) { const error = new Error("Course not found"); error.status = 404; throw error; }
  return Review.findOneAndUpdate(
    { user: userId, course: courseId },
    { $set: { rating, comment } },
    { new: true, upsert: true, runValidators: true }
  ).populate("user", "name");
}

export async function deleteReview(userId, courseId) {
  const result = await Review.findOneAndDelete({ user: userId, course: courseId });
  if (!result) { const error = new Error("Review not found"); error.status = 404; throw error; }
  return result;
}

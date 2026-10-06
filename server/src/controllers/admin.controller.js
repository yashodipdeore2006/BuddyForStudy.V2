import { User } from "../models/User.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

export async function users(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const [users, total] = await Promise.all([
      User.find().select("-password").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments()
    ]);
    return success(res, { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
}

export async function updateUser(req, res, next) {
  try {
    if (!isValidObjectId(req.params.userId)) return failure(res, "Invalid userId", 400);
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { isActive: Boolean(req.body.isActive) } },
      { new: true, runValidators: true }
    ).select("-password");
    if (!user) return failure(res, "User not found", 404);
    return success(res, { user }, "User status updated");
  } catch (e) { next(e); }
}

export async function analytics(_req, res, next) {
  try {
    const [totalUsers, activeUsers, totalCourses, publishedCourses, totalEnrollments, activeEnrollments, completedEnrollments] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Course.countDocuments(),
        Course.countDocuments({ isPublished: true }),
        Enrollment.countDocuments(),
        Enrollment.countDocuments({ status: "active" }),
        Enrollment.countDocuments({ status: "completed" })
      ]);
    return success(res, {
      analytics: { totalUsers, activeUsers, totalCourses, publishedCourses, totalEnrollments, activeEnrollments, completedEnrollments }
    });
  } catch (e) { next(e); }
}

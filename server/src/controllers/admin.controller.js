import { User } from "../models/User.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { AuditLog } from "../models/AuditLog.js";
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


export async function userDetails(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    const user = await User.findById(userId).select("-password").lean();
    if (!user) return failure(res, "User not found", 404);
    const [subscription, enrollments, payments] = await Promise.all([
      UserSubscription.findOne({ user: userId, status: { $in: ["trialing", "active", "past_due"] } }).populate("plan", "name price currency").lean(),
      Enrollment.find({ user: userId }).populate("course", "title slug pricing mode isPublished").sort({ updatedAt: -1 }).lean(),
      Payment.find({ user: userId }).populate("course", "title").sort({ createdAt: -1 }).limit(20).lean()
    ]);
    return success(res, { user, subscription, enrollments, payments });
  } catch (e) { next(e); }
}

export async function userCourses(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    const userExists = await User.exists({ _id: userId });
    if (!userExists) return failure(res, "User not found", 404);
    const [courses, enrollments, payments] = await Promise.all([
      Course.find({ isPublished: true }).select("title slug description category level thumbnail pricing enrollmentEnabled").sort({ title: 1 }).lean(),
      Enrollment.find({ user: userId }).select("course status accessSource accessReason grantedBy revokedAt updatedAt").lean(),
      Payment.find({ user: userId, course: { $ne: null }, status: { $in: ["paid", "partially_refunded"] } }).select("course status amount currency provider paidAt").lean()
    ]);
    const enrollmentByCourse = new Map(enrollments.map((item) => [String(item.course), item]));
    const paidCourseIds = new Set(payments.map((item) => String(item.course)));
    const items = courses.map((course) => {
      const enrollment = enrollmentByCourse.get(String(course._id)) || null;
      return {
        ...course,
        enrollment: enrollment ? {
          id: String(enrollment._id),
          status: enrollment.status,
          accessSource: enrollment.accessSource || "self",
          accessReason: enrollment.accessReason || "",
          grantedBy: enrollment.grantedBy ? String(enrollment.grantedBy) : null,
          revokedAt: enrollment.revokedAt || null
        } : null,
        hasVerifiedPayment: paidCourseIds.has(String(course._id))
      };
    });
    return success(res, { courses: items });
  } catch (e) { next(e); }
}

export async function grantUserCourse(req, res, next) {
  try {
    const { userId, courseId } = req.params;
    if (!isValidObjectId(userId) || !isValidObjectId(courseId)) return failure(res, "Invalid user or course ID", 400);
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failure(res, "Please provide a reason for granting course access", 400);
    if (reason.length > 500) return failure(res, "Reason must be 500 characters or fewer", 400);
    const [user, course] = await Promise.all([
      User.findById(userId).select("_id name email"),
      Course.findOne({ _id: courseId, isPublished: true }).select("_id title pricing")
    ]);
    if (!user) return failure(res, "User not found", 404);
    if (!course) return failure(res, "Published course not found", 404);
    const existing = await Enrollment.findOne({ user: userId, course: courseId });
    const before = existing ? { status: existing.status, accessSource: existing.accessSource || "self" } : null;
    if (existing && existing.status !== "cancelled") {
      return failure(res, "This user already has active access to the course", 409);
    }
    let enrollment;
    if (existing) {
      existing.status = "active";
      existing.accessSource = "admin";
      existing.grantedBy = req.user.userId;
      existing.accessReason = reason;
      existing.revokedBy = null;
      existing.revokedAt = null;
      existing.enrolledAt = new Date();
      enrollment = await existing.save();
    } else {
      enrollment = await Enrollment.create({
        user: userId,
        course: courseId,
        status: "active",
        accessSource: "admin",
        grantedBy: req.user.userId,
        accessReason: reason
      });
    }
    await AuditLog.create({
      actor: req.user.userId,
      action: "user.course_access_granted",
      targetType: "enrollment",
      targetId: String(enrollment._id),
      reason,
      before,
      after: { userId: String(userId), courseId: String(courseId), status: enrollment.status, accessSource: enrollment.accessSource },
      ip: req.ip || "",
      userAgent: req.get("user-agent") || ""
    });
    return success(res, { enrollment, user: { id: String(user._id), name: user.name, email: user.email }, course: { id: String(course._id), title: course.title } }, "Course access granted", 201);
  } catch (e) {
    if (e?.code === 11000) return failure(res, "Course access already exists; refresh the user record", 409);
    next(e);
  }
}

export async function revokeUserCourse(req, res, next) {
  try {
    const { userId, courseId } = req.params;
    if (!isValidObjectId(userId) || !isValidObjectId(courseId)) return failure(res, "Invalid user or course ID", 400);
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failure(res, "Please provide a reason for removing course access", 400);
    if (reason.length > 500) return failure(res, "Reason must be 500 characters or fewer", 400);
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (!enrollment || enrollment.status === "cancelled") return failure(res, "This user does not currently have course access", 404);
    const before = { status: enrollment.status, accessSource: enrollment.accessSource || "self" };
    enrollment.status = "cancelled";
    enrollment.revokedBy = req.user.userId;
    enrollment.revokedAt = new Date();
    enrollment.accessReason = reason;
    await enrollment.save();
    await AuditLog.create({
      actor: req.user.userId,
      action: "user.course_access_revoked",
      targetType: "enrollment",
      targetId: String(enrollment._id),
      reason,
      before,
      after: { userId: String(userId), courseId: String(courseId), status: enrollment.status, accessSource: enrollment.accessSource || "self" },
      ip: req.ip || "",
      userAgent: req.get("user-agent") || ""
    });
    return success(res, { enrollment }, "Course access removed. Payment records were not changed.");
  } catch (e) { next(e); }
}

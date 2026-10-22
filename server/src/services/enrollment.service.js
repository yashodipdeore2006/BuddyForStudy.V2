import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";
import { Review } from "../models/Review.js";
import { Payment } from "../models/Payment.js";
import { createNotificationEvent } from "./notification.service.js";
import { buildCoursePurchaseNotificationPayload } from "./billingNotificationPayloads.js";
import { getEntitlement } from "./subscriptionEntitlement.service.js";
import { toPublicCoursePreview } from "../utils/coursePreview.js";

async function notifyFreeCourseEnrollment(userId, course, enrollment) {
  if (course.pricing?.mode === "paid") return;
  const enrolledAt = enrollment.enrolledAt ? new Date(enrollment.enrolledAt).getTime() : Date.now();
  try {
    await createNotificationEvent({
      userId: String(userId),
      title: "You're enrolled — let's start learning",
      message: `You have been added to ${course.title || "your course"}. Open your roadmap to choose the next lesson.`,
      type: "course",
      link: `/courses/${course._id}/roadmap`,
      eventKey: `free-course-enrolled:${enrollment._id}:${enrolledAt}`,
      emailSubject: "You're enrolled in a BuddyForStudy course",
      metadata: { courseId: String(course._id), courseTitle: course.title || "your course" },
      templateKeys: { notification: "free-course-enrolled-in-app", email: "free-course-enrolled-email" }
    });
  } catch (error) {
    console.error("[notifications] course enrollment notice failed", {
      courseId: String(course._id),
      message: String(error?.message || "Unknown notification error").slice(0, 200)
    });
  }
}

async function notifyPaidCoursePurchase(userId, course, payment, enrollment) {
  try {
    const notification = await createNotificationEvent(buildCoursePurchaseNotificationPayload({ userId, payment, course, enrollment }));
    if (!notification) throw new Error("Course purchase notification was not persisted");
    await Payment.updateOne(
      { _id: payment._id, status: { $in: ["paid", "partially_refunded"] } },
      { $set: { purchaseNotificationStatus: "queued", purchaseNotificationQueuedAt: new Date() } }
    );
  } catch (error) {
    console.error("[notifications] course purchase notice failed", {
      paymentId: String(payment?._id || ""),
      courseId: String(course?._id || ""),
      message: String(error?.message || "Unknown notification error").slice(0, 200)
    });
  }
}

export async function enroll(userId, courseId, { isAdmin = false } = {}) {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    $or: [
      { isPublished: true, $or: [
        { "generation.mode": { $nin: ["normal", "ai", "module", "discovery"] } },
        {
          aiReviewStatus: "approved",
          $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
        }
      ] },
      {
        visibility: "private",
        createdForUser: userId,
        aiReviewStatus: "approved",
        $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
      }
    ]
  }).select("_id title pricing enrollmentEnabled visibility createdForUser");
  if (!course) {
    const error = new Error("Published course not found");
    error.status = 404;
    throw error;
  }

  if (course.enrollmentEnabled === false) { const error = new Error("Enrollment is currently disabled for this course"); error.status = 403; throw error; }
  let paidPayment = null;
  let subscriptionAccess = false;
  if (course.pricing?.mode === "paid") {
    paidPayment = await Payment.findOne({ user: userId, course: courseId, provider: "razorpay", status: { $in: ["paid", "partially_refunded"] } }).sort({ paidAt: -1, createdAt: -1 });
    if (!paidPayment && !isAdmin) {
      const entitlement = await getEntitlement(userId, "published_courses");
      subscriptionAccess = Boolean(entitlement.allowed);
      if (!subscriptionAccess) {
        const error = new Error("This paid course requires an active plan that includes all published courses or a verified individual purchase.");
        error.status = 402;
        throw error;
      }
    }
  }

  // A verified individual purchase grants lifetime access. An active subscription
  // may also grant access when its published-course entitlement includes paid courses.
  if (!paidPayment && !subscriptionAccess && !isAdmin) {
    const entitlement = await getEntitlement(userId, "published_courses");
    if (!entitlement.allowed) {
      const error = new Error("Course enrollment is not included in your current plan. Upgrade your plan or purchase this course.");
      error.status = 403;
      throw error;
    }
  }

  const existing = await Enrollment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (subscriptionAccess && !paidPayment && existing.accessSource !== "subscription") {
      existing.accessSource = "subscription";
      await existing.save();
    }
    if (existing.status === "cancelled") {
      if (existing.revokedBy) {
        const error = new Error("Access to this course was removed by an administrator. Please contact support.");
        error.status = 403;
        throw error;
      }
      existing.status = "active";
      existing.enrolledAt = new Date();
      if (subscriptionAccess) existing.accessSource = "subscription";
      await existing.save();
      if (paidPayment) await notifyPaidCoursePurchase(userId, course, paidPayment, existing);
      else await notifyFreeCourseEnrollment(userId, course, existing);
      return existing;
    }
    if (paidPayment) {
      await notifyPaidCoursePurchase(userId, course, paidPayment, existing);
      return existing;
    }
    if (subscriptionAccess || existing.accessSource === "subscription") return existing;
    const error = new Error("Already enrolled in this course");
    error.status = 409;
    throw error;
  }

  const enrollment = await Enrollment.create({ user: userId, course: courseId, accessSource: subscriptionAccess ? "subscription" : isAdmin ? "admin" : "self" });
  if (paidPayment) await notifyPaidCoursePurchase(userId, course, paidPayment, enrollment);
  else await notifyFreeCourseEnrollment(userId, course, enrollment);
  return enrollment;
}

export async function getMine(userId) {
  const enrollments = await Enrollment.find({ user: userId })
    .populate({
      path: "course",
      select: "title slug description category level duration thumbnail isPublished pricing enrollmentEnabled learningOutcomes generation modules createdAt updatedAt"
    })
    .sort({ enrolledAt: -1 });

  // Keep the enrolled-course response safe, and attach aggregate review stats
  // so My Learning cards can show genuine ratings without one request per card.
  const courseIds = enrollments.map((enrollment) => enrollment.course?._id).filter(Boolean);
  const ratingRows = courseIds.length ? await Review.aggregate([
    { $match: { course: { $in: courseIds }, isHidden: { $ne: true }, moderationStatus: "approved" } },
    { $group: { _id: "$course", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
  ]) : [];
  const ratingsByCourse = new Map(ratingRows.map((row) => [String(row._id), {
    ratingAverage: Math.round(Number(row.ratingAverage || 0) * 10) / 10,
    ratingCount: Number(row.ratingCount || 0)
  }]));
  return enrollments.map((enrollment) => {
    const result = enrollment.toObject();
    if (result.course) {
      const courseId = String(result.course._id || result.course.id);
      result.course = {
        ...toPublicCoursePreview(result.course),
        ...(ratingsByCourse.get(courseId) || { ratingAverage: 0, ratingCount: 0 })
      };
    }
    return result;
  });
}

export function getOne(userId, enrollmentId) {
  return Enrollment.findOne({ _id: enrollmentId, user: userId }).populate({ path: "course", select: "title slug description category level duration thumbnail isPublished pricing enrollmentEnabled certificateEnabled featured" });
}

export function getForCourse(userId, courseId) {
  return Enrollment.findOne({ user: userId, course: courseId }).populate({ path: "course", select: "title slug description category level duration thumbnail isPublished pricing enrollmentEnabled certificateEnabled featured" });
}

export async function cancel(userId, courseId) {
  return Enrollment.findOneAndUpdate(
    { user: userId, course: courseId, status: { $ne: "cancelled" } },
    { status: "cancelled" },
    { new: true }
  );
}

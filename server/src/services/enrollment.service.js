import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";
import { Payment } from "../models/Payment.js";
import { createNotificationEvent } from "./notification.service.js";
import { buildCoursePurchaseNotificationPayload } from "./billingNotificationPayloads.js";

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
      { _id: payment._id, purchaseNotificationStatus: "pending" },
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

export async function enroll(userId, courseId) {
  const course = await Course.findOne({ _id: courseId, isPublished: true }).select("_id title pricing enrollmentEnabled");
  if (!course) {
    const error = new Error("Published course not found");
    error.status = 404;
    throw error;
  }

  if (course.enrollmentEnabled === false) { const error = new Error("Enrollment is currently disabled for this course"); error.status = 403; throw error; }
  let paidPayment = null;
  if (course.pricing?.mode === "paid") {
    paidPayment = await Payment.findOne({ user: userId, course: courseId, provider: "razorpay", status: { $in: ["paid", "partially_refunded"] } }).sort({ paidAt: -1, createdAt: -1 });
    if (!paidPayment) { const error = new Error("Verified payment is required before enrolling in this course"); error.status = 402; throw error; }
  }

  const existing = await Enrollment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (existing.status === "cancelled") {
      existing.status = "active";
      existing.enrolledAt = new Date();
      await existing.save();
      if (paidPayment) await notifyPaidCoursePurchase(userId, course, paidPayment, existing);
      else await notifyFreeCourseEnrollment(userId, course, existing);
      return existing;
    }
    if (paidPayment) {
      await notifyPaidCoursePurchase(userId, course, paidPayment, existing);
      return existing;
    }
    const error = new Error("Already enrolled in this course");
    error.status = 409;
    throw error;
  }

  const enrollment = await Enrollment.create({ user: userId, course: courseId });
  if (paidPayment) await notifyPaidCoursePurchase(userId, course, paidPayment, enrollment);
  else await notifyFreeCourseEnrollment(userId, course, enrollment);
  return enrollment;
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

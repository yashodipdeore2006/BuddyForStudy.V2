import { Enrollment } from "../models/Enrollment.js";
import { Course } from "../models/Course.js";
import { Review } from "../models/Review.js";
import { Payment } from "../models/Payment.js";
import { createNotificationEvent } from "./notification.service.js";
import { buildCoursePurchaseNotificationPayload } from "./billingNotificationPayloads.js";
import { getEntitlement } from "./subscriptionEntitlement.service.js";
import { toPublicCoursePreview } from "../utils/coursePreview.js";
import { Progress } from "../models/Progress.js";
import { deriveLearningStatus, LEARNING_STATUS } from "../utils/learningStatus.js";
import { getEffectiveCoursePrice } from "../utils/coursePricing.js";

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

export async function enroll(userId, courseId, { isAdmin = false, accessPreference } = {}) {
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

  // Fail closed for legacy or corrupted pricing. Treating an unknown mode as
  // free would allow direct API enrollment to bypass the checkout flow.
  if (!isAdmin && !["free", "paid"].includes(course.pricing?.mode)) {
    const error = new Error("Course pricing is not configured correctly. Please contact support.");
    error.status = 409;
    throw error;
  }
  if (!isAdmin && course.pricing?.mode === "paid" && getEffectiveCoursePrice(course.pricing) === null) {
    const error = new Error("Course price is invalid. Please contact support before enrolling.");
    error.status = 409;
    throw error;
  }

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
  } else if (!isAdmin) {
    // A free course can be enrolled individually without buying a subscription.
    // If the learner explicitly selects their subscription, only allow it when
    // their current plan has the published-course entitlement.
    const entitlement = await getEntitlement(userId, "published_courses");
    if (accessPreference === "subscription") {
      if (!entitlement.allowed) {
        const error = new Error("An active plan with published-course access is required to enroll through your subscription.");
        error.status = 403;
        throw error;
      }
      subscriptionAccess = true;
    } else if (accessPreference === "individual") {
      subscriptionAccess = false;
    } else {
      // Keep default enrollment convenient: existing plan holders use their plan;
      // everyone else can still enroll in a free course without a subscription.
      subscriptionAccess = Boolean(entitlement.allowed);
    }
  }

  // Paid courses still require a verified individual purchase or active plan.
  // Free courses may be enrolled individually without a subscription.

  const existing = await Enrollment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (paidPayment && existing.accessSource === "subscription") {
      // An individual purchase upgrades subscription-backed access to lifetime access.
      existing.accessSource = "self";
      await existing.save();
    } else if (subscriptionAccess && !paidPayment && existing.accessSource !== "subscription") {
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
      else if (!paidPayment && course.pricing?.mode !== "paid" && accessPreference === "individual") {
        existing.accessSource = isAdmin ? "admin" : "self";
      }
      await existing.save();
      if (paidPayment) await notifyPaidCoursePurchase(userId, course, paidPayment, existing);
      else await notifyFreeCourseEnrollment(userId, course, existing);
      return existing;
    }
    if (!paidPayment && course.pricing?.mode !== "paid" && accessPreference === "individual" && existing.accessSource === "subscription") {
      // When a subscription ends, let a learner convert a free course to
      // standalone access instead of leaving an unusable subscription enrollment.
      existing.accessSource = isAdmin ? "admin" : "self";
      await existing.save();
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
  const enrollments = await Enrollment.find({
    user: userId,
    status: { $ne: "cancelled" },
    revokedBy: null
  })
    .populate({
      path: "course",
      select: "title slug description category level duration thumbnail isPublished pricing enrollmentEnabled learningOutcomes generation modules createdAt updatedAt visibility createdForUser status deletedAt aiReviewStatus aiReviewSource aiReviewedBy"
    })
    .sort({ enrolledAt: -1 });

  const paidCourseIds = enrollments
    .filter((enrollment) => enrollment.course?.pricing?.mode === "paid")
    .map((enrollment) => enrollment.course?._id)
    .filter(Boolean);
  const needsPublishedCourseEntitlement = paidCourseIds.length > 0 ||
    enrollments.some((enrollment) => enrollment.accessSource === "subscription");
  const [verifiedPayments, publishedCourseEntitlement] = await Promise.all([
    paidCourseIds.length
      ? Payment.find({
          user: userId,
          course: { $in: paidCourseIds },
          provider: "razorpay",
          status: { $in: ["paid", "partially_refunded"] }
        }).select("course").lean()
      : [],
    needsPublishedCourseEntitlement
      ? getEntitlement(userId, "published_courses")
      : Promise.resolve(null)
  ]);
  const individuallyPurchasedCourseIds = new Set(verifiedPayments.map((payment) => String(payment.course)));
  const planEntitled = Boolean(publishedCourseEntitlement?.allowed);
  const visibleEnrollments = enrollments.filter((enrollment) => {
    const course = enrollment.course;
    const courseId = String(course?._id || enrollment.course || "");
    return isEnrollmentCourseAccessAllowed({
      enrollment,
      course,
      userId,
      planEntitled,
      hasIndividualPayment: individuallyPurchasedCourseIds.has(courseId)
    });
  });

  const courseIds = visibleEnrollments.map((enrollment) => enrollment.course?._id).filter(Boolean);
  const [ratingRows, progressRows, legacyStatusRows] = await Promise.all([
    courseIds.length ? Review.aggregate([
      { $match: { course: { $in: courseIds }, isHidden: { $ne: true }, moderationStatus: "approved" } },
      { $group: { _id: "$course", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
    ]) : [],
    courseIds.length ? Progress.find({ user: userId, course: { $in: courseIds } })
      .select("course completedLessons completedCount totalLessons percentage lastLessonId lastAccessedAt")
      .lean() : [],
    // One-time, lazy migration for legacy enrollments created before learningStatus
    // was persisted. Query the raw collection so schema defaults do not hide missing fields.
    visibleEnrollments.length ? Enrollment.collection.find({
      user: visibleEnrollments[0].user,
      learningStatus: { $exists: false }
    }).project({ _id: 1, course: 1, status: 1 }).toArray() : []
  ]);

  const ratingsByCourse = new Map(ratingRows.map((row) => [String(row._id), {
    ratingAverage: Math.round(Number(row.ratingAverage || 0) * 10) / 10,
    ratingCount: Number(row.ratingCount || 0)
  }]));
  const progressByCourse = new Map(progressRows.map((row) => [String(row.course), row]));
  const legacyByEnrollmentId = new Map(legacyStatusRows.map((row) => [String(row._id), row]));
  const statusUpdates = [];

  const resultRows = visibleEnrollments.map((enrollment) => {
    const result = enrollment.toObject();
    const course = result.course;
    const courseId = course ? String(course._id || course.id) : String(result.course);
    const progress = progressByCourse.get(courseId) || null;
    const lessonIds = (course?.modules || [])
      .flatMap((module) => module?.lessons || [])
      .map((lesson) => String(lesson?._id ?? lesson?.id ?? ""))
      .filter((id) => id && id !== "undefined" && id !== "null");
    const availableLessonIds = new Set(lessonIds);
    const completedIds = new Set((progress?.completedLessons || [])
      .map((entry) => String(entry?.lessonId ?? ""))
      .filter((id) => id && (!lessonIds.length || availableLessonIds.has(id))));
    const totalLessons = lessonIds.length || Math.max(0, Number(progress?.totalLessons || 0));
    const completedCount = lessonIds.length
      ? completedIds.size
      : Math.max(0, Number(progress?.completedCount ?? completedIds.size));
    const percentage = totalLessons > 0
      ? Math.min(100, Math.round((completedCount / totalLessons) * 100))
      : 0;

    const isLegacyStatus = legacyByEnrollmentId.has(String(enrollment._id));
    const storedStatus = result.learningStatus;
    const validStoredStatus = Object.values(LEARNING_STATUS).includes(storedStatus);
    const hasStoredProgress = Boolean(progress);
    const progressDisagreesWithStoredStatus = hasStoredProgress && (
      (storedStatus === LEARNING_STATUS.COMPLETED && totalLessons > 0 && completedCount < totalLessons) ||
      (storedStatus === LEARNING_STATUS.NOT_STARTED &&
        (completedCount > 0 || Boolean(progress?.lastAccessedAt) || Boolean(progress?.lastLessonId))) ||
      (storedStatus === LEARNING_STATUS.IN_PROGRESS && totalLessons > 0 && completedCount >= totalLessons)
    );
    const shouldReconcileStatus = isLegacyStatus || progressDisagreesWithStoredStatus || !validStoredStatus;
    const learningStatus = shouldReconcileStatus
      ? deriveLearningStatus({
          completedCount,
          totalLessons,
          lastAccessedAt: progress?.lastAccessedAt,
          lastLessonId: progress?.lastLessonId,
          enrollmentStatus: enrollment.status
        })
      : storedStatus;

    if (shouldReconcileStatus && (isLegacyStatus || learningStatus !== storedStatus)) {
      const setFields = { learningStatus };
      // Keep the separate access status aligned with completed/current curricula,
      // but never reactivate a deliberately cancelled enrollment.
      if (enrollment.status !== "cancelled") {
        setFields.status = learningStatus === LEARNING_STATUS.COMPLETED ? "completed" : "active";
      }
      statusUpdates.push({
        updateOne: {
          filter: isLegacyStatus
            ? { _id: enrollment._id, learningStatus: { $exists: false } }
            : { _id: enrollment._id, learningStatus: storedStatus },
          update: { $set: setFields }
        }
      });
    }

    const nextLessonId = learningStatus === LEARNING_STATUS.COMPLETED
      ? null
      : lessonIds.find((id) => !completedIds.has(id)) || null;

    result.learningStatus = learningStatus;
    result.learningProgress = {
      completedCount,
      totalLessons,
      percentage,
      nextLessonId,
      lastLessonId: progress?.lastLessonId ? String(progress.lastLessonId) : null,
      lastAccessedAt: progress?.lastAccessedAt || null
    };

    if (course) {
      result.course = {
        ...toPublicCoursePreview(course),
        ...(ratingsByCourse.get(courseId) || { ratingAverage: 0, ratingCount: 0 })
      };
    }
    return result;
  });

  if (statusUpdates.length) {
    await Enrollment.bulkWrite(statusUpdates, { ordered: false });
  }

  return resultRows;
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

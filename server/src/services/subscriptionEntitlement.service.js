import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Payment } from "../models/Payment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { UserFeatureOverride } from "../models/UserFeatureOverride.js";
import { SUBSCRIPTION_FEATURES, normalizeSubscriptionFeatures } from "../config/subscriptionFeatures.js";

const featureByKey = new Map(SUBSCRIPTION_FEATURES.map((feature) => [feature.key, feature]));
const labelToFeature = new Map(SUBSCRIPTION_FEATURES.map((feature) => [feature.label, feature]));

export function resolveFeature(feature) {
  const value = String(feature || "").trim();
  if (featureByKey.has(value)) return featureByKey.get(value);
  if (labelToFeature.has(value)) return labelToFeature.get(value);
  const normalized = value.toLowerCase();
  return SUBSCRIPTION_FEATURES.find((item) => item.label.toLowerCase() === normalized || item.key.toLowerCase() === normalized) || null;
}

/** Keep a subscription plan only while its recorded billing period is current. */
export function isSubscriptionPeriodCurrent(subscription, now = Date.now()) {
  if (!subscription?.currentPeriodEnd) return true;
  const end = new Date(subscription.currentPeriodEnd).getTime();
  return Number.isFinite(end) && end > Number(now);
}

export async function getActivePlanForUser(userId) {
  const subscription = await UserSubscription.findOne({
    user: userId,
    status: { $in: ["trialing", "active", "past_due"] }
  }).populate("plan").lean();

  if (subscription?.plan && isSubscriptionPeriodCurrent(subscription)) {
    return subscription.plan;
  }

  return SubscriptionPlan.findOne({
    isActive: true,
    $or: [{ slug: "free" }, { price: 0 }]
  }).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

export async function getEntitlement(userId, feature) {
  const definition = resolveFeature(feature);
  if (!definition) return { allowed: false, feature: null, plan: null, limits: {} };

  const override = await UserFeatureOverride.findOne({
    user: userId,
    featureKey: definition.key,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  }).lean();
  const plan = await getActivePlanForUser(userId);
  if (override) {
    return {
      allowed: override.allowed,
      feature: definition,
      plan: plan || null,
      limits: plan?.limits || {},
      override: {
        allowed: override.allowed,
        expiresAt: override.expiresAt || null,
        reason: override.reason
      }
    };
  }
  if (!plan) return { allowed: false, feature: definition, plan: null, limits: {} };

  const features = normalizeSubscriptionFeatures(plan.features || []);
  return {
    allowed: features.includes(definition.label),
    feature: definition,
    plan,
    limits: plan.limits || {},
    override: null
  };
}

export function isCourseAccessAllowed({ isPaidCourse, planEntitled, hasIndividualAccess }) {
  // A subscription entitlement must never override the payment requirement
  // for individually priced courses, including after a refund.
  if (isPaidCourse) return Boolean(hasIndividualAccess);
  return Boolean(planEntitled || hasIndividualAccess);
}

export async function canAccessCourse(userId, courseId) {
  const enrollment = await Enrollment.findOne({
    user: userId,
    course: courseId,
    status: { $in: ["active", "completed"] },
    revokedBy: null
  }).select("accessSource").lean();

  const courseFilter = {
    _id: courseId,
    deletedAt: null,
    status: { $ne: "archived" }
  };
  if (!enrollment) {
    courseFilter.$or = [
      { isPublished: true },
      { visibility: "private", createdForUser: userId }
    ];
  }

  const course = await Course.findOne(courseFilter)
    .select("pricing.mode visibility createdForUser isPublished generation.mode aiReviewStatus aiReviewSource aiReviewedBy")
    .lean();
  if (!course) return false;

  const generated = ["normal", "ai", "module", "discovery"].includes(course.generation?.mode);
  const explicitlyBlocked = ["pending", "rejected"].includes(course.aiReviewStatus);
  const approvedGenerated = course.aiReviewStatus === "approved" &&
    (Boolean(course.aiReviewedBy) || course.aiReviewSource === "automatic");

  if (course.visibility === "private") {
    return Boolean(
      enrollment &&
      String(course.createdForUser || "") === String(userId) &&
      course.aiReviewStatus === "approved" &&
      (!generated || approvedGenerated)
    );
  }

  if (explicitlyBlocked) return false;

  // A previously granted enrollment remains useful if a public course is
  // later unlisted. New learners still need publication and approval below.
  if (generated && !approvedGenerated && !enrollment) return false;

  if (course.pricing?.mode === "paid") {
    return await hasPaidCourseAccess(userId, courseId);
  }
  if (enrollment) return true;
  if (!course.isPublished) return false;

  const entitlement = await getEntitlement(userId, "published_courses");
  return Boolean(entitlement.allowed);
}

export function readPlanLimit(plan, key, fallback = -1) {
  const raw = plan?.limits;
  let value;
  if (raw && typeof raw.get === "function") value = raw.get(key);
  else if (raw && typeof raw === "object") value = raw[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Returns true only when the learner has a verified paid-course enrollment. */
export async function hasPaidCourseAccess(userId, courseId) {
  const enrollment = await Enrollment.findOne({
    user: userId,
    course: courseId,
    status: { $in: ["active", "completed"] },
    revokedBy: null
  }).select("accessSource").lean();
  if (!enrollment) return false;
  // Admin grants are explicit per-user exceptions for either free or paid courses.
  if (enrollment.accessSource === "admin") {
    return Boolean(await Course.exists({ _id: courseId, deletedAt: null, status: { $ne: "archived" } }));
  }
  if (enrollment.accessSource === "subscription") {
    const entitlement = await getEntitlement(userId, "published_courses");
    if (!entitlement.allowed) return false;
    return Boolean(await Course.exists({
      _id: courseId,
      deletedAt: null,
      status: { $ne: "archived" },
      "pricing.mode": "paid"
    }));
  }
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    status: { $ne: "archived" },
    "pricing.mode": "paid"
  }).select("_id").lean();
  if (!course) return false;
  const payment = await Payment.exists({
    user: userId,
    course: courseId,
    provider: "razorpay",
    status: { $in: ["paid", "partially_refunded"] }
  });
  return Boolean(payment);
}

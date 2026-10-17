import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Payment } from "../models/Payment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
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

export async function getActivePlanForUser(userId) {
  const subscription = await UserSubscription.findOne({
    user: userId,
    status: { $in: ["trialing", "active", "past_due"] }
  }).populate("plan").lean();

  if (subscription?.plan) {
    const end = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    if (!end || end.getTime() > Date.now()) return subscription.plan;
  }

  return SubscriptionPlan.findOne({
    isActive: true,
    $or: [{ slug: "free" }, { price: 0 }]
  }).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

export async function getEntitlement(userId, feature) {
  const definition = resolveFeature(feature);
  if (!definition) return { allowed: false, feature: null, plan: null, limits: {} };

  const plan = await getActivePlanForUser(userId);
  if (!plan) return { allowed: false, feature: definition, plan: null, limits: {} };

  const features = normalizeSubscriptionFeatures(plan.features || []);
  return {
    allowed: features.includes(definition.label),
    feature: definition,
    plan,
    limits: plan.limits || {}
  };
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
    status: { $in: ["active", "completed"] }
  }).select("accessSource").lean();
  if (!enrollment) return false;
  // Admin grants are explicit per-user exceptions for either free or paid courses.
  if (enrollment.accessSource === "admin") {
    return Boolean(await Course.exists({ _id: courseId, isPublished: true }));
  }
  const course = await Course.findOne({ _id: courseId, isPublished: true, "pricing.mode": "paid" }).select("_id").lean();
  if (!course) return false;
  const payment = await Payment.exists({
    user: userId,
    course: courseId,
    provider: "razorpay",
    status: { $in: ["paid", "partially_refunded"] }
  });
  return Boolean(payment);
}

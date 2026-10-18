import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { Payment } from "../models/Payment.js";
import { Course } from "../models/Course.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { isValidObjectId } from "../utils/ids.js";
import { escapeRegex } from "../utils/escapeRegex.js";

const MAX_SELECTED_USERS = 500;
const MAX_FILTERED_RECIPIENTS = 5000;
const SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "cancelled", "expired"]);
const AUTH_PROVIDERS = new Set(["local", "google", "local_google"]);
const PLAN_SEGMENTS = new Set(["popular", "paid", "free", "premium"]);
const COURSE_SEGMENTS = new Set(["popular", "paid", "free", "featured"]);

export function parseAdminAudienceDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) {
    throw new Error(`Invalid ${field} date`);
  }
  // Date-picker "before" values are inclusive of the entire selected UTC calendar day.
  if (dateOnly && field === "registeredBefore") date.setUTCHours(23, 59, 59, 999);
  return date;
}

function normalizeFilters(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("filters must be an object");
  const filters = {};
  if (input.q !== undefined) {
    const q = String(input.q).trim().slice(0, 100);
    if (q) filters.q = q;
  }
  if (input.status !== undefined && input.status !== "" && !["active", "disabled"].includes(input.status)) throw new Error("Invalid account status filter");
  if (["active", "disabled"].includes(input.status)) filters.status = input.status;
  if (input.role !== undefined && input.role !== "" && !["user", "admin"].includes(input.role)) throw new Error("Invalid account role filter");
  if (["user", "admin"].includes(input.role)) filters.role = input.role;
  if (input.emailVerified !== undefined && input.emailVerified !== "" && typeof input.emailVerified !== "boolean") throw new Error("emailVerified must be a boolean");
  if (typeof input.emailVerified === "boolean") filters.emailVerified = input.emailVerified;
  if (input.authProvider !== undefined) {
    if (!AUTH_PROVIDERS.has(input.authProvider)) throw new Error("Invalid authProvider filter");
    filters.authProvider = input.authProvider;
  }
  if (input.subscriptionStatus !== undefined) {
    if (!SUBSCRIPTION_STATUSES.has(input.subscriptionStatus)) throw new Error("Invalid subscriptionStatus filter");
    filters.subscriptionStatus = input.subscriptionStatus;
  }
  if (input.planId !== undefined && input.planId !== "") {
    if (!isValidObjectId(String(input.planId))) throw new Error("Invalid planId filter");
    filters.planId = String(input.planId);
  }
  if (input.expiresWithinDays !== undefined && input.expiresWithinDays !== "") {
    const days = Number(input.expiresWithinDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("expiresWithinDays must be an integer between 1 and 365");
    filters.expiresWithinDays = days;
  }
  if (input.courseId !== undefined && input.courseId !== "") {
    if (!isValidObjectId(String(input.courseId))) throw new Error("Invalid courseId filter");
    filters.courseId = String(input.courseId);
  }
  if (input.enrollmentStatus !== undefined && input.enrollmentStatus !== "") {
    if (!["active", "completed", "cancelled"].includes(input.enrollmentStatus)) throw new Error("Invalid enrollmentStatus filter");
    filters.enrollmentStatus = input.enrollmentStatus;
  }
  if (input.progressMin !== undefined && input.progressMin !== "") {
    const n = Number(input.progressMin);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("progressMin must be between 0 and 100");
    filters.progressMin = n;
  }
  if (input.inactiveDays !== undefined && input.inactiveDays !== "") {
    const days = Number(input.inactiveDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("inactiveDays must be an integer between 1 and 365");
    filters.inactiveDays = days;
  }
  if (input.totalSpendMin !== undefined && input.totalSpendMin !== "") {
    const amount = Number(input.totalSpendMin);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new Error("totalSpendMin must be between 0 and 100,000,000");
    filters.totalSpendMin = amount;
  }
  if (input.courseCountMin !== undefined && input.courseCountMin !== "") {
    const count = Number(input.courseCountMin);
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("courseCountMin must be an integer between 1 and 1,000");
    filters.courseCountMin = count;
  }
  if (input.planSegment !== undefined && input.planSegment !== "") {
    if (!PLAN_SEGMENTS.has(input.planSegment)) throw new Error("Invalid plan segment");
    filters.planSegment = input.planSegment;
  }
  if (input.courseSegment !== undefined && input.courseSegment !== "") {
    if (!COURSE_SEGMENTS.has(input.courseSegment)) throw new Error("Invalid course segment");
    filters.courseSegment = input.courseSegment;
  }
  if (input.progressMax !== undefined && input.progressMax !== "") {
    const n = Number(input.progressMax);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("progressMax must be between 0 and 100");
    filters.progressMax = n;
  }
  if (filters.progressMin !== undefined && filters.progressMax !== undefined && filters.progressMin > filters.progressMax) {
    throw new Error("progressMin cannot exceed progressMax");
  }
  filters.registeredAfter = parseAdminAudienceDate(input.registeredAfter, "registeredAfter");
  filters.registeredBefore = parseAdminAudienceDate(input.registeredBefore, "registeredBefore");
  if (filters.registeredAfter && filters.registeredBefore && filters.registeredAfter > filters.registeredBefore) {
    throw new Error("registeredAfter cannot be later than registeredBefore");
  }
  return filters;
}

export async function resolveAdminAudience({ audience = "all", userIds, emails, filters } = {}, { select = "_id email name", limit = MAX_FILTERED_RECIPIENTS } = {}) {
  const hasSelectedIds = Array.isArray(userIds) && userIds.length > 0;
  const selectedEmails = Array.isArray(emails) ? emails : [];
  const hasSelectedEmails = selectedEmails.length > 0;
  const hasFilters = filters && typeof filters === "object" && Object.keys(filters).length > 0;
  if ([hasSelectedIds, hasSelectedEmails, hasFilters].filter(Boolean).length > 1) throw new Error("Choose selected users, selected emails, or filters—not multiple targeting modes");
  if (hasSelectedIds) {
    if (userIds.length > MAX_SELECTED_USERS) throw new Error(`Select at most ${MAX_SELECTED_USERS} users at a time`);
    if (userIds.some((id) => !isValidObjectId(String(id)))) throw new Error("One or more selected user IDs are invalid");
    const uniqueIds = [...new Set(userIds.map(String))];
    return User.find({ _id: { $in: uniqueIds } }).select(select).limit(MAX_SELECTED_USERS).lean();
  }
  if (hasSelectedEmails) {
    if (selectedEmails.length > MAX_SELECTED_USERS) throw new Error(`Select at most ${MAX_SELECTED_USERS} users at a time`);
    const normalizedEmails = [...new Set(selectedEmails.map((email) => String(email).trim().toLowerCase()))];
    if (normalizedEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("One or more selected email addresses are invalid");
    return User.find({ email: { $in: normalizedEmails } }).select(select).limit(MAX_SELECTED_USERS).lean();
  }

  const normalized = normalizeFilters(filters || {});
  const query = {};
  if (audience === "active") query.isActive = true;
  else if (audience === "subscribers") {
    const activeSubscriptions = await UserSubscription.find({ status: { $in: ["trialing", "active"] } }).select("user").lean();
    query._id = { $in: activeSubscriptions.map((sub) => sub.user) };
  } else if (audience !== "all") throw new Error("Invalid audience. Choose all, active, or subscribers");

  if (normalized.status) {
    const requestedActive = normalized.status === "active";
    if (audience === "active" && !requestedActive) query._id = { $in: [] };
    else query.isActive = requestedActive;
  }
  if (normalized.role) query.role = normalized.role;
  if (normalized.emailVerified !== undefined) query.emailVerified = normalized.emailVerified;
  if (normalized.authProvider) query.authProvider = normalized.authProvider;
  if (normalized.q) {
    const pattern = new RegExp(escapeRegex(normalized.q), "i");
    query.$or = [{ name: pattern }, { email: pattern }];
  }
  if (normalized.registeredAfter || normalized.registeredBefore) {
    query.createdAt = {};
    if (normalized.registeredAfter) query.createdAt.$gte = normalized.registeredAfter;
    if (normalized.registeredBefore) query.createdAt.$lte = normalized.registeredBefore;
  }

  const subscriptionFilters = {};
  if (normalized.subscriptionStatus) subscriptionFilters.status = normalized.subscriptionStatus;
  else if (normalized.planSegment || normalized.expiresWithinDays) subscriptionFilters.status = { $in: ["trialing", "active"] };
  if (normalized.planId) subscriptionFilters.plan = new mongoose.Types.ObjectId(normalized.planId);
  if (normalized.expiresWithinDays) {
    subscriptionFilters.currentPeriodEnd = {
      $gte: new Date(),
      $lte: new Date(Date.now() + normalized.expiresWithinDays * 24 * 60 * 60 * 1000)
    };
  }
  if (normalized.planSegment) {
    const activePlans = await SubscriptionPlan.find({ isActive: true }).select("_id price isPopular").lean();
    let matchingPlanIds = [];
    if (normalized.planSegment === "popular") matchingPlanIds = activePlans.filter((plan) => plan.isPopular).map((plan) => plan._id);
    if (normalized.planSegment === "paid") matchingPlanIds = activePlans.filter((plan) => Number(plan.price) > 0).map((plan) => plan._id);
    if (normalized.planSegment === "free") matchingPlanIds = activePlans.filter((plan) => Number(plan.price) === 0).map((plan) => plan._id);
    if (normalized.planSegment === "premium") {
      const highestPrice = activePlans.reduce((highest, plan) => Math.max(highest, Number(plan.price) || 0), 0);
      matchingPlanIds = activePlans.filter((plan) => Number(plan.price) === highestPrice && highestPrice > 0).map((plan) => plan._id);
    }
    const matchingPlanIdSet = new Set(matchingPlanIds.map(String));
    if (normalized.planId) matchingPlanIdSet.delete(String(normalized.planId));
    subscriptionFilters.plan = { $in: normalized.planId ? matchingPlanIds.filter((id) => String(id) === String(normalized.planId)) : [...matchingPlanIdSet] };
  }
  if (Object.keys(subscriptionFilters).length) {
    const subscriptions = await UserSubscription.find(subscriptionFilters).select("user").lean();
    const subscriptionUserIds = subscriptions.map((item) => item.user);
    query._id = query._id ? { $in: subscriptionUserIds.filter((id) => query._id.$in.some((baseId) => String(baseId) === String(id))) } : { $in: subscriptionUserIds };
  }

  let segmentCourseIds = null;
  if (normalized.courseSegment) {
    if (normalized.courseSegment === "paid") {
      segmentCourseIds = await Course.find({ "pricing.mode": "paid" }).distinct("_id");
    } else if (normalized.courseSegment === "free") {
      segmentCourseIds = await Course.find({ "pricing.mode": "free" }).distinct("_id");
    } else if (normalized.courseSegment === "featured") {
      segmentCourseIds = await Course.find({ featured: true }).distinct("_id");
    } else if (normalized.courseSegment === "popular") {
      const topCourses = await Enrollment.aggregate([
        { $match: { status: { $in: ["active", "completed"] } } },
        { $group: { _id: "$course", enrollments: { $sum: 1 } } },
        { $sort: { enrollments: -1, _id: 1 } },
        { $limit: 5 }
      ]);
      segmentCourseIds = topCourses.map((item) => item._id);
    }
  }
  if (normalized.courseId || normalized.enrollmentStatus || segmentCourseIds) {
    const enrollmentQuery = {};
    if (normalized.courseId && segmentCourseIds) enrollmentQuery.course = { $in: segmentCourseIds.filter((id) => String(id) === String(normalized.courseId)) };
    else if (normalized.courseId) enrollmentQuery.course = new mongoose.Types.ObjectId(normalized.courseId);
    else if (segmentCourseIds) enrollmentQuery.course = { $in: segmentCourseIds };
    if (normalized.enrollmentStatus) enrollmentQuery.status = normalized.enrollmentStatus;
    else enrollmentQuery.status = { $in: ["active", "completed"] };
    const enrollments = await Enrollment.find(enrollmentQuery).select("user").lean();
    const enrollmentUserIds = enrollments.map((item) => item.user);
    query._id = query._id ? { $in: enrollmentUserIds.filter((id) => query._id.$in.some((baseId) => String(baseId) === String(id))) } : { $in: enrollmentUserIds };
  }

  if (normalized.courseCountMin !== undefined) {
    const courseCounts = await Enrollment.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      // Count distinct courses per learner even if legacy data contains duplicate enrollment rows.
      { $group: { _id: { user: "$user", course: "$course" } } },
      { $group: { _id: "$_id.user", courseCount: { $sum: 1 } } },
      { $match: { courseCount: { $gte: normalized.courseCountMin } } },
      { $project: { _id: 1 } }
    ]);
    const eligibleUserIds = courseCounts.map((item) => item._id);
    query._id = query._id ? { $in: eligibleUserIds.filter((id) => query._id.$in.some((baseId) => String(baseId) === String(id))) } : { $in: eligibleUserIds };
  }

  if (normalized.totalSpendMin !== undefined) {
    const spenders = await Payment.aggregate([
      { $match: { status: { $in: ["paid", "partially_refunded"] }, currency: "INR" } },
      {
        $lookup: {
          from: "refund_requests",
          let: { paymentId: "$_id" },
          pipeline: [
            { $match: { status: "processed", $expr: { $eq: ["$payment", "$paymentId"] } } },
            { $group: { _id: null, totalRefunded: { $sum: "$amount" } } }
          ],
          as: "processedRefundSummary"
        }
      },
      {
        $addFields: {
          netSpend: {
            $max: [
              {
                $subtract: [
                  "$amount",
                  { $ifNull: [{ $arrayElemAt: ["$processedRefundSummary.totalRefunded", 0] }, 0] }
                ]
              },
              0
            ]
          }
        }
      },
      { $group: { _id: "$user", totalSpend: { $sum: "$netSpend" } } },
      { $match: { totalSpend: { $gte: normalized.totalSpendMin } } },
      { $project: { _id: 1 } }
    ]);
    const eligibleUserIds = spenders.map((item) => item._id);
    query._id = query._id ? { $in: eligibleUserIds.filter((id) => query._id.$in.some((baseId) => String(baseId) === String(id))) } : { $in: eligibleUserIds };
  }

  if (normalized.inactiveDays) {
    const cutoff = new Date(Date.now() - normalized.inactiveDays * 24 * 60 * 60 * 1000);
    const recentlyActive = await Progress.distinct("user", { lastAccessedAt: { $gte: cutoff } });
    query.$and = [...(query.$and || []), { _id: { $nin: recentlyActive } }];
  }

  if (normalized.progressMin !== undefined || normalized.progressMax !== undefined) {
    const progressQuery = {};
    if (normalized.progressMin !== undefined || normalized.progressMax !== undefined) {
      progressQuery.percentage = {};
      if (normalized.progressMin !== undefined) progressQuery.percentage.$gte = normalized.progressMin;
      if (normalized.progressMax !== undefined) progressQuery.percentage.$lte = normalized.progressMax;
    }
    const progressRecords = await Progress.find(progressQuery).select("user").lean();
    const progressUserIds = progressRecords.map((item) => item.user);
    query._id = query._id ? { $in: progressUserIds.filter((id) => query._id.$in.some((baseId) => String(baseId) === String(id))) } : { $in: progressUserIds };
  }

  return User.find(query).select(select).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(limit) || MAX_FILTERED_RECIPIENTS, 1), MAX_FILTERED_RECIPIENTS + 1)).lean();
}

export function validateAdminAudienceInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Audience input must be an object");
  const hasUserIdsField = Object.prototype.hasOwnProperty.call(input, "userIds");
  const hasEmailsField = Object.prototype.hasOwnProperty.call(input, "emails");
  const hasFiltersField = Object.prototype.hasOwnProperty.call(input, "filters");
  if (hasUserIdsField && (!Array.isArray(input.userIds) || input.userIds.length === 0)) throw new Error("Selected user targeting requires at least one user ID");
  if (hasEmailsField && (!Array.isArray(input.emails) || input.emails.length === 0)) throw new Error("Selected email targeting requires at least one email address");
  if (hasFiltersField && (!input.filters || typeof input.filters !== "object" || Array.isArray(input.filters) || Object.keys(input.filters).length === 0)) {
    throw new Error("Provide at least one valid audience filter");
  }
  if (Array.isArray(input.userIds) && input.userIds.length > MAX_SELECTED_USERS) throw new Error(`Select at most ${MAX_SELECTED_USERS} users at a time`);
  if (Array.isArray(input.userIds) && input.userIds.some((id) => !isValidObjectId(String(id)))) throw new Error("One or more selected user IDs are invalid");
  if (Array.isArray(input.emails) && input.emails.length > MAX_SELECTED_USERS) throw new Error(`Select at most ${MAX_SELECTED_USERS} users at a time`);
  if (Array.isArray(input.emails) && input.emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))) throw new Error("One or more selected email addresses are invalid");
  const normalizedFilters = normalizeFilters(input.filters || {});
  const hasRawFilters = input.filters && Object.keys(input.filters).length > 0;
  const hasEffectiveFilters = Object.values(normalizedFilters).some((value) => value !== null && value !== undefined && value !== "");
  if (hasRawFilters && !hasEffectiveFilters) throw new Error("Provide at least one valid audience filter");
  const hasIds = Array.isArray(input.userIds) && input.userIds.length > 0;
  const hasEmails = Array.isArray(input.emails) && input.emails.length > 0;
  const hasFilters = input.filters && Object.keys(input.filters).length > 0;
  if ([hasIds, hasEmails, Boolean(hasFilters)].filter(Boolean).length > 1) throw new Error("Choose selected users, selected emails, or filters—not multiple targeting modes");
  return true;
}


function stableAudienceStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableAudienceStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableAudienceStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function audienceTargetFingerprint(input = {}) {
  const targeting = {
    audience: input.audience || "all",
    userIds: input.userIds ?? null,
    emails: input.emails ?? null,
    filters: input.filters ?? null
  };
  return crypto.createHash("sha256").update(stableAudienceStringify(targeting)).digest("hex");
}

function audienceRecipientFingerprint(users = []) {
  const ids = users.map((user) => String(user._id)).sort();
  return crypto.createHash("sha256").update(ids.join("\\n")).digest("hex");
}

export function createAdminAudiencePreviewToken(input, users) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Audience preview signing is not configured");
  const payload = {
    target: audienceTargetFingerprint(input),
    recipients: audienceRecipientFingerprint(users),
    exp: Date.now() + 10 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAdminAudiencePreviewToken(token, input, users) {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = crypto.createHmac("sha256", secret).update(encoded).digest();
  let actualSignature;
  try { actualSignature = Buffer.from(suppliedSignature, "base64url"); } catch { return false; }
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return false; }
  if (!payload || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return false;
  return payload.target === audienceTargetFingerprint(input) && payload.recipients === audienceRecipientFingerprint(users);
}

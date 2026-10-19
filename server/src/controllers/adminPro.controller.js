import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import nodemailer from "nodemailer";
import { User } from "../models/User.js";
import { UserFeatureOverride } from "../models/UserFeatureOverride.js";
import { Course } from "../models/Course.js";
import { CourseRevision } from "../models/CourseRevision.js";
import { Review } from "../models/Review.js";
import { QuizBank } from "../models/QuizBank.js";
import { AILessonInsight } from "../models/AILessonInsight.js";
import { AIQuestionAnswer } from "../models/AIQuestionAnswer.js";
import { LearningRoadmap } from "../models/LearningRoadmap.js";
import { Enrollment } from "../models/Enrollment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { PaymentIssue } from "../models/PaymentIssue.js";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { AuditLog } from "../models/AuditLog.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { getRemainingRefundableAmount, matchesProviderRefund, classifyProviderRefundStatus, paymentStatusForRemainingBalance } from "../services/refundBalance.service.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { validateTypedSetting } from "../utils/typedSettingsRegistry.js";
import { Coupon } from "../models/Coupon.js";
import { Progress } from "../models/Progress.js";
import { env } from "../config/env.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import * as razorpay from "../services/razorpay.service.js";
import { cacheDelete } from "../config/cache.js";
import { getPlaylistCourse } from "../services/discovery.service.js";
import { SUBSCRIPTION_FEATURES, normalizeSubscriptionFeatures } from "../config/subscriptionFeatures.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { sanitizeAuditSnapshot } from "../utils/auditSanitizer.js";
import { evaluateCourseReadiness } from "../utils/courseReadiness.js";
import { getCoursePublishBlock } from "../utils/coursePublishing.js";
import { validateCourseAdminPatch } from "../utils/courseAdminValidation.js";
import { validateNewLessonInput } from "../utils/courseLessonValidation.js";
import { validateCouponAdminInput } from "../utils/couponAdminValidation.js";
import { validateSubscriptionPlanAdminInput } from "../utils/subscriptionPlanAdminValidation.js";
import { createNotificationEvent, retryNotificationDelivery } from "../services/notification.service.js";
import { hasUnsafeEmailMarkup } from "../utils/safeHtml.js";
import { parseAnnouncementChannels } from "../utils/announcementChannels.js";
import { getAdminPermissions, hasAdminPermission } from "../utils/adminRbac.js";
import { GROSS_COLLECTION_PAYMENT_STATUSES, calculateNetRevenue } from "../services/billingMetrics.service.js";
import { resolveAdminAudience, validateAdminAudienceInput, createAdminAudiencePreviewToken, verifyAdminAudiencePreviewToken } from "../services/adminAudience.service.js";

async function audit(req, action, targetType, targetId = "", before = null, after = null, reason = "") {
  // Centralize redaction and durable fallback for every admin-pro mutation.
  // The business mutation has already committed at most call sites, so audit
  // storage failure must not turn a successful mutation into a misleading 500.
  const safeReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  const actor = req.user?.user?._id || req.user?.userId;
  if (!actor) {
    console.error("[admin-audit] Missing actor identity; audit event was not submitted.");
    return { recorded: false, queued: false };
  }
  return recordAuditEvent({
    actor,
    action: String(action || "").slice(0, 160),
    targetType: String(targetType || "").slice(0, 120),
    targetId: String(targetId || "").slice(0, 200),
    before: sanitizeAuditSnapshot(before),
    after: sanitizeAuditSnapshot(after),
    reason: safeReason,
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}

function mailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;
  return nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure, auth: { user: env.smtpUser, pass: env.smtpPass } });
}

async function audienceUsers(audience) {
  if (audience === "active") return User.find({ isActive: true }).select("_id email name");
  if (audience === "subscribers") {
    const subs = await UserSubscription.find({ status: { $in: ["trialing", "active"] } }).select("user");
    return User.find({ _id: { $in: subs.map(s => s.user) } }).select("_id email name");
  }
  return User.find({}).select("_id email name");
}

async function mapWithConcurrency(items, worker, batchSize = 50) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...await Promise.all(batch.map(worker)));
  }
  return results;
}

async function notificationAudienceUsers(audience) {
  if (audience === "active") return User.find({ isActive: true }).select("_id");
  if (audience === "subscribers") {
    const subs = await UserSubscription.find({ status: { $in: ["trialing", "active"] } }).select("user");
    // Subscription audiences include inactive accounts too: account activity must not suppress admin communications.
    return User.find({ _id: { $in: subs.map(s => s.user) } }).select("_id");
  }
  return User.find({}).select("_id");
}

export async function overview(req, res, next) {
  try {
    const [users, activeUsers, admins, courses, published, unpublished, emptyCourses, enrollments, activeSubscribers, pastDueSubscribers, grossRevenue, processedRefunds, failedPayments, pendingRefunds, unread] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: "admin" }),
      Course.countDocuments(),
      Course.countDocuments({ isPublished: true }),
      Course.countDocuments({ isPublished: false }),
      Course.countDocuments({ "modules.0": { $exists: false } }),
      Enrollment.countDocuments(),
      UserSubscription.countDocuments({ status: { $in: ["trialing", "active"] } }),
      UserSubscription.countDocuments({ status: "past_due" }),
      Payment.aggregate([{ $match: { status: { $in: GROSS_COLLECTION_PAYMENT_STATUSES } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      RefundRequest.aggregate([{ $match: { status: "processed" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Payment.countDocuments({ status: "failed" }),
      RefundRequest.countDocuments({ status: "pending" }),
      Notification.countDocuments({ readAt: null })
    ]);

    const [recentUsers, recentPayments, recentAudit, topCourses] = await Promise.all([
      User.find().select("name email role isActive authProvider emailVerified createdAt").sort({ createdAt: -1 }).limit(8).lean(),
      Payment.find().populate("user", "name email").populate("course", "title").populate("plan", "name").sort({ createdAt: -1 }).limit(8).lean(),
      AuditLog.find().populate("actor", "name email").sort({ createdAt: -1 }).limit(8).lean(),
      Enrollment.aggregate([
        { $group: { _id: "$course", enrollments: { $sum: 1 } } },
        { $sort: { enrollments: -1 } },
        { $limit: 5 },
        { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, enrollments: 1, title: "$course.title" } }
      ])
    ]);

    const permissions = new Set(getAdminPermissions(req.user?.adminRole || "platform_admin", req.user?.adminPermissionOverrides || []));
    const canUsers = permissions.has("users.read");
    const canCourses = permissions.has("courses.read");
    const canBilling = permissions.has("billing.read");
    const canRefunds = permissions.has("refunds.manage");
    const canAudit = permissions.has("audit.read");
    const canRoles = permissions.has("admin_roles.manage");
    const canOperations = permissions.has("operations.read");
    const stats = {};
    if (canUsers) Object.assign(stats, { users, activeUsers });
    if (canRoles) Object.assign(stats, { admins });
    if (canCourses) Object.assign(stats, { courses, published, unpublished, emptyCourses, enrollments });
    if (canBilling) {
      const grossRevenueTotal = Number(grossRevenue[0]?.total || 0);
      const processedRefundsTotal = Number(processedRefunds[0]?.total || 0);
      const netRevenue = calculateNetRevenue(grossRevenueTotal, processedRefundsTotal);
      Object.assign(stats, {
        activeSubscribers,
        pastDueSubscribers,
        grossRevenue: grossRevenueTotal,
        processedRefunds: processedRefundsTotal,
        netRevenue,
        // Keep the legacy field so existing dashboard clients remain compatible.
        revenue: netRevenue,
        failedPayments
      });
    }
    if (canRefunds) Object.assign(stats, { pendingRefunds });
    if (canOperations) Object.assign(stats, { unread });

    return success(res, {
      stats,
      recentUsers: canUsers ? recentUsers : [],
      recentPayments: canBilling ? recentPayments : [],
      recentAudit: canAudit ? recentAudit : [],
      topCourses: canCourses ? topCourses : [],
    });
  } catch (e) { next(e); }
}

export async function exportUsers(req, res, next) {
  try {
    const ids = String(req.query.ids || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!ids.length || ids.length > 100) return failure(res, "Select between 1 and 100 users to export.", 400);
    if (ids.some((id) => !isValidObjectId(id))) return failure(res, "One or more selected user IDs are invalid.", 400);

    const filter = { _id: { $in: ids } };
    const sortFields = {
      createdAt: "createdAt",
      name: "name",
      email: "email",
      role: "role",
      status: "isActive",
      verification: "emailVerified",
      authProvider: "authProvider",
    };
    const requestedSort = String(req.query.sortBy || "name");
    const sortField = Object.hasOwn(sortFields, requestedSort) ? sortFields[requestedSort] : "name";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const users = await User.find(filter)
      .select("_id name email role isActive emailVerified authProvider createdAt")
      .sort({ [sortField]: sortOrder, _id: -1 })
      .limit(100)
      .lean();

    await audit(req, "admin.users.exported", "User", "", null, {
      count: users.length,
      selectedCount: ids.length,
      fields: ["name", "email", "role", "isActive", "emailVerified", "authProvider", "createdAt"],
    }, "Administrator exported selected user records");

    return success(res, { users, count: users.length });
  } catch (error) {
    next(error);
  }
}

const piiRevealSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

function maskEmail(email) {
  const value = String(email || "");
  const separator = value.indexOf("@");
  if (separator <= 0 || separator === value.length - 1) return value ? value[0] + "***" : "";
  return value[0] + "***@" + value.slice(separator + 1);
}

export async function users(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const q = String(req.query.q || "").trim().slice(0, 100);
    const filter = {};
    if (q) {
      const searchPattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: searchPattern }, { email: searchPattern }];
    }
    if (req.query.status === "active") filter.isActive = true;
    if (req.query.status === "disabled") filter.isActive = false;
    if (req.query.role === "admin" || req.query.role === "user") filter.role = req.query.role;
    if (["local", "google", "local_google"].includes(String(req.query.authProvider || ""))) {
      filter.authProvider = req.query.authProvider;
    }
    const sortFields = {
      createdAt: "createdAt",
      name: "name",
      email: "email",
      role: "role",
      status: "isActive",
      verification: "emailVerified",
      authProvider: "authProvider",
    };
    const requestedSort = String(req.query.sortBy || "createdAt");
    const sortField = Object.hasOwn(sortFields, requestedSort) ? sortFields[requestedSort] : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sort = { [sortField]: sortOrder, _id: -1 };
    const [items, total] = await Promise.all([
      User.find(filter).select("-password").sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    const safeUsers = items.map(({ email, ...user }) => ({ ...user, emailMasked: maskEmail(email) }));
    return success(res, { users: safeUsers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
}

export async function userFeatureOverrides(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    const user = await User.findById(userId).select("_id role name email").lean();
    if (!user) return failure(res, "User not found", 404);
    const overrides = await UserFeatureOverride.find({ user: userId }).sort({ featureKey: 1 }).lean();
    const features = SUBSCRIPTION_FEATURES.map((feature) => ({
      ...feature,
      override: overrides.find((item) => item.featureKey === feature.key) || null
    }));
    return success(res, { user: { id: String(user._id), name: user.name }, features });
  } catch (error) { next(error); }
}

export async function upsertUserFeatureOverride(req, res, next) {
  try {
    const { userId, featureKey } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    const feature = SUBSCRIPTION_FEATURES.find((item) => item.key === featureKey);
    if (!feature) return failure(res, "Unknown subscription feature.", 400);
    if (typeof req.body?.allowed !== "boolean") return failure(res, "allowed must be a boolean.", 400);
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failure(res, "A reason is required for audit.", 400);
    if (reason.length > 500) return failure(res, "Reason must be 500 characters or fewer.", 400);
    const user = await User.findById(userId).select("_id role");
    if (!user) return failure(res, "User not found", 404);
    if (user.role === "admin") return failure(res, "Feature overrides are only available for learner accounts.", 403);

    let expiresAt = null;
    if (req.body?.expiresAt !== undefined && req.body.expiresAt !== null && String(req.body.expiresAt).trim() !== "") {
      expiresAt = new Date(req.body.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return failure(res, "expiresAt must be a valid future date, or null for no expiry.", 400);
      }
    }
    const existing = await UserFeatureOverride.findOne({ user: userId, featureKey }).lean();
    const before = existing ? {
      allowed: existing.allowed,
      expiresAt: existing.expiresAt || null,
      reason: existing.reason
    } : null;
    const actor = req.user?.user?._id || req.user?.userId;
    const override = await UserFeatureOverride.findOneAndUpdate(
      { user: userId, featureKey },
      {
        $set: { allowed: req.body.allowed, expiresAt, reason, updatedBy: actor },
        $setOnInsert: { user: userId, featureKey, createdBy: actor }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    const auditResult = await audit(req, "user.feature_override.updated", "UserFeatureOverride", override._id, before, {
      userId: String(userId), featureKey, allowed: override.allowed, expiresAt: override.expiresAt || null
    }, reason);
    return success(res, {
      override: { ...override, feature: { key: feature.key, label: feature.label } },
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, "User feature override saved.");
  } catch (error) {
    if (error?.code === 11000) return failure(res, "This feature override changed concurrently. Refresh and try again.", 409);
    next(error);
  }
}

export async function deleteUserFeatureOverride(req, res, next) {
  try {
    const { userId, featureKey } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    if (!SUBSCRIPTION_FEATURES.some((item) => item.key === featureKey)) return failure(res, "Unknown subscription feature.", 400);
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failure(res, "A reason is required for audit.", 400);
    if (reason.length > 500) return failure(res, "Reason must be 500 characters or fewer.", 400);
    const existing = await UserFeatureOverride.findOne({ user: userId, featureKey });
    if (!existing) return failure(res, "No override exists for this feature.", 404);
    await existing.deleteOne();
    const auditResult = await audit(req, "user.feature_override.removed", "UserFeatureOverride", existing._id, {
      userId: String(userId), featureKey, allowed: existing.allowed, expiresAt: existing.expiresAt || null
    }, null, reason);
    return success(res, {
      removed: true,
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, "User feature override removed. The user's plan entitlement now applies.");
  } catch (error) { next(error); }
}

export async function userDetail(req, res, next) {
  try {
    if (!isValidObjectId(req.params.userId)) return failure(res, "Invalid userId", 400);
    const user = await User.findById(req.params.userId).select("-password").lean();
    if (!user) return failure(res, "User not found", 404);
    const [subscription, payments, enrollments, notifications] = await Promise.all([
      UserSubscription.findOne({ user: user._id }).populate("plan").lean(),
      Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Enrollment.find({ user: user._id }).populate("course", "title pricing").sort({ createdAt: -1 }).lean(),
      Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean()
    ]);
    const { email, ...safeUser } = user;
    return success(res, { user: { ...safeUser, emailMasked: maskEmail(email) }, subscription, payments, enrollments, notifications });
  } catch (e) { next(e); }
}


export async function revealUserPii(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) return failure(res, "Invalid userId", 400);
    const parsed = piiRevealSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return failure(res, "A reason between 10 and 500 characters is required to reveal personal information.", 400, parsed.error.flatten());
    }
    const reason = parsed.data.reason;
    const user = await User.findById(userId).select("_id email").lean();
    if (!user) return failure(res, "User not found", 404);

    const auditResult = await audit(req, "admin.users.pii_revealed", "User", user._id, null, {
      field: "email",
      revealed: true
    }, reason);
    if (!auditResult.recorded && !auditResult.queued) {
      return failure(res, "The reveal audit could not be recorded. Personal information was not disclosed; please retry.", 503);
    }
    return success(res, {
      email: user.email,
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, "Email revealed and access audited.");
  } catch (error) { next(error); }
}

export async function updateUser(req, res, next) {
  try {
    if (!isValidObjectId(req.params.userId)) return failure(res, "Invalid userId", 400);
    if (Object.hasOwn(req.body || {}, "role")) {
      return failure(res, "Top-level account roles cannot be changed through user management.", 403);
    }
    if (typeof req.body?.isActive !== "boolean") {
      return failure(res, "isActive must be a boolean.", 400);
    }
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return failure(res, "A reason is required for account status changes.", 400);
    if (reason.length > 500) return failure(res, "Reason must be 500 characters or fewer.", 400);
    if (String(req.params.userId) === String(req.user.userId)) {
      return failure(res, "Admin cannot deactivate the current account.", 400);
    }
    const user = await User.findById(req.params.userId);
    if (!user) return failure(res, "User not found", 404);
    if (user.role === "admin") {
      return failure(res, "Administrator accounts must be managed through the administrator access console.", 403);
    }
    const before = { isActive: user.isActive };
    user.isActive = req.body.isActive;
    await user.save();
    await audit(req, "user.updated", "User", user._id, before, { isActive: user.isActive }, reason);
    return success(res, { user: { id: String(user._id), name: user.name, emailMasked: maskEmail(user.email), isActive: user.isActive } }, "User updated");
  } catch (e) { next(e); }
}

export async function courses(req, res, next) {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const searchPattern = q ? new RegExp(escapeRegex(q), "i") : null;
    const filter = searchPattern ? { deletedAt: null, $or: [{ title: searchPattern }, { category: searchPattern }] } : { deletedAt: null };
    const courses = await Course.find(filter).select("title slug category level isPublished status deletedAt aiReviewStatus generation.mode pricing enrollmentEnabled certificateEnabled featured createdAt updatedAt").sort({ createdAt: -1 }).lean();
    return success(res, { courses });
  } catch (e) { next(e); }
}

function adminActorId(req) {
  return req.user?.user?._id || req.user?.userId || null;
}
function requireContentReason(req, res, label) {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    failure(res, "A reason of 10–500 characters is required for " + label + ".", 400);
    return null;
  }
  return reason;
}
function isAiGeneratedCourse(course) {
  return ["ai", "module", "discovery"].includes(course?.generation?.mode);
}

export async function courseRevisions(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const exists = await Course.exists({ _id: req.params.courseId });
    if (!exists) return failure(res, "Course not found", 404);
    const revisions = await CourseRevision.find({ course: req.params.courseId })
      .select("revisionNumber changedBy changeSource reason summary createdAt")
      .populate("changedBy", "name email").sort({ revisionNumber: -1 }).limit(100).lean();
    return success(res, { revisions });
  } catch (e) { next(e); }
}

export async function rollbackCourseRevision(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId) || !isValidObjectId(req.params.revisionId)) return failure(res, "Invalid course or revision ID", 400);
    const reason = requireContentReason(req, res, "course rollback");
    if (!reason) return;
    const [course, revision] = await Promise.all([
      Course.findById(req.params.courseId),
      CourseRevision.findOne({ _id: req.params.revisionId, course: req.params.courseId })
    ]);
    if (!course) return failure(res, "Course not found", 404);
    if (!revision) return failure(res, "Course revision not found", 404);
    const snapshot = revision.snapshot || {};
    const { _id, __v, createdAt, updatedAt, ...restorable } = snapshot;
    course.set(restorable);
    course.isPublished = false;
    course.status = "draft";
    course.deletedAt = null;
    course.$locals.revisionContext = { actor: adminActorId(req), source: "rollback", reason, summary: "Rolled back to revision " + revision.revisionNumber };
    await course.save();
    await cacheDelete("course:" + course._id);
    await audit(req, "course.revision.rolled_back", "Course", course._id, { revisionNumber: "current" }, { restoredRevisionId: String(revision._id), restoredRevisionNumber: revision.revisionNumber, isPublished: false }, reason);
    return success(res, { course, restoredRevision: revision.revisionNumber }, "Course restored as a draft. Re-check readiness before publishing.");
  } catch (e) { next(e); }
}

export async function reviewAiCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = requireContentReason(req, res, "AI course review");
    if (!reason) return;
    const decision = String(req.body?.decision || "").trim();
    if (!["approved", "rejected", "pending"].includes(decision)) return failure(res, "Decision must be approved, rejected or pending.", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    if (!isAiGeneratedCourse(course)) return failure(res, "Human AI review is only required for AI-generated or derived courses.", 400);
    const before = { aiReviewStatus: course.aiReviewStatus, aiReviewNote: course.aiReviewNote || "" };
    course.aiReviewStatus = decision;
    course.aiReviewedBy = adminActorId(req);
    course.aiReviewedAt = new Date();
    course.aiReviewNote = String(req.body?.note || reason).trim().slice(0, 2000);
    course.$locals.revisionContext = { actor: adminActorId(req), source: "admin", reason, summary: "AI review decision: " + decision };
    await course.save();
    await audit(req, "course.ai_review." + decision, "Course", course._id, before, { aiReviewStatus: course.aiReviewStatus, aiReviewNote: course.aiReviewNote }, reason);
    return success(res, { course }, "AI course review recorded");
  } catch (e) { next(e); }
}

export async function setCourseLifecycle(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = requireContentReason(req, res, "course lifecycle change");
    if (!reason) return;
    const status = String(req.body?.status || "").trim();
    if (!["draft", "archived"].includes(status)) return failure(res, "Status must be draft or archived; publish through the readiness-gated publish action.", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course || course.deletedAt) return failure(res, "Active course not found", 404);
    const before = { status: course.status, isPublished: course.isPublished, enrollmentEnabled: course.enrollmentEnabled };
    course.status = status;
    course.isPublished = false;
    if (status === "archived") course.enrollmentEnabled = false;
    course.$locals.revisionContext = { actor: adminActorId(req), source: "admin", reason, summary: "Course status changed to " + status };
    await course.save();
    await cacheDelete("course:" + course._id);
    await audit(req, "course.status.updated", "Course", course._id, before, { status: course.status, isPublished: course.isPublished, enrollmentEnabled: course.enrollmentEnabled }, reason);
    return success(res, { course }, "Course status updated");
  } catch (e) { next(e); }
}

export async function softDeleteCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = requireContentReason(req, res, "course soft delete");
    if (!reason) return;
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    if (course.deletedAt) return success(res, { course }, "Course is already in the trash");
    const before = { status: course.status, isPublished: course.isPublished, deletedAt: course.deletedAt };
    course.deletedAt = new Date();
    course.isPublished = false;
    course.status = "draft";
    course.$locals.revisionContext = { actor: adminActorId(req), source: "admin", reason, summary: "Course soft-deleted" };
    await course.save();
    await cacheDelete("course:" + course._id);
    await audit(req, "course.soft_deleted", "Course", course._id, before, { status: course.status, isPublished: course.isPublished, deletedAt: course.deletedAt }, reason);
    return success(res, { course }, "Course moved to trash");
  } catch (e) { next(e); }
}

export async function restoreCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const reason = requireContentReason(req, res, "course restore");
    if (!reason) return;
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const before = { deletedAt: course.deletedAt, status: course.status, isPublished: course.isPublished };
    course.deletedAt = null;
    course.isPublished = false;
    course.status = "draft";
    course.$locals.revisionContext = { actor: adminActorId(req), source: "admin", reason, summary: "Course restored from trash as draft" };
    await course.save();
    await cacheDelete("course:" + course._id);
    await audit(req, "course.restored", "Course", course._id, before, { deletedAt: null, status: course.status, isPublished: false }, reason);
    return success(res, { course }, "Course restored as a draft");
  } catch (e) { next(e); }
}

const MODERATED_MODELS = {
  review: { model: Review, fields: "course user rating comment moderationStatus moderationNote moderatedBy moderatedAt isHidden createdAt updatedAt", populate: [{ path: "course", select: "title" }, { path: "user", select: "name email" }] },
  quiz: { model: QuizBank, fields: "course lesson title questions moderationStatus moderationNote moderatedBy moderatedAt isHidden generatedBy generatedAt createdAt", populate: [{ path: "course", select: "title" }] },
  insight: { model: AILessonInsight, fields: "course lesson summary keyNotes model moderationStatus moderationNote moderatedBy moderatedAt isHidden generatedAt createdAt", populate: [{ path: "course", select: "title" }] },
  qa: { model: AIQuestionAnswer, fields: "course lesson question answer model moderationStatus moderationNote moderatedBy moderatedAt isHidden hitCount lastAskedAt createdAt", populate: [{ path: "course", select: "title" }] }
};

export async function contentModerationList(req, res, next) {
  try {
    const type = String(req.params.contentType || "");
    const config = MODERATED_MODELS[type];
    if (!config) return failure(res, "Unknown content type. Use review, quiz, insight or qa.", 400);
    const status = String(req.query.status || "pending");
    const filter = status === "all" ? {} : { moderationStatus: status };
    const items = await config.model.find(filter).select(config.fields).populate(config.populate).sort({ createdAt: -1 }).limit(200).lean();
    return success(res, { contentType: type, items });
  } catch (e) { next(e); }
}

export async function moderateContent(req, res, next) {
  try {
    const type = String(req.params.contentType || "");
    const config = MODERATED_MODELS[type];
    if (!config) return failure(res, "Unknown content type. Use review, quiz, insight or qa.", 400);
    if (!isValidObjectId(req.params.contentId)) return failure(res, "Invalid content ID", 400);
    const reason = requireContentReason(req, res, "content moderation");
    if (!reason) return;
    const status = String(req.body?.status || "").trim();
    if (!["pending", "approved", "rejected"].includes(status)) return failure(res, "Invalid moderation status", 400);
    const item = await config.model.findById(req.params.contentId);
    if (!item) return failure(res, "Content record not found", 404);
    const before = { moderationStatus: item.moderationStatus || "pending", isHidden: Boolean(item.isHidden), moderationNote: item.moderationNote || "" };
    item.moderationStatus = status;
    item.moderationNote = String(req.body?.note || reason).trim().slice(0, 2000);
    item.moderatedBy = adminActorId(req);
    item.moderatedAt = new Date();
    item.isHidden = typeof req.body?.isHidden === "boolean" ? req.body.isHidden : status === "rejected";
    await item.save();
    await audit(req, "content." + type + ".moderated", type, item._id, before, { moderationStatus: item.moderationStatus, isHidden: item.isHidden, moderationNote: item.moderationNote }, reason);
    return success(res, { item }, "Content moderation saved");
  } catch (e) { next(e); }
}

export async function contentRoadmaps(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const status = String(req.query.status || "");
    const filter = status && ["active", "completed"].includes(status) ? { status } : {};
    const [items, total] = await Promise.all([
      LearningRoadmap.find(filter).populate("user", "name email").select("user query canonicalTopic intent careerOutcome level status startedAt lastAccessedAt completedAt createdAt updatedAt lessons").sort({ updatedAt: -1 }).limit(limit).lean(),
      LearningRoadmap.countDocuments(filter)
    ]);
    return success(res, { roadmaps: items, total });
  } catch (e) { next(e); }
}

function collectCourseLinks(course) {
  const links = [];
  const add = (url, path) => { if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) links.push({ url: url.trim(), path }); };
  (course.modules || []).forEach((module, mi) => {
    (module.resources || []).forEach((resource, ri) => add(resource.url, "modules[" + mi + "].resources[" + ri + "].url"));
    (module.lessons || []).forEach((lesson, li) => {
      (lesson.tutorial?.resources || []).forEach((url, ri) => add(url, "modules[" + mi + "].lessons[" + li + "].tutorial.resources[" + ri + "]"));
      (lesson.tutorial?.videos || []).forEach((video, vi) => add(video.url, "modules[" + mi + "].lessons[" + li + "].tutorial.videos[" + vi + "].url"));
      (lesson.project?.resources || []).forEach((url, ri) => add(url, "modules[" + mi + "].lessons[" + li + "].project.resources[" + ri + "]"));
      (lesson.project?.videos || []).forEach((video, vi) => add(video.url, "modules[" + mi + "].lessons[" + li + "].project.videos[" + vi + "].url"));
    });
  });
  return links;
}
function isUnsafeLinkHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 0;
  }
  return false;
}
async function checkContentLink(link) {
  let parsed;
  try { parsed = new URL(link.url); } catch { return { ...link, status: "invalid", httpStatus: null }; }
  if (!["http:", "https:"].includes(parsed.protocol) || isUnsafeLinkHost(parsed.hostname)) return { ...link, status: "skipped_unsafe", httpStatus: null };
  try {
    const response = await fetch(parsed.toString(), { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "user-agent": "BuddyForStudy-LinkHealth/1.0" } });
    return { ...link, status: response.status >= 400 ? "broken" : response.status >= 300 ? "redirect" : "ok", httpStatus: response.status };
  } catch (error) {
    return { ...link, status: error?.name === "TimeoutError" ? "timeout" : "unreachable", httpStatus: null };
  }
}
export async function brokenCourseLinks(req, res, next) {
  try {
    const courses = await Course.find({ deletedAt: null }).select("title slug modules").sort({ updatedAt: -1 }).limit(100).lean();
    const links = courses.flatMap((course) => collectCourseLinks(course).map((link) => ({ ...link, courseId: String(course._id), courseTitle: course.title, slug: course.slug }))).slice(0, 500);
    const results = [];
    for (let i = 0; i < links.length; i += 10) results.push(...await Promise.all(links.slice(i, i + 10).map(checkContentLink)));
    return success(res, { checked: results.length, brokenCount: results.filter((item) => ["broken", "invalid", "unreachable", "timeout"].includes(item.status)).length, links: results });
  } catch (e) { next(e); }
}

export async function courseReadiness(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId).select("title description category duration learningOutcomes modules pricing").lean();
    if (!course) return failure(res, "Course not found", 404);
    return success(res, { courseId: String(course._id), readiness: evaluateCourseReadiness(course) });
  } catch (error) { next(error); }
}

export async function publishCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);

    const blockedReadiness = getCoursePublishBlock(course, Boolean(course.isPublished));
    if (blockedReadiness) {
      return res.status(409).json({
        success: false,
        message: "Course is not ready to publish. Resolve the failed readiness checks first.",
        readiness: blockedReadiness
      });
    }
    const readiness = evaluateCourseReadiness(course);
    if (course.isPublished) return success(res, { course, readiness }, "Course is already published");

    const before = { isPublished: course.isPublished };
    course.isPublished = true;
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.published", "Course", course._id, before, { isPublished: true, readinessPassed: readiness.passedCount, readinessChecks: readiness.totalChecks }, req.body?.reason || "Published after readiness validation");
    return success(res, { course, readiness }, "Course published");
  } catch (error) { next(error); }
}

export async function courseDetail(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId).lean();
    if (!course) return failure(res, "Course not found", 404);
    return success(res, { course });
  } catch (e) { next(e); }
}

function extractYouTubeVideoId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const queryId = url.searchParams.get("v");
      if (queryId) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0]) && parts[1]) return parts[1];
    }
  } catch {
    return null;
  }

  return null;
}


function renumberModules(course) {
  (course.modules || []).forEach((module, moduleIndex) => {
    module.order = moduleIndex + 1;
    (module.lessons || []).forEach((lesson, lessonIndex) => {
      lesson.order = lessonIndex + 1;
    });
  });
}

function extractYouTubeVideoIdFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return id;
      const parts = parsed.pathname.split("/").filter(Boolean);
      return ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] || null : null;
    }
  } catch {}
  return null;
}

export async function addCourseModule(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);

    const title = String(req.body.title || "").trim();
    if (!title) return failure(res, "Module title is required", 400);

    const module = course.modules.create({
      title,
      description: String(req.body.description || "").trim(),
      order: (course.modules || []).length + 1,
      resources: [],
      lessons: []
    });
    course.modules.push(module);
    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.created", "Course", course._id, null, {
      moduleId: String(module._id), title: module.title, order: module.order
    });
    return success(res, { course, module }, "Module added", 201);
  } catch (e) { next(e); }
}

export async function updateCourseModule(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);

    const summarizeModuleForAudit = (item) => ({
      moduleId: String(item._id),
      title: item.title,
      descriptionLength: String(item.description || "").length,
      resourceCount: Array.isArray(item.resources) ? item.resources.length : 0
    });
    const before = summarizeModuleForAudit(module);
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return failure(res, "Module title cannot be empty", 400);
      module.title = title;
    }
    if (req.body.description !== undefined) module.description = String(req.body.description || "").trim();

    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.updated", "Course", course._id, before, summarizeModuleForAudit(module), req.body.reason || "");
    return success(res, { course, module }, "Module updated");
  } catch (e) { next(e); }
}

export async function deleteCourseModule(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const index = (course.modules || []).findIndex((item) => String(item._id) === String(req.params.moduleId));
    if (index < 0) return failure(res, "Course module not found", 404);

    const removed = course.modules[index].toObject();
    course.modules.splice(index, 1);
    renumberModules(course);
    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.deleted", "Course", course._id, {
      moduleId: String(removed._id), title: removed.title
    }, null, req.body?.reason || "");
    return success(res, { course }, "Module removed");
  } catch (e) { next(e); }
}

export async function addCourseVideo(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);

    const resourceUrl = String(req.body.resourceUrl || req.body.videoUrl || "").trim();
    if (!resourceUrl) return failure(res, "YouTube video or playlist URL is required", 400);

    const url = new URL(resourceUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const playlistId = (host === "youtube.com" || host === "m.youtube.com") ? url.searchParams.get("list") : null;

    if (playlistId) {
      const playlist = await getPlaylistCourse(playlistId);
      if (!playlist.lessons?.length) return failure(res, "The YouTube playlist contains no usable videos", 400);

      const imported = playlist.lessons.map((video) => module.lessons.create({
        title: video.title,
        description: video.description || "",
        type: "tutorial",
        order: 1,
        tutorial: {
          content: video.description || "",
          resources: video.url ? [video.url] : [],
          videos: [{
            videoId: video.videoId,
            title: video.title,
            description: video.description || "",
            channelTitle: video.channelTitle || "",
            publishedAt: video.publishedAt || null,
            url: video.url || "",
            thumbnail: video.thumbnail || "",
            embedUrl: video.embedUrl || ""
          }],
          playlistId,
          playlistTitle: playlist.title || ""
        }
      }));
      module.lessons.push(...imported);
      renumberModules(course);
      course.markModified("modules");
      course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
      await cacheDelete(`course:${course._id}`);
      await audit(req, "course.videos.playlist.imported", "Course", course._id, null, {
        moduleId: String(module._id), playlistId, count: imported.length
      }, req.body.reason || "");
      return success(res, { course, module, addedCount: imported.length, mode: "playlist" }, "Playlist videos added", 201);
    }

    const videoId = extractYouTubeVideoIdFromUrl(resourceUrl);
    if (!videoId) return failure(res, "Enter a valid YouTube video or playlist URL", 400);

    const title = String(req.body.title || `Learn ${module.title}`).trim();
    const lesson = module.lessons.create({
      title,
      description: String(req.body.description || "").trim(),
      type: "tutorial",
      order: (module.lessons || []).length + 1,
      tutorial: {
        content: String(req.body.description || "").trim(),
        resources: [`https://www.youtube.com/watch?v=${videoId}`],
        videos: [{
          videoId,
          title,
          description: String(req.body.description || "").trim(),
          channelTitle: "",
          publishedAt: null,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`,
          durationSeconds: 0,
          duration: ""
        }]
      }
    });
    module.lessons.push(lesson);
    renumberModules(course);
    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.video.added", "Course", course._id, null, {
      moduleId: String(module._id), lessonId: String(lesson._id), videoId
    }, req.body.reason || "");
    return success(res, { course, module, lesson, mode: "video" }, "Video added", 201);
  } catch (e) {
    if (e instanceof TypeError || e?.code === "ERR_INVALID_URL") return failure(res, "Enter a valid YouTube video or playlist URL", 400);
    next(e);
  }
}


export async function addCourseLesson(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);

    const lessonValidation = validateNewLessonInput(req.body);
    if (!lessonValidation.valid) return failure(res, lessonValidation.error, 400);
    const { title, type } = lessonValidation.value;

    const lessonInput = {
      title,
      description: lessonValidation.value.description,
      type,
      order: (module.lessons || []).length + 1
    };

    if (type === "tutorial") {
      lessonInput.tutorial = { content: "", resources: [], videos: [] };
    } else if (type === "project") {
      lessonInput.project = {
        description: String(req.body.description || "").trim(),
        objectives: [],
        requirements: [],
        instructions: "",
        expectedOutcome: ""
      };
    } else {
      lessonInput.quiz = {
        scope: "lesson",
        questionCount: Math.max(3, Math.min(15, Number(req.body.questionCount) || 5)),
        passingScore: Math.max(50, Math.min(90, Number(req.body.passingScore) || 70)),
        focusTopics: [],
        instructions: "Complete the quiz to validate understanding.",
        questions: []
      };
    }

    const lesson = module.lessons.create(lessonInput);
    module.lessons.push(lesson);
    renumberModules(course);
    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.lesson.created", "Course", course._id, null, {
      moduleId: String(module._id), lessonId: String(lesson._id), title, type
    });
    return success(res, { course, module, lesson }, "Learning item added", 201);
  } catch (e) { next(e); }
}

export async function deleteCourseLesson(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);
    const index = (module.lessons || []).findIndex((item) => String(item._id) === String(req.params.lessonId));
    if (index < 0) return failure(res, "Lesson not found", 404);

    const removed = module.lessons[index].toObject();
    module.lessons.splice(index, 1);
    renumberModules(course);
    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.lesson.deleted", "Course", course._id, {
      moduleId: String(module._id), lessonId: String(removed._id), title: removed.title, type: removed.type
    }, null, req.body?.reason || "");
    return success(res, { course, module }, "Learning item removed");
  } catch (e) { next(e); }
}

export async function addModuleResource(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);

    const title = String(req.body.title || "").trim();
    const resourceUrl = String(req.body.url || "").trim();
    const type = ["link", "document", "repository", "article"].includes(req.body.type) ? req.body.type : "link";
    if (!title || !resourceUrl) return failure(res, "Resource title and URL are required", 400);

    let parsed;
    try { parsed = new URL(resourceUrl); } catch { return failure(res, "Resource URL is invalid", 400); }
    if (!parsed.protocol.startsWith("http")) return failure(res, "Resource URL must be http or https", 400);

    const resource = module.resources.create({ title, url: resourceUrl, type });
    module.resources.push(resource);
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    let resourceHost = "";
    try { resourceHost = new URL(resourceUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* URL validation is handled by the resource endpoint. */ }
    await audit(req, "course.module.resource.added", "Course", course._id, null, {
      moduleId: String(module._id),
      resourceId: String(resource._id),
      title,
      type,
      hasUrl: Boolean(resourceUrl),
      urlHost: resourceHost
    }, req.body.reason || "");
    return success(res, { course, module, resource }, "Module resource added", 201);
  } catch (e) { next(e); }
}

export async function deleteModuleResource(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const module = (course.modules || []).find((item) => String(item._id) === String(req.params.moduleId));
    if (!module) return failure(res, "Course module not found", 404);
    const index = (module.resources || []).findIndex((item) => String(item._id) === String(req.params.resourceId));
    if (index < 0) return failure(res, "Module resource not found", 404);

    const removed = module.resources[index].toObject();
    let removedResourceHost = "";
    try { removedResourceHost = new URL(removed.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* Legacy resources may contain invalid URLs. */ }
    module.resources.splice(index, 1);
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.resource.deleted", "Course", course._id, {
      moduleId: String(module._id),
      resourceId: String(removed._id),
      title: removed.title,
      type: removed.type,
      hasUrl: Boolean(removed.url),
      urlHost: removedResourceHost
    }, null, req.body?.reason || "");
    return success(res, { course, module }, "Module resource removed");
  } catch (e) { next(e); }
}

export async function updateCourseTutorial(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);

    const lessonId = String(req.body.lessonId || "");
    const moduleId = String(req.body.moduleId || "");
    const resourceUrl = String(req.body.resourceUrl || req.body.videoUrl || "").trim();
    if (!resourceUrl) return failure(res, "YouTube video or playlist URL is required", 400);

    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);

    let targetLesson = null;
    let targetModule = null;

    if (lessonId) {
      for (const module of course.modules || []) {
        const lesson = (module.lessons || []).find((item) => String(item._id) === lessonId);
        if (lesson) { targetLesson = lesson; targetModule = module; break; }
      }
      if (!targetLesson || !targetModule) return failure(res, "Tutorial lesson not found", 404);
      if (targetLesson.type !== "tutorial") return failure(res, "Only tutorial lessons can have a YouTube resource", 400);
    } else if (moduleId) {
      targetModule = (course.modules || []).find((module) => String(module._id) === moduleId);
      if (!targetModule) return failure(res, "Course module not found", 404);
    } else {
      return failure(res, "lessonId or moduleId is required", 400);
    }

    const summarizeLessonsForAudit = (lessons = []) => lessons.map((lesson) => ({
      id: String(lesson._id),
      title: lesson.title,
      type: lesson.type,
      videoCount: Array.isArray(lesson.tutorial?.videos) ? lesson.tutorial.videos.length : 0,
      videoIds: (lesson.tutorial?.videos || []).map((video) => String(video.videoId || "")).filter(Boolean),
      playlistId: lesson.tutorial?.playlistId || ""
    }));
    const before = {
      moduleTitle: targetModule.title,
      lessons: summarizeLessonsForAudit(targetModule.lessons || [])
    };

    const url = new URL(resourceUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const playlistId = (host === "youtube.com" || host === "m.youtube.com") ? url.searchParams.get("list") : null;

    if (playlistId) {
      if (lessonId) return failure(res, "Use a playlist URL on a module, not on an individual tutorial", 400);
      const playlist = await getPlaylistCourse(playlistId);
      if (!playlist.lessons?.length) return failure(res, "The YouTube playlist contains no usable embeddable videos", 400);

      targetModule.lessons ||= [];
      const playlistLessons = playlist.lessons.map((video, index) => targetModule.lessons.create({
        title: video.title,
        description: video.description || "",
        type: "tutorial",
        order: targetModule.lessons.length + index + 1,
        tutorial: {
          content: video.description || "",
          resources: [video.url],
          videos: [{
            videoId: video.videoId,
            title: video.title,
            description: video.description || "",
            channelTitle: video.channelTitle || "",
            publishedAt: video.publishedAt || null,
            url: video.url,
            thumbnail: video.thumbnail || "",
            embedUrl: video.embedUrl,
            durationSeconds: Number(video.durationSeconds || 0),
            duration: video.duration || ""
          }],
          playlistId,
          playlistTitle: playlist.title
        }
      }));
      targetModule.lessons.push(...playlistLessons);
      renumberModules(course);
    } else {
      const videoId = extractYouTubeVideoId(resourceUrl);
      if (!videoId) return failure(res, "Enter a valid YouTube video or playlist URL", 400);

      if (!targetLesson) {
        targetModule.lessons ||= [];
        targetLesson = targetModule.lessons.create({
          title: String(req.body.lessonTitle || `Learn ${targetModule.title}`).trim(),
          description: "",
          type: "tutorial",
          order: targetModule.lessons.length + 1,
          tutorial: { content: "", resources: [], videos: [] }
        });
        targetModule.lessons.push(targetLesson);
      }

      const currentVideo = targetLesson.tutorial?.videos?.[0] || {};
      const updatedVideo = {
        videoId,
        title: req.body.title ? String(req.body.title).trim() : (currentVideo.title || targetLesson.title || "Admin-selected YouTube video"),
        description: currentVideo.description || "",
        channelTitle: currentVideo.channelTitle || "",
        publishedAt: currentVideo.publishedAt || null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: currentVideo.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        durationSeconds: Number(currentVideo.durationSeconds || 0),
        duration: currentVideo.duration || ""
      };
      targetLesson.tutorial ||= {};
      targetLesson.tutorial.videos = [updatedVideo];
      targetLesson.tutorial.resources = [updatedVideo.url];
    }

    course.markModified("modules");
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    await cacheDelete(`course:${course._id}`);

    const playlistMode = Boolean(playlistId);
    await audit(
      req,
      lessonId ? "course.tutorial.video.updated" : (playlistMode ? "course.module.playlist.added" : "course.tutorial.video.added"),
      "Course",
      course._id,
      before,
      { moduleTitle: targetModule.title, lessons: summarizeLessonsForAudit(targetModule.lessons || []) },
      req.body.reason || ""
    );

    return success(res, {
      course,
      mode: playlistMode ? "playlist" : "video",
      lesson: targetModule.lessons?.length ? {
        id: String(targetModule.lessons[targetModule.lessons.length - 1]?._id || ""),
        title: targetModule.lessons[targetModule.lessons.length - 1]?.title || "",
        moduleTitle: targetModule.title
      } : null
    }, playlistMode ? "YouTube playlist added to module" : (lessonId ? "Tutorial video updated" : "Tutorial video added"));
  } catch (e) {
    if (e?.status === 404) return failure(res, e.message, 404);
    next(e);
  }
}

export async function updateCourse(req, res, next) {
  try {
    const validation = validateCourseAdminPatch(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: "Course update contains invalid fields", errors: validation.errors });
    }
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const summarizeCourseForAudit = (item) => ({
      title: item.title,
      descriptionLength: String(item.description || "").length,
      category: item.category,
      level: item.level,
      duration: item.duration,
      hasThumbnail: Boolean(item.thumbnail),
      learningOutcomeCount: Array.isArray(item.learningOutcomes) ? item.learningOutcomes.length : 0,
      isPublished: item.isPublished,
      pricing: {
        mode: item.pricing?.mode,
        price: item.pricing?.price,
        compareAtPrice: item.pricing?.compareAtPrice,
        currency: item.pricing?.currency,
        saleEnabled: item.pricing?.saleEnabled,
        salePrice: item.pricing?.salePrice
      },
      enrollmentEnabled: item.enrollmentEnabled,
      certificateEnabled: item.certificateEnabled,
      featured: item.featured
    });
    const before = summarizeCourseForAudit(course);

    // Prevent the legacy generic update endpoint from bypassing the publishing preflight.
    if (req.body.isPublished === true && !course.isPublished) {
      const readiness = getCoursePublishBlock(course, Boolean(course.isPublished));
      if (readiness) {
        return res.status(409).json({
          success: false,
          message: "Course is not ready to publish. Resolve the failed readiness checks first.",
          readiness
        });
      }
    }

    if (req.body.title !== undefined) {
      const value = String(req.body.title).trim();
      if (!value) return failure(res, "Course title cannot be empty", 400);
      course.title = value;
    }
    if (req.body.description !== undefined) {
      const value = String(req.body.description).trim();
      if (!value) return failure(res, "Course description cannot be empty", 400);
      course.description = value;
    }
    if (req.body.category !== undefined) course.category = String(req.body.category).trim();
    if (req.body.level !== undefined && ["Beginner", "Intermediate", "Advanced"].includes(req.body.level)) course.level = req.body.level;
    if (req.body.duration !== undefined) course.duration = String(req.body.duration).trim();
    if (req.body.thumbnail !== undefined) course.thumbnail = String(req.body.thumbnail).trim();
    if (Array.isArray(req.body.learningOutcomes)) {
      course.learningOutcomes = req.body.learningOutcomes.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
    }
    for (const key of ["isPublished", "enrollmentEnabled", "certificateEnabled", "featured"]) if (typeof req.body[key] === "boolean") course[key] = req.body[key];
    if (req.body.pricing) {
      const p = req.body.pricing;
      if (p.mode === "free" || p.mode === "paid") course.pricing.mode = p.mode;
      if (p.price !== undefined) course.pricing.price = Math.max(Number(p.price) || 0, 0);
      if (p.compareAtPrice !== undefined) course.pricing.compareAtPrice = Math.max(Number(p.compareAtPrice) || 0, 0);
      if (p.currency) course.pricing.currency = String(p.currency).toUpperCase();
      if (typeof p.saleEnabled === "boolean") course.pricing.saleEnabled = p.saleEnabled;
      if (p.salePrice !== undefined) course.pricing.salePrice = Math.max(Number(p.salePrice) || 0, 0);
    }
    course.$locals.revisionContext = { actor: req.user?.user?._id || req.user?.userId || null, source: "admin", reason: String(req.body?.reason || "Admin course content change").slice(0, 500), summary: "Course content or metadata changed" };
    await course.save();
    // Course catalogue caches must not retain stale publish state or metadata.
    await cacheDelete(`course:${course._id}`);
    const after = summarizeCourseForAudit(course);
    const publishTransition = before.isPublished !== after.isPublished;
    const action = publishTransition
      ? (after.isPublished ? "course.published" : "course.unpublished")
      : "course.updated";
    await audit(req, action, "Course", course._id, before, after, reason);
    return success(res, { course }, "Course controls updated");
  } catch (e) { next(e); }
}

async function ensureDefaultPlans() {
  const defaults = [
    {
      name: "Free",
      slug: "free",
      description: "Core BuddyForStudy access for every learner.",
      price: 0,
      currency: "INR",
      billingInterval: "monthly",
      features: [
        "Access published courses",
        "Normal course search",
        "Basic learning progress tracking"
      ],
      isActive: true,
      isPopular: false,
      trialDays: 0,
      sortOrder: 1,
      limits: {
        ai_course_builds_per_month: 0,
        advanced_ai_questions_per_month: 0,
        advanced_ai_insights_per_month: 0,
        ai_quiz_generations_per_month: 20
      }
    },
    {
      name: "Pro",
      slug: "pro",
      description: "More powerful learning workflows for active learners.",
      price: 199,
      currency: "INR",
      billingInterval: "monthly",
      features: [
        "Access published courses",
        "Normal course search",
        "Basic learning progress tracking",
        "Build with AI",
        "Personalized learning roadmaps",
        "Project-based learning"
      ],
      isActive: true,
      isPopular: true,
      trialDays: 0,
      sortOrder: 2,
      limits: {
        ai_course_builds_per_month: 5,
        advanced_ai_questions_per_month: 100,
        advanced_ai_insights_per_month: 30,
        ai_quiz_generations_per_month: 50
      }
    },
    {
      name: "Premium",
      slug: "premium",
      description: "The full BuddyForStudy learning experience.",
      price: 399,
      currency: "INR",
      billingInterval: "monthly",
      features: [
        "Access published courses",
        "Normal course search",
        "Basic learning progress tracking",
        "Build with AI",
        "Personalized learning roadmaps",
        "Project-based learning",
        "Advanced AI learning paths",
        "Personalized study planning",
        "Priority learning recommendations"
      ],
      isActive: true,
      isPopular: false,
      trialDays: 0,
      sortOrder: 3,
      limits: {
        ai_course_builds_per_month: 20,
        advanced_ai_questions_per_month: 500,
        advanced_ai_insights_per_month: 100,
        ai_quiz_generations_per_month: 200
      }
    }
  ];

  for (const plan of defaults) {
    await SubscriptionPlan.updateOne(
      { slug: plan.slug },
      { $setOnInsert: plan },
      { upsert: true }
    );

    const current = await SubscriptionPlan.findOne({ slug: plan.slug }).select("limits").lean();
    if (!current?.limits || Object.keys(current.limits).length === 0) {
      await SubscriptionPlan.updateOne({ slug: plan.slug }, { $set: { limits: plan.limits } });
    }
  }
}

function normalizePlanLimits(value) {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, raw] of Object.entries(input)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    output[key] = Math.trunc(parsed);
  }
  return output;
}

export async function plans(req, res, next) {
  try {
    await ensureDefaultPlans();
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
    const normalizedPlans = plans.map((plan) => ({
      ...plan,
      features: normalizeSubscriptionFeatures(plan.features),
    }));
    return success(res, { plans: normalizedPlans, availableFeatures: SUBSCRIPTION_FEATURES });
  } catch (e) { next(e); }
}

export async function createPlan(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for subscription plan creation.", 400);
    const validation = validateSubscriptionPlanAdminInput({ ...req.body, billingInterval: req.body.billingInterval || "monthly", currency: req.body.currency || "INR" });
    if (!validation.valid) return res.status(400).json({ success: false, message: "Subscription plan contains invalid fields", errors: validation.errors });
    const plan = await SubscriptionPlan.create({
      name: req.body.name, slug: req.body.slug, description: req.body.description || "", price: Number(req.body.price) || 0,
      currency: req.body.currency || "INR", billingInterval: req.body.billingInterval || "monthly",
      features: normalizeSubscriptionFeatures(req.body.features),
      limits: normalizePlanLimits(req.body.limits),
      isActive: req.body.isActive !== false,
      isPopular: Boolean(req.body.isPopular), trialDays: Number(req.body.trialDays) || 0, sortOrder: Number(req.body.sortOrder) || 0
    });
    await audit(req, "subscription_plan.created", "SubscriptionPlan", plan._id, null, {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      featuresCount: plan.features.length,
      limitKeys: [...plan.limits.keys()]
    }, reason);
    return success(res, { plan }, "Plan created", 201);
  } catch (e) { next(e); }
}

export async function updatePlan(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for subscription plan changes.", 400);
    if (!isValidObjectId(req.params.planId)) return failure(res, "Invalid planId", 400);
    const plan = await SubscriptionPlan.findById(req.params.planId); if (!plan) return failure(res, "Plan not found", 404);
    const validation = validateSubscriptionPlanAdminInput(req.body, {
      name: plan.name, slug: plan.slug, price: plan.price, currency: plan.currency,
      billingInterval: plan.billingInterval, trialDays: plan.trialDays, sortOrder: plan.sortOrder,
      isActive: plan.isActive, isPopular: plan.isPopular
    });
    if (!validation.valid) return res.status(400).json({ success: false, message: "Subscription plan contains invalid fields", errors: validation.errors });
    const before = {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      featuresCount: plan.features.length,
      limitKeys: [...plan.limits.keys()]
    };
    const allowed = ["name", "slug", "description", "price", "currency", "billingInterval", "features", "limits", "isActive", "isPopular", "trialDays", "sortOrder"];
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      if (key === "features") plan[key] = normalizeSubscriptionFeatures(req.body[key]);
      else if (key === "limits") plan[key] = normalizePlanLimits(req.body[key]);
      else plan[key] = req.body[key];
    }
    await plan.save(); await audit(req, "subscription_plan.updated", "SubscriptionPlan", plan._id, before, {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      featuresCount: plan.features.length,
      limitKeys: [...plan.limits.keys()]
    }, reason);
    return success(res, { plan }, "Plan updated");
  } catch (e) { next(e); }
}

export async function retryNotificationDeliveryAdmin(req, res, next) {
  try {
    if (!isValidObjectId(req.params.notificationId)) return failure(res, "Invalid notificationId", 400);
    const channel = String(req.body?.channel || "");
    if (!["email", "push"].includes(channel)) return failure(res, "Channel must be email or push", 400);

    const result = await retryNotificationDelivery(req.params.notificationId, channel);
    await audit(req, "notification.delivery.retried", "Notification", req.params.notificationId, null, {
      channel: result.channel,
      status: result.status,
      attempts: result.attempts
    });
    return success(res, { delivery: result }, `${channel === "email" ? "Email" : "Push"} retry finished: ${result.status}`);
  } catch (e) {
    if (e?.status) return failure(res, e.message, e.status);
    next(e);
  }
}

export async function notificationDeliveries(req, res, next) {
  try {
    const deliveries = await Notification.find({
      $or: [
        { emailStatus: { $in: ["pending", "sent", "failed"] } },
        { pushStatus: { $in: ["pending", "sent", "failed"] } },
        { emailError: { $ne: "" } },
        { pushError: { $ne: "" } }
      ]
    })
      .populate("user", "name email")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return success(res, {
      deliveries: deliveries.map((item) => ({
        id: String(item._id),
        user: item.user ? { name: item.user.name, email: item.user.email } : null,
        title: item.title,
        message: item.message,
        type: item.type,
        link: item.link,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        emailStatus: item.emailStatus,
        emailAttempts: item.emailAttempts,
        emailSentAt: item.emailSentAt,
        emailError: item.emailError,
        pushStatus: item.pushStatus,
        pushAttempts: item.pushAttempts,
        pushSentAt: item.pushSentAt,
        pushError: item.pushError
      }))
    });
  } catch (e) { next(e); }
}

export async function payments(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const items = await Payment.find().populate("user", "name email").populate("course", "title").populate("plan", "name price billingInterval").sort({ createdAt: -1 }).limit(limit).lean();
    return success(res, { payments: items });
  } catch (e) { next(e); }
}

export async function subscriptions(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const status = String(req.query.status || "").trim();
    const allowed = ["trialing", "active", "past_due", "cancelled", "expired"];
    const filter = status && allowed.includes(status) ? { status } : {};
    const items = await UserSubscription.find(filter)
      .populate("user", "name email")
      .populate("plan", "name price currency billingInterval features")
      .sort({ updatedAt: -1 }).limit(limit).lean();
    return success(res, { subscriptions: items });
  } catch (e) { next(e); }
}

export async function refunds(req, res, next) {
  try {
    const items = await RefundRequest.find().populate("user", "name email").populate({ path: "payment", populate: [{ path: "course", select: "title" }, { path: "plan", select: "name price billingInterval" }] }).populate("processedBy", "name email").sort({ createdAt: -1 }).limit(200).lean();
    const now = Date.now();
    return success(res, { refunds: items.map((item) => {
      const dueAt = item.slaDueAt || new Date(new Date(item.createdAt).getTime() + 24 * 60 * 60 * 1000);
      return { ...item, sla: { dueAt, breached: dueAt.getTime() < now && ["pending", "approved"].includes(item.status), hoursRemaining: Math.ceil((dueAt.getTime() - now) / 3600000) } };
    }) });
  } catch (e) { next(e); }
}

export async function updateRefund(req, res, next) {
  try {
    if (!isValidObjectId(req.params.refundId)) return failure(res, "Invalid refundId", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A decision reason of 10–500 characters is required for every finance action.", 400);
    const refund = await RefundRequest.findById(req.params.refundId); if (!refund) return failure(res, "Refund request not found", 404);
    if (!["approved", "rejected", "processed"].includes(req.body.status)) return failure(res, "Invalid refund status", 400);
    const payment = await Payment.findById(refund.payment);
    if (!payment) return failure(res, "Payment record not found", 404);
    if (refund.status === "processed") {
      return failure(res, "A processed refund is final and cannot be changed.", 409);
    }
    if (refund.status === "approved") {
      return failure(res, "This refund is being processed or requires provider reconciliation and cannot be changed.", 409);
    }
    if (refund.status === "rejected" && req.body.status !== "rejected") {
      return failure(res, "A rejected refund request cannot be reopened. Submit a new request if eligible.", 409);
    }

    const before = {
      status: refund.status,
      amount: refund.amount,
      hasAdminNote: Boolean(refund.adminNote),
      processedAt: refund.processedAt
    };
    refund.adminNote = req.body.adminNote || refund.adminNote;
    refund.decisionReason = reason;
    refund.processedBy = req.user.user._id;

    if (req.body.status === "rejected") {
      // Rejection and provider processing race on the same pending state. Claim
      // the transition atomically so only one admin action can win.
      const rejectedRefund = await RefundRequest.findOneAndUpdate(
        { _id: refund._id, status: "pending" },
        {
          $set: {
            status: "rejected",
            decisionReason: reason,
            adminNote: typeof req.body.adminNote === "string" ? req.body.adminNote.trim().slice(0, 2000) : refund.adminNote,
            processedBy: req.user.user._id,
            processedAt: new Date()
          },
          $unset: { activePaymentKey: "" }
        },
        { new: true }
      );
      if (!rejectedRefund) {
        return failure(res, "This refund request is no longer pending. Refresh the queue before taking action.", 409);
      }
      refund.status = rejectedRefund.status;
      refund.adminNote = rejectedRefund.adminNote;
      refund.processedBy = rejectedRefund.processedBy;
      refund.processedAt = rejectedRefund.processedAt;
      refund.set("activePaymentKey", undefined);
    } else if (req.body.status === "approved" || req.body.status === "processed") {
      if (refund.status === "processed") return failure(res, "Refund is already processed", 409);
      if (refund.status === "rejected") return failure(res, "Rejected refund requests cannot be processed", 409);
      const remainingAmount = await getRemainingRefundableAmount(payment._id, payment.amount, refund._id);
      if (refund.amount > remainingAmount || remainingAmount <= 0) {
        return failure(res, "Refund exceeds the remaining refundable balance for this payment.", 409);
      }
      if (payment.provider !== "razorpay" || !payment.providerPaymentId) {
        return failure(res, "Refund cannot be processed because the payment provider reference is missing", 400);
      }
      if (refund.status !== "pending") {
        return failure(res, "This refund is already being processed or requires reconciliation.", 409);
      }

      // Atomically claim the pending request before calling the payment provider.
      // This prevents two concurrent admin requests from issuing duplicate refunds.
      const claimedRefund = await RefundRequest.findOneAndUpdate(
        { _id: refund._id, status: "pending" },
        { $set: { status: "approved", adminNote: refund.adminNote, decisionReason: reason, processedBy: req.user.user._id } },
        { new: true }
      );
      if (!claimedRefund) {
        return failure(res, "This refund request is no longer pending. Refresh the queue before taking action.", 409);
      }
      refund.status = claimedRefund.status;
      refund.adminNote = claimedRefund.adminNote;
      refund.processedBy = claimedRefund.processedBy;

      let providerRefund;
      try {
        providerRefund = await razorpay.refundPayment({
          paymentId: payment.providerPaymentId,
          amount: refund.amount
        });
      } catch (providerError) {
        // Missing credentials are detected before any provider request is made,
        // so that case is safe to return to pending. Other failures may be
        // timeouts after acceptance and must be reconciled before retrying.
        const providerNotConfigured =
          providerError?.status === 503 &&
          String(providerError?.message || "").startsWith("Razorpay is not configured");
        if (providerNotConfigured) {
          refund.status = "pending";
          refund.adminNote = [refund.adminNote, "Razorpay is not configured. Configure the provider before retrying this refund."].filter(Boolean).join("\n").slice(0, 2000);
        } else {
          refund.adminNote = [refund.adminNote, "Refund attempt needs provider reconciliation before retrying."].filter(Boolean).join("\n").slice(0, 2000);
        }
        await refund.save();
        await audit(req, "refund.provider_attempt_failed", "RefundRequest", refund._id, before, {
          status: refund.status,
          providerRefundId: refund.providerRefundId || "",
          hasAdminNote: Boolean(refund.adminNote)
        }, reason);
        throw providerError;
      }

      const providerStatus = String(providerRefund?.status || "").toLowerCase();
      const providerOutcome = classifyProviderRefundStatus(providerStatus);
      refund.providerRefundId = String(providerRefund?.id || "");
      if (providerOutcome === "processed") {
        refund.status = "processed";
        refund.set("activePaymentKey", undefined);
        refund.processedAt = new Date();

        const isFullRefund = refund.amount >= remainingAmount;
        payment.status = isFullRefund ? "refunded" : "partially_refunded";
        // Persist the provider-confirmed refund record first. If the payment
        // write fails afterward, reconciliation can repair the derived status.
      } else if (providerOutcome === "retryable") {
        // An explicit provider failure is safe to retry; an uncertain or pending
        // response must keep the active claim and be reconciled first.
        refund.status = "pending";
        refund.providerRefundId = "";
        refund.processedAt = null;
        refund.adminNote = [
          refund.adminNote,
          `Razorpay returned refund status '${providerStatus}'. The request is available for a safe retry.`
        ].filter(Boolean).join("\\n").slice(0, 2000);
      } else {
        refund.status = "approved";
        refund.processedAt = null;
        refund.adminNote = [
          refund.adminNote,
          `Razorpay refund ${refund.providerRefundId || "(ID unavailable)"} has status '${providerStatus || "unknown"}'. Reconcile with the provider before retrying.`
        ].filter(Boolean).join("\\n").slice(0, 2000);
      }
    }
    await refund.save();
    await audit(req, "refund.updated", "RefundRequest", refund._id, before, {
      status: refund.status,
      amount: refund.amount,
      hasAdminNote: Boolean(refund.adminNote),
      decisionReason: refund.decisionReason || "",
      processedAt: refund.processedAt
    }, reason);
    if (refund.status === "processed") {
      await payment.save();
    }
    try {
      await createNotificationEvent({
        userId: String(refund.user),
        title: refund.status === "processed" ? "Your refund has been processed" : refund.status === "rejected" ? "Your refund request was declined" : "Your refund request was updated",
        message: refund.status === "processed"
          ? `Your refund of ${payment.currency || "INR"} ${refund.amount} has been processed. Your payment provider may take additional time to reflect the funds.`
          : refund.status === "rejected"
            ? `Your refund request for ${payment.currency || "INR"} ${refund.amount} was declined. Contact support if you need help understanding the decision.`
            : `Your refund request for ${payment.currency || "INR"} ${refund.amount} has been updated to ${refund.status}.`,
        type: "billing",
        link: "/billing",
        eventKey: `refund-status:${refund._id}:${refund.status}`,
        emailSubject: refund.status === "processed" ? "Your BuddyForStudy refund has been processed" : "Your BuddyForStudy refund request update",
        metadata: { refundId: String(refund._id), paymentId: String(payment._id), amount: String(refund.amount), currency: payment.currency || "INR", status: refund.status },
        templateKeys: { notification: "refund-status-in-app", email: "refund-status-email" }
      });
    } catch (notificationError) {
      console.error("[notifications] refund status notification failed", {
        refundId: String(refund._id),
        message: String(notificationError?.message || "Unknown notification error").slice(0, 200)
      });
    }
    return success(res, { refund }, "Refund updated");
  } catch (e) { next(e); }
}

export async function reconcileRefund(req, res, next) {
  let reconciliationToken = "";
  let reconciliationRefundId = "";
  try {
    if (!isValidObjectId(req.params.refundId)) return failure(res, "Invalid refundId", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reconciliation reason of 10–500 characters is required.", 400);
    const providerRefundId = String(req.body?.providerRefundId || "").trim();
    if (!/^rfnd_[A-Za-z0-9]+$/.test(providerRefundId)) {
      return failure(res, "Enter a valid Razorpay refund ID from the provider dashboard.", 400);
    }

    let refund = await RefundRequest.findById(req.params.refundId);
    if (!refund) return failure(res, "Refund request not found", 404);
    const alreadyProcessed = refund.status === "processed";
    if (!alreadyProcessed && refund.status !== "approved") {
      return failure(res, "Only refunds awaiting provider reconciliation can use this action.", 409);
    }

    const payment = await Payment.findById(refund.payment);
    if (!payment) return failure(res, "Payment record not found", 404);
    if (payment.provider !== "razorpay" || !payment.providerPaymentId) {
      return failure(res, "Refund cannot be reconciled because the payment provider reference is missing.", 400);
    }

    const providerRefund = await razorpay.fetchRefund({
      refundId: providerRefundId,
      paymentId: payment.providerPaymentId
    });
    if (!matchesProviderRefund({
      providerRefund,
      providerRefundId,
      paymentId: payment.providerPaymentId,
      amount: refund.amount,
      currency: payment.currency || "INR"
    })) {
      return failure(res, "Provider refund does not match this payment, amount, and currency. Internal status was not changed.", 409);
    }

    const providerStatus = String(providerRefund?.status || "").toLowerCase();

    // If the refund record was committed but the subsequent payment update
    // failed, allow the same verified provider refund to repair the payment
    // status instead of leaving an irreversible partial write stuck forever.
    if (alreadyProcessed) {
      if (refund.providerRefundId !== providerRefundId || providerStatus !== "processed") {
        return failure(res, "This refund is already processed. Its provider reference cannot be changed.", 409);
      }
      const remainingAfterAllRefunds = await getRemainingRefundableAmount(payment._id, payment.amount);
      const expectedPaymentStatus = paymentStatusForRemainingBalance(remainingAfterAllRefunds);
      if (payment.status !== expectedPaymentStatus) {
        const beforePaymentStatus = payment.status;
        payment.status = expectedPaymentStatus;
        await payment.save();
        await audit(req, "refund.payment_status_reconciled", "Payment", payment._id, { status: beforePaymentStatus }, { status: payment.status, refundId: String(refund._id), providerRefundId }, reason);
      } else {
        await audit(req, "refund.reconciliation_verified", "RefundRequest", refund._id, { status: refund.status, providerRefundId: refund.providerRefundId }, { status: refund.status, providerRefundId, providerStatus }, reason);
      }
      return success(res, { refund, payment, providerStatus, paymentStatusRepaired: true }, "Previously processed refund verified; payment status reconciled");
    }

    reconciliationToken = crypto.randomUUID();
    reconciliationRefundId = String(refund._id);
    const leaseCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const claimedRefund = await RefundRequest.findOneAndUpdate(
      {
        _id: refund._id,
        status: "approved",
        $or: [
          { reconciliationToken: { $exists: false } },
          { reconciliationToken: null },
          { reconciliationStartedAt: { $exists: false } },
          { reconciliationStartedAt: { $lte: leaseCutoff } }
        ]
      },
      { $set: { reconciliationToken, reconciliationStartedAt: new Date() } },
      { new: true }
    );
    if (!claimedRefund) {
      reconciliationToken = "";
      reconciliationRefundId = "";
      return failure(res, "Another administrator is already reconciling this refund. Refresh the request before retrying.", 409);
    }
    refund = claimedRefund;
    const before = { status: refund.status, providerRefundId: refund.providerRefundId || "", decisionReason: refund.decisionReason || "" };
    refund.decisionReason = reason;
    if (providerStatus === "processed") {
      const remainingAmount = await getRemainingRefundableAmount(payment._id, payment.amount, refund._id);
      if (refund.amount > remainingAmount || remainingAmount <= 0) {
        await RefundRequest.updateOne(
          { _id: refund._id, reconciliationToken },
          { $unset: { reconciliationToken: "", reconciliationStartedAt: "" } }
        );
        reconciliationToken = "";
        reconciliationRefundId = "";
        return failure(res, "Provider confirms a refund, but the local refundable balance is inconsistent. Escalate for finance review.", 409);
      }
      refund.status = "processed";
      refund.set("activePaymentKey", undefined);
      refund.set("reconciliationToken", undefined);
      refund.set("reconciliationStartedAt", undefined);
      refund.providerRefundId = providerRefundId;
      refund.processedAt = new Date();
      refund.processedBy = req.user.user?._id || req.user.userId;
      refund.adminNote = [refund.adminNote, "Provider refund verified during reconciliation."].filter(Boolean).join("\n").slice(0, 2000);
      payment.status = paymentStatusForRemainingBalance(remainingAmount - refund.amount);
      // Persist the provider-confirmed refund first. If the payment write fails,
      // the idempotent processed-refund path above repairs payment status on retry.
      await refund.save();
      await audit(req, "refund.reconciled", "RefundRequest", refund._id, before, {
        status: refund.status,
        providerRefundId,
        providerStatus
      }, reason);
      await RefundRequest.updateOne(
        { _id: refund._id, reconciliationToken },
        { $unset: { reconciliationToken: "", reconciliationStartedAt: "" } }
      );
      reconciliationToken = "";
      reconciliationRefundId = "";
      await payment.save();

      try {
        await createNotificationEvent({
          userId: String(refund.user),
          title: "Your refund has been processed",
          message: `Your refund of ${payment.currency || "INR"} ${refund.amount} has been verified with the payment provider and marked as processed.`,
          type: "billing",
          link: "/billing",
          eventKey: `refund-status:${refund._id}:processed`,
          emailSubject: "Your BuddyForStudy refund has been processed",
          metadata: { refundId: String(refund._id), paymentId: String(payment._id), amount: String(refund.amount), currency: payment.currency || "INR", status: "processed" },
          templateKeys: { notification: "refund-status-in-app", email: "refund-status-email" }
        });
      } catch (notificationError) {
        console.error("[notifications] reconciled refund notice failed", {
          refundId: String(refund._id),
          message: String(notificationError?.message || "Unknown notification error").slice(0, 200)
        });
      }
      return success(res, { refund, providerStatus }, "Provider refund verified and reconciled");
    }

    if (["failed", "rejected"].includes(providerStatus)) {
      refund.status = "pending";
      refund.set("reconciliationToken", undefined);
      refund.set("reconciliationStartedAt", undefined);
      refund.providerRefundId = "";
      refund.processedAt = null;
      refund.adminNote = [refund.adminNote, `Provider reports refund status '${providerStatus}'. Retry is now allowed.`].filter(Boolean).join("\n").slice(0, 2000);
      await refund.save();
      await RefundRequest.updateOne(
        { _id: refund._id, reconciliationToken },
        { $unset: { reconciliationToken: "", reconciliationStartedAt: "" } }
      );
      reconciliationToken = "";
      reconciliationRefundId = "";
      await audit(req, "refund.reconciliation_failed", "RefundRequest", refund._id, before, {
        status: refund.status,
        providerRefundId,
        providerStatus
      }, reason);
      return success(res, { refund, providerStatus }, "Provider confirmed the refund did not complete; the request is available for retry");
    }

    refund.set("reconciliationToken", undefined);
    refund.set("reconciliationStartedAt", undefined);
    refund.adminNote = [refund.adminNote, `Provider reconciliation checked refund ${providerRefundId}; current provider status is '${providerStatus || "unknown"}'.`].filter(Boolean).join("\n").slice(0, 2000);
    await refund.save();
    await RefundRequest.updateOne(
      { _id: refund._id, reconciliationToken },
      { $unset: { reconciliationToken: "", reconciliationStartedAt: "" } }
    );
    reconciliationToken = "";
    reconciliationRefundId = "";
    await audit(req, "refund.reconciliation_pending", "RefundRequest", refund._id, before, {
      status: refund.status,
      providerRefundId,
      providerStatus
    }, reason);
    return success(res, { refund, providerStatus }, "Provider refund is not final yet; internal refund remains on hold");
  } catch (e) {
    if (reconciliationToken && reconciliationRefundId) {
      await RefundRequest.updateOne(
        { _id: reconciliationRefundId, reconciliationToken },
        { $unset: { reconciliationToken: "", reconciliationStartedAt: "" } }
      ).catch(() => {});
    }
    next(e);
  }
}

export async function notificationAudienceOptions(req, res, next) {
  try {
    const [plans, courses] = await Promise.all([
      SubscriptionPlan.find({}).select("name price currency billingInterval isActive isPopular sortOrder").sort({ sortOrder: 1, price: 1 }).limit(500).lean(),
      Course.find({}).select("title category level isPublished pricing featured").sort({ title: 1 }).limit(1000).lean()
    ]);
    const popularCourseRows = await Enrollment.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      { $group: { _id: "$course", enrollmentCount: { $sum: 1 } } },
      { $sort: { enrollmentCount: -1, _id: 1 } },
      { $limit: 5 }
    ]);
    return success(res, {
      plans: plans.map((plan) => ({
        id: String(plan._id), name: plan.name, price: plan.price, currency: plan.currency,
        billingInterval: plan.billingInterval, isActive: plan.isActive, isPopular: plan.isPopular
      })),
      courses: courses.map((course) => ({
        id: String(course._id), title: course.title, category: course.category, level: course.level,
        isPublished: course.isPublished, pricingMode: course.pricing?.mode || "free",
        price: Number(course.pricing?.price || 0), featured: Boolean(course.featured)
      })),
      popularCourseIds: popularCourseRows.map((item) => String(item._id))
    });
  } catch (error) { next(error); }
}

export async function previewNotificationAudience(req, res, next) {
  try {
    let audienceInput = req.body || {};
    if (audienceInput.email !== undefined) {
      const email = String(audienceInput.email || "").trim().toLowerCase();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return failure(res, "Enter a valid recipient email address", 400);
      audienceInput = { ...audienceInput, emails: [email] };
    }
    validateAdminAudienceInput(audienceInput);
    const users = await resolveAdminAudience(audienceInput, { select: "_id name email role isActive emailVerified authProvider createdAt", limit: 5001 });
    const truncated = users.length > 5000;
    return success(res, {
      recipientCount: truncated ? 5000 : users.length,
      truncated,
      previewToken: createAdminAudiencePreviewToken(audienceInput, users),
      sample: users.slice(0, 10).map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt
      }))
    }, truncated ? "Audience preview capped at 5,000 recipients; narrow the filters before sending." : "Audience preview ready");
  } catch (error) {
    if (error instanceof Error && /invalid|must be|cannot|choose|select|filters|audience|exceed|later than/i.test(error.message)) return failure(res, error.message, 400);
    next(error);
  }
}

export async function sendNotification(req, res, next) {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const type = req.body.type || "system";
    const link = typeof req.body.link === "string" ? req.body.link.trim().slice(0, 1000) : "";
    if (!title || !message) return failure(res, "title and message are required", 400);
    if (title.length > 200) return failure(res, "title must be 200 characters or fewer", 400);
    if (message.length > 5000) return failure(res, "message must be 5000 characters or fewer", 400);
    if (!["system", "course", "billing", "promotion", "security"].includes(type)) {
      return failure(res, "Invalid notification type", 400);
    }
    try { validateAdminAudienceInput(req.body); } catch (error) { return failure(res, error.message, 400); }
    let users;
    try {
      users = await resolveAdminAudience(req.body, { select: "_id", limit: 5001 });
    } catch (error) { return failure(res, error.message, 400); }
    if (users.length > 5000) return failure(res, "This audience exceeds 5,000 recipients. Narrow the filters and preview again before sending.", 400);
    if (!verifyAdminAudiencePreviewToken(req.body.previewToken, req.body, users)) {
      return failure(res, "Audience preview is missing, expired, or no longer matches these recipients. Preview the audience again before sending.", 409);
    }
    const broadcastId = new mongoose.Types.ObjectId().toString();
    await mapWithConcurrency(users, (user) => createNotificationEvent({
      userId: String(user._id),
      title,
      message,
      type,
      link,
      eventKey: `admin-notification:${broadcastId}:${user._id}`,
      email: false,
      push: false,
      metadata: { source: "admin-broadcast", broadcastId, initiatedBy: String(req.user.user._id) }
    }));
    await audit(req, "notification.sent", "Notification", broadcastId, null, { recipients: users.length, title, type });
    return success(res, { sent: users.length }, "Notification queued");
  } catch (e) { next(e); }
}

export async function sendEmail(req, res, next) {
  try {
    const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
    const html = typeof req.body.html === "string" ? req.body.html : "";
    if (!subject || !html) return failure(res, "subject and html are required", 400);
    if (subject.length > 200 || html.length > 20000) return failure(res, "Email subject or HTML body is too long", 400);
    if (hasUnsafeEmailMarkup(html)) return failure(res, "Email HTML contains unsafe tags, attributes, or URL schemes", 400);

    try { validateAdminAudienceInput(req.body); } catch (error) { return failure(res, error.message, 400); }
    let users = [];
    let externalEmail = "";
    if (req.body.email) {
      externalEmail = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(externalEmail)) return failure(res, "Enter a valid recipient email address", 400);
      const knownUser = await User.findOne({ email: externalEmail }).select("_id email name");
      if (knownUser) users = [knownUser];
    } else {
      try {
        users = await resolveAdminAudience(req.body, { select: "_id email name", limit: 5001 });
      } catch (error) { return failure(res, error.message, 400); }
    }

    if (externalEmail && users.length === 0) {
      return failure(res, "Campaign email can only be sent to registered users so their notification preferences and consent can be checked.", 400);
    }

    if (users.length > 5000) return failure(res, "This audience exceeds 5,000 recipients. Narrow the filters and preview again before sending.", 400);
    const audienceInput = externalEmail ? { ...req.body, emails: [externalEmail] } : req.body;
    if (!verifyAdminAudiencePreviewToken(req.body.previewToken, audienceInput, users)) {
      return failure(res, "Audience preview is missing, expired, or no longer matches these recipients. Preview the audience again before sending.", 409);
    }
    if (!users.length) return success(res, { queued: 0, skipped: 0, recipients: 0 }, "No recipients matched the selected audience");
    const broadcastId = new mongoose.Types.ObjectId().toString();
    const results = await mapWithConcurrency(users, (user) => createNotificationEvent({
      userId: String(user._id),
      title: subject,
      message: "A message from BuddyForStudy has arrived in your email.",
      type: "promotion",
      link: "/notifications",
      eventKey: `admin-email-campaign:${broadcastId}:${user._id}`,
      emailSubject: subject,
      emailHtmlOverride: html,
      email: true,
      inApp: false,
      push: false,
      metadata: { source: "admin-email-campaign", broadcastId, initiatedBy: String(req.user.user._id) }
    }));
    const queued = results.filter((item) => item?.emailStatus === "pending").length;
    const skipped = results.filter((item) => item?.emailStatus === "skipped").length;
    await audit(req, "email.queued", "EmailCampaign", broadcastId, null, {
      recipients: users.length,
      queued,
      skipped,
      subject
    });
    return success(res, { queued, sent: queued, skipped, recipients: users.length, broadcastId }, "Email campaign queued");
  } catch (e) { next(e); }
}

export async function sendAnnouncement(req, res, next) {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!title || !message) return failure(res, "title and message are required", 400);
    const channel = parseAnnouncementChannels(req.body.channel);
    if (!channel) return failure(res, "Choose one or more valid announcement channels", 400);

    try { validateAdminAudienceInput(req.body); } catch (error) { return failure(res, error.message, 400); }
    const targetMode = (Array.isArray(req.body.userIds) && req.body.userIds.length) || (Array.isArray(req.body.emails) && req.body.emails.length)
      ? "selected"
      : req.body.filters && Object.keys(req.body.filters).length
        ? "filtered"
        : "audience";
    let users;
    try { users = await resolveAdminAudience(req.body, { select: "_id email name", limit: 5000 }); }
    catch (error) { return failure(res, error.message, 400); }
    if (users.length > 5000) return failure(res, "This audience exceeds 5,000 recipients. Narrow the filters and preview again before sending.", 400);
    if (!verifyAdminAudiencePreviewToken(req.body.previewToken, req.body, users)) {
      return failure(res, "Audience preview is missing, expired, or no longer matches these recipients. Preview the audience again before sending.", 409);
    }
    const announcement = await Announcement.create({
      title,
      message,
      audience: req.body.audience || "all",
      targetMode,
      targetUserIds: targetMode === "selected" ? users.map((user) => user._id) : [],
      targetFilters: targetMode === "filtered" ? req.body.filters : {},
      channel,
      link: typeof req.body.link === "string" ? req.body.link.trim().slice(0, 1000) : "",
      status: "sent",
      sentAt: new Date(),
      createdBy: req.user.user._id
    });
    const results = await mapWithConcurrency(users, (user) => createNotificationEvent({
      userId: String(user._id),
      title: announcement.title,
      message: announcement.message,
      type: "promotion",
      link: announcement.link,
      eventKey: `announcement:${announcement._id}:${user._id}`,
      inApp: channel.includes("in_app"),
      email: channel.includes("email"),
      push: channel.includes("push"),
      metadata: { source: "admin-announcement", announcementId: String(announcement._id) }
    }));
    await audit(req, "announcement.sent", "Announcement", announcement._id, null, {
      audience: announcement.audience,
      targetMode: announcement.targetMode,
      filterKeys: announcement.targetMode === "filtered" ? Object.keys(req.body.filters || {}) : [],
      recipients: users.length,
      requestedChannels: channel,
      inAppVisible: results.filter((item) => item?.showInApp).length,
      emailsQueued: results.filter((item) => item?.emailStatus === "pending").length,
      pushQueued: results.filter((item) => item?.pushStatus === "pending").length
    });
    return success(res, {
      announcement,
      recipients: users.length,
      emailsQueued: results.filter((item) => item?.emailStatus === "pending").length,
      pushQueued: results.filter((item) => item?.pushStatus === "pending").length
    }, "Announcement queued", 201);
  } catch (e) { next(e); }
}

export async function settings(req, res, next) {
  try {
    const settings = await PlatformSetting.find().sort({ key: 1 }).lean();
    const permissions = new Set(getAdminPermissions(req.user?.adminRole || "platform_admin", req.user?.adminPermissionOverrides || []));
    if (!permissions.has("settings.manage")) {
      return success(res, { settings: settings.map(({ _id, key, description, isPublic, updatedAt }) => ({ _id, key, description, isPublic, updatedAt, value: undefined })) });
    }
    return success(res, { settings });
  } catch (e) { next(e); }
}

export async function deleteSetting(req, res, next) {
  try {
    if (!isValidObjectId(req.params.settingId)) return failure(res, "Invalid settingId", 400);
    const setting = await PlatformSetting.findById(req.params.settingId);
    if (!setting) return failure(res, "Setting not found", 404);

    const metadata = {
      key: setting.key,
      valueType: setting.value === null ? "null" : Array.isArray(setting.value) ? "array" : typeof setting.value,
      isPublic: setting.isPublic
    };
    await setting.deleteOne();
    await audit(req, "setting.deleted", "PlatformSetting", setting._id, metadata, null, req.body?.reason || "");
    return success(res, { deleted: true, key: setting.key }, "Setting deleted");
  } catch (e) { next(e); }
}
export async function upsertSetting(req, res, next) {
  try {
    if (!req.body.key) return failure(res, "key is required", 400);
    const typedValidation = validateTypedSetting(req.body.key, req.body.value);
    if (!typedValidation.valid) return failure(res, typedValidation.message, 400);
    const current = await PlatformSetting.findOne({ key: req.body.key });
    const before = current?.value ?? null;
    const setting = await PlatformSetting.findOneAndUpdate({ key: req.body.key }, { $set: { value: req.body.value, description: req.body.description || "", isPublic: Boolean(req.body.isPublic), updatedBy: req.user.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await audit(req, "setting.updated", "PlatformSetting", setting._id, {
      valueChanged: true,
      valueType: before === null ? "null" : Array.isArray(before) ? "array" : typeof before
    }, {
      valueChanged: true,
      valueType: setting.value === null ? "null" : Array.isArray(setting.value) ? "array" : typeof setting.value,
      isPublic: setting.isPublic
    }, req.body.reason);
    return success(res, { setting }, "Setting updated");
  } catch (e) { next(e); }
}

export async function coupons(req, res, next) {
  try { return success(res, { coupons: await Coupon.find().populate("course", "title").sort({ createdAt: -1 }).lean() }); }
  catch (e) { next(e); }
}

export async function bulkCreateCoupons(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for bulk coupon generation.", 400);
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 100) return failure(res, "Bulk coupon count must be an integer from 1 to 100.", 400);
    const prefix = String(req.body?.prefix || "BFS").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,20}$/.test(prefix)) return failure(res, "Coupon prefix must contain 1–20 letters, numbers, underscores or hyphens.", 400);
    const template = { ...req.body, code: prefix + "-TEMP", type: req.body.type || "percentage", isActive: true };
    const validation = validateCouponAdminInput(template);
    if (!validation.valid) return res.status(400).json({ success: false, message: "Coupon template contains invalid fields", errors: validation.errors });
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const code = prefix + "-" + crypto.randomBytes(5).toString("hex").toUpperCase();
      const coupon = await Coupon.create({
        code, type: template.type, value: Number(template.value),
        maxDiscount: template.maxDiscount == null || template.maxDiscount === "" ? null : Number(template.maxDiscount),
        minOrderAmount: Number(template.minOrderAmount) || 0,
        usageLimit: template.usageLimit == null || template.usageLimit === "" ? null : Number(template.usageLimit),
        expiresAt: template.expiresAt || null,
        course: isValidObjectId(template.course) ? template.course : null,
        isActive: true
      });
      await audit(req, "coupon.bulk_created", "Coupon", coupon._id, null, {
        code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount,
        minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt,
        course: coupon.course, isActive: coupon.isActive, batchPrefix: prefix, batchSize: count
      }, reason);
      created.push(coupon);
    }
    return success(res, { coupons: created, count: created.length, prefix }, "Bulk coupons generated", 201);
  } catch (e) { next(e); }
}

export async function createCoupon(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for coupon creation.", 400);
    const couponInput = { ...req.body, type: req.body.type || "percentage" };
    const validation = validateCouponAdminInput(couponInput);
    if (!validation.valid) return res.status(400).json({ success: false, message: "Coupon contains invalid fields", errors: validation.errors });
    const coupon = await Coupon.create({
      code: req.body.code, type: req.body.type || "percentage", value: Number(req.body.value) || 0,
      maxDiscount: req.body.maxDiscount == null ? null : Number(req.body.maxDiscount), minOrderAmount: Number(req.body.minOrderAmount) || 0,
      usageLimit: req.body.usageLimit == null ? null : Number(req.body.usageLimit), expiresAt: req.body.expiresAt || null,
      course: isValidObjectId(req.body.course) ? req.body.course : null, isActive: req.body.isActive !== false
    });
    await audit(req, "coupon.created", "Coupon", coupon._id, null, { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt, course: coupon.course, isActive: coupon.isActive }, reason);
    return success(res, { coupon }, "Coupon created", 201);
  } catch (e) { next(e); }
}

export async function updateCoupon(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for coupon changes.", 400);
    if (!isValidObjectId(req.params.couponId)) return failure(res, "Invalid couponId", 400);
    const coupon = await Coupon.findById(req.params.couponId); if (!coupon) return failure(res, "Coupon not found", 404);
    const validation = validateCouponAdminInput(req.body, {
      code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount,
      minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt,
      isActive: coupon.isActive
    });
    if (!validation.valid) return res.status(400).json({ success: false, message: "Coupon contains invalid fields", errors: validation.errors });
    const before = { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt, course: coupon.course, isActive: coupon.isActive };
    for (const key of ["type","value","maxDiscount","minOrderAmount","usageLimit","expiresAt","isActive"]) if (req.body[key] !== undefined) coupon[key] = req.body[key];
    await coupon.save(); await audit(req, "coupon.updated", "Coupon", coupon._id, before, { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt, course: coupon.course, isActive: coupon.isActive }, reason);
    return success(res, { coupon }, "Coupon updated");
  } catch (e) { next(e); }
}

export async function auditLogs(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    // Treat search input as literal text, not a user-supplied regular expression.
    const q = String(req.query.q || "").trim().slice(0, 100);
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {};
    if (escapedQuery) {
      const searchPattern = new RegExp(escapedQuery, "i");
      filter.$or = [
        { action: searchPattern },
        { targetType: searchPattern },
        { targetId: searchPattern },
        { reason: searchPattern }
      ];
    }
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.targetType) filter.targetType = String(req.query.targetType);
    const logs = await AuditLog.find(filter).populate("actor", "name email").sort({ createdAt: -1 }).limit(limit).lean();
    return success(res, { logs });
  } catch (e) { next(e); }
}


export async function analytics(req, res, next) {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const now = new Date();

    const [enrollmentsDaily, paymentsDaily, refundsDaily, coursePerformance, subscriptionBreakdown, completionBreakdown, newUsers, payingUsers, failedPayments] = await Promise.all([
      Enrollment.aggregate([
        { $match: { createdAt: { $gte: since, $lte: now } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Payment.aggregate([
        { $match: { status: { $in: GROSS_COLLECTION_PAYMENT_STATUSES }, $or: [{ paidAt: { $gte: since, $lte: now } }, { paidAt: null, createdAt: { $gte: since, $lte: now } }] } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$paidAt", "$createdAt"] } } },
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
          users: { $addToSet: "$user" }
        } },
        { $project: { _id: 1, amount: 1, count: 1, payingUsers: { $size: "$users" } } },
        { $sort: { _id: 1 } }
      ]),
      RefundRequest.aggregate([
        { $match: { status: "processed", processedAt: { $gte: since, $lte: now } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$processedAt" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Enrollment.aggregate([
        { $group: { _id: "$course", enrollments: { $sum: 1 } } },
        { $sort: { enrollments: -1 } },
        { $limit: 10 },
        { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, enrollments: 1, title: "$course.title", published: "$course.isPublished", pricingMode: "$course.pricing.mode" } }
      ]),
      UserSubscription.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Progress.aggregate([
        { $bucket: { groupBy: "$percentage", boundaries: [0, 25, 50, 75, 100, 101], default: "other", output: { count: { $sum: 1 } } } }
      ]),
      User.countDocuments({ createdAt: { $gte: since, $lte: now } }),
      Payment.distinct("user", { status: { $in: ["paid", "partially_refunded"] }, $or: [{ paidAt: { $gte: since, $lte: now } }, { paidAt: null, createdAt: { $gte: since, $lte: now } }] }),
      Payment.countDocuments({ status: "failed", updatedAt: { $gte: since, $lte: now } })
    ]);

    const daily = new Map();
    for (const item of paymentsDaily) {
      daily.set(item._id, { _id: item._id, amount: Number(item.amount || 0), grossPayments: Number(item.amount || 0), refunds: 0, paymentCount: Number(item.count || 0), refundCount: 0 });
    }
    for (const item of refundsDaily) {
      const current = daily.get(item._id) || { _id: item._id, amount: 0, grossPayments: 0, refunds: 0, paymentCount: 0, refundCount: 0 };
      current.refunds += Number(item.amount || 0);
      current.amount = calculateNetRevenue(current.grossPayments, current.refunds);
      current.refundCount += Number(item.count || 0);
      daily.set(item._id, current);
    }
    const revenueDaily = [...daily.values()].sort((a, b) => a._id.localeCompare(b._id));
    const totalEnrollments = enrollmentsDaily.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const grossRevenue = paymentsDaily.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalRefunds = refundsDaily.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return success(res, {
      period: { days, since, until: now },
      enrollmentsDaily,
      revenueDaily,
      coursePerformance,
      subscriptionBreakdown,
      completionBreakdown,
      totals: {
        enrollments: totalEnrollments,
        newUsers,
        payingUsers: payingUsers.length,
        failedPayments,
        grossRevenue,
        processedRefunds: totalRefunds,
        netRevenue: calculateNetRevenue(grossRevenue, totalRefunds),
        recordedRevenue: calculateNetRevenue(grossRevenue, totalRefunds)
      }
    });
  } catch (e) { next(e); }
}

export async function health(req, res, next) {
  try {
    const dbState = mongoose.connection.readyState === 1;
    return success(res, { service: "BuddyForStudy API", database: dbState ? "connected" : "disconnected", uptimeSeconds: Math.round(process.uptime()), node: process.version, environment: env.nodeEnv });
  } catch (e) { next(e); }
}


export async function paymentIssueAssignees(req, res, next) {
  try {
    const users = await User.find({ role: "admin", isActive: true }).select("name email adminRole").sort({ name: 1 }).limit(200).lean();
    return success(res, { assignees: users.map((user) => ({ id: String(user._id), name: user.name, email: user.email, role: user.adminRole || "platform_admin" })) });
  } catch (e) { next(e); }
}

export async function paymentIssues(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const status = String(req.query.status || "").trim();
    const allowedStatuses = ["open", "in_review", "resolved", "closed"];
    const filter = {};
    if (status && allowedStatuses.includes(status)) filter.status = status;
    const canReadSupportPrivate = hasAdminPermission(req.user?.adminRole, "payment_issues.manage", req.user?.adminPermissionOverrides);
    let query = PaymentIssue.find(filter)
      .populate("user", "name email")
      .populate({ path: "payment", select: "amount currency status provider providerPaymentId providerOrderId createdAt course plan", populate: [{ path: "course", select: "title" }, { path: "plan", select: "name" }] });
    if (canReadSupportPrivate) {
      query = query.populate("assignedTo", "name email adminRole").populate("internalNotes.author", "name email");
    }
    const issues = await query.sort({ createdAt: -1 }).limit(limit).lean();
    return success(res, { issues: canReadSupportPrivate ? issues : issues.map(({ assignedTo, internalNotes, ...issue }) => issue) });
  } catch (e) { next(e); }
}

export async function updatePaymentIssue(req, res, next) {
  try {
    if (!isValidObjectId(req.params.issueId)) return failure(res, "Invalid issue ID", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason of 10–500 characters is required for support case changes.", 400);
    const status = String(req.body?.status || "").trim();
    const allowedStatuses = ["open", "in_review", "resolved", "closed"];
    if (!allowedStatuses.includes(status)) return failure(res, "Invalid issue status", 400);
    const adminNote = typeof req.body?.adminNote === "string" ? req.body.adminNote.trim().slice(0, 2000) : "";
    const internalNote = typeof req.body?.internalNote === "string" ? req.body.internalNote.trim().slice(0, 2000) : "";
    const assignmentProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "assignedTo");
    const assignedTo = !assignmentProvided ? undefined : (req.body.assignedTo === null || req.body.assignedTo === "" ? null : req.body.assignedTo);
    if (assignedTo && !isValidObjectId(assignedTo)) return failure(res, "Invalid assignee ID", 400);
    if (assignedTo) {
      const assignee = await User.findOne({ _id: assignedTo, role: "admin", isActive: true }).select("_id");
      if (!assignee) return failure(res, "Assignee must be an active administrator.", 400);
    }
    const currentIssue = await PaymentIssue.findById(req.params.issueId);
    if (!currentIssue) return failure(res, "Payment issue not found", 404);
    if (["resolved", "closed"].includes(currentIssue.status) && status !== currentIssue.status) {
      return failure(res, "Resolved or closed payment issues cannot be reopened. Create a new report if further help is needed.", 409);
    }
    const before = { status: currentIssue.status, adminNote: currentIssue.adminNote, assignedTo: currentIssue.assignedTo ? String(currentIssue.assignedTo) : null, internalNoteCount: currentIssue.internalNotes?.length || 0 };
    const nowResolved = ["resolved", "closed"].includes(status);
    let issue;
    try {
      issue = await PaymentIssue.findOneAndUpdate(
        { _id: currentIssue._id, status: currentIssue.status },
        {
          $set: {
            status,
            adminNote,
            ...(assignmentProvided ? { assignedTo } : {}),
            resolvedAt: nowResolved ? (currentIssue.resolvedAt || new Date()) : null,
            resolvedBy: nowResolved ? (currentIssue.resolvedBy || req.user.user?._id || req.user.userId) : null,
            ...(nowResolved ? {} : { activePaymentKey: currentIssue.payment })
          },
          ...(internalNote ? { $push: { internalNotes: { author: req.user.user?._id || req.user.userId, note: internalNote, reason, createdAt: new Date() } } } : {}),
          ...(nowResolved ? { $unset: { activePaymentKey: "" } } : {})
        },
        { new: true, runValidators: true }
      );
    } catch (updateError) {
      if (updateError?.code === 11000) {
        return failure(res, "Another active report already exists for this payment.", 409);
      }
      throw updateError;
    }
    if (!issue) return failure(res, "This payment issue was updated by another administrator. Refresh and try again.", 409);
    await audit(req, "payment_issue.updated", "PaymentIssue", String(issue._id), before, { status: issue.status, adminNote: issue.adminNote, assignedTo: issue.assignedTo ? String(issue.assignedTo) : null, internalNoteCount: issue.internalNotes?.length || 0 }, reason);
    try {
      if (status !== before.status || adminNote !== before.adminNote) await createNotificationEvent({
        userId: String(issue.user),
        title: status === "resolved" ? "Payment issue resolved" : "Payment report updated",
        message: adminNote || (status === "resolved" ? "Your payment issue has been marked as resolved." : `Your payment issue status is now ${status.replace(/_/g, " ")}.`),
        type: "billing",
        link: "/billing",
        eventKey: `payment-issue-status:${issue._id}:${status}:${issue.updatedAt.getTime()}`,
        emailSubject: "Update on your BuddyForStudy payment issue",
        metadata: { issueId: String(issue._id), status },
        templateKeys: { notification: "payment-issue-status-updated-in-app", email: "payment-issue-status-updated-email" }
      });
    } catch (notificationError) {
      console.error("[notifications] payment issue status notice failed", {
        issueId: String(issue._id),
        message: String(notificationError?.message || "Unknown notification error").slice(0, 200)
      });
    }
    return success(res, { issue }, "Payment issue updated");
  } catch (e) { next(e); }
}

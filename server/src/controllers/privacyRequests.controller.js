import { z } from "zod";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { success, failure } from "../utils/response.js";
import { User } from "../models/User.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { LearningRoadmap } from "../models/LearningRoadmap.js";
import { Review } from "../models/Review.js";
import { SavedCourse } from "../models/SavedCourse.js";
import { CourseQuizAttempt } from "../models/CourseQuizAttempt.js";
import { LearningStats } from "../models/LearningStats.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { PaymentIssue } from "../models/PaymentIssue.js";
import { Notification } from "../models/Notification.js";
import { NotificationPreference } from "../models/NotificationPreference.js";
import { UserConsentEvent } from "../models/UserConsentEvent.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { CourseCurationFeedback } from "../models/CourseCurationFeedback.js";
import { AIQuestionAsk } from "../models/AIQuestionAsk.js";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { DataPrivacyRequest, DATA_PRIVACY_REQUEST_STATUSES } from "../models/DataPrivacyRequest.js";

const requestSchema = z.object({
  type: z.enum(["correction", "deletion"]),
  description: z.string().trim().min(10).max(1500),
  dataCategories: z.array(z.enum([
    "profile", "learning", "ai_interactions", "notifications", "preferences",
    "subscriptions", "payments", "communications", "other"
  ])).max(9).default([]),
}).strict();

const adminUpdateSchema = z.object({
  status: z.enum([
    "identity_pending", "in_review", "legal_hold", "approved",
    "in_progress", "partially_fulfilled", "denied", "appealed"
  ]),
  identityVerified: z.boolean().optional(),
  reviewerNote: z.string().trim().min(10).max(500),
}).strict();

const allowedTransitions = Object.freeze({
  received: ["identity_pending", "in_review", "legal_hold", "denied"],
  identity_pending: ["in_review", "legal_hold", "denied"],
  in_review: ["identity_pending", "legal_hold", "approved", "denied"],
  legal_hold: ["in_review", "denied"],
  approved: ["in_progress", "legal_hold"],
  in_progress: ["partially_fulfilled", "legal_hold"],
  partially_fulfilled: ["in_progress", "legal_hold"],
  denied: ["appealed"],
  appealed: ["identity_pending", "in_review", "legal_hold", "denied"],
  fulfilled: [],
});

function authenticatedUserId(req) {
  return String(req.user?.userId || req.user?.user?._id || "");
}

function actorId(req) {
  return req.user?.user?._id || req.user?.userId;
}

function serializeLearnerRequest(request) {
  const value = request?.toObject ? request.toObject() : request;
  return {
    requestId: value.requestId,
    type: value.type,
    description: value.description,
    dataCategories: value.dataCategories || [],
    status: value.status,
    identityVerifiedAt: value.identityVerifiedAt || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function serializeAdminRequest(request) {
  const value = request?.toObject ? request.toObject() : request;
  const requester = value.user && typeof value.user === "object" && value.user.name
    ? { id: String(value.user._id), name: value.user.name, email: value.user.email }
    : { id: String(value.user || "") };
  return {
    requestId: value.requestId,
    user: requester,
    type: value.type,
    description: value.description,
    dataCategories: value.dataCategories || [],
    status: value.status,
    identityVerifiedAt: value.identityVerifiedAt || null,
    identityVerifiedBy: value.identityVerifiedBy || null,
    reviewerNote: value.reviewerNote || "",
    reviewedBy: value.reviewedBy || null,
    reviewedAt: value.reviewedAt || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/**
 * Produce a requester-scoped JSON export from the user-owned collections currently
 * inventoried in the server. Each query is keyed by the authenticated principal.
 * Provider credentials, private delivery internals and security credentials are
 * intentionally excluded.
 */
export async function exportMyData(req, res, next) {
  try {
    const userId = authenticatedUserId(req);
    const user = await User.findById(userId).select(
      "name email role isActive authProvider profileImage phoneNumber phoneNumberVerified city learningGoal " +
      "profileSetupSkippedAt termsAcceptedVersion termsAcceptedAt privacyAcknowledgedVersion privacyAcknowledgedAt " +
      "marketingEmailConsent marketingEmailConsentAt createdAt updatedAt"
    ).lean();

    if (!user) return failure(res, "Account was not found.", 404);

    const [
      enrollments, progress, roadmaps, reviews, savedCourses, quizAttempts, learningStats,
      subscriptions, payments, refunds, paymentIssues, notifications, notificationPreferences,
      consentEvents, pushSubscriptions, curationFeedback, aiQuestions, roadmapDrafts, trialGrants
    ] = await Promise.all([
      Enrollment.find({ user: userId }).select("course enrolledAt status learningStatus accessSource accessReason createdAt updatedAt")
        .populate("course", "title slug category level").lean(),
      Progress.find({ user: userId }).select("course completedLessons completedCount totalLessons percentage lastLessonId lastAccessedAt createdAt updatedAt")
        .populate("course", "title slug").lean(),
      LearningRoadmap.find({ user: userId }).select("-__v").lean(),
      Review.find({ user: userId }).select("course rating comment moderationStatus createdAt updatedAt")
        .populate("course", "title slug").lean(),
      SavedCourse.find({ user: userId }).select("course savedAt createdAt")
        .populate("course", "title slug category level").lean(),
      CourseQuizAttempt.find({ user: userId }).select("course lesson answers score passed correctCount questionCount attemptedAt createdAt")
        .populate("course", "title slug").lean(),
      LearningStats.findOne({ user: userId }).select("-__v").lean(),
      UserSubscription.find({ user: userId }).select("plan status provider currentPeriodStart currentPeriodEnd cancelAtPeriodEnd cancelledAt createdAt updatedAt")
        .populate("plan", "name slug price currency billingInterval features").lean(),
      Payment.find({ user: userId }).select("course plan amount currency status provider paidAt createdAt updatedAt")
        .populate("course", "title slug").populate("plan", "name slug").lean(),
      RefundRequest.find({ user: userId }).select("payment amount reason status createdAt updatedAt processedAt").lean(),
      PaymentIssue.find({ user: userId }).select("payment category description status createdAt updatedAt").lean(),
      Notification.find({ user: userId }).select("title message type metadata showInApp link readAt createdAt").lean(),
      NotificationPreference.findOne({ user: userId }).select("-__v").lean(),
      UserConsentEvent.find({ user: userId }).select("type version accepted preferences source changedFields createdAt").lean(),
      PushSubscription.find({ user: userId }).select("active expirationTime lastSuccessAt lastFailureAt createdAt updatedAt").lean(),
      CourseCurationFeedback.find({ user: userId }).select("query normalizedQuery event skillId courseId resourceType resourceId engineVersion rank score createdAt").lean(),
      AIQuestionAsk.find({ user: userId }).select("course lesson questionHash answerCacheId askedAt createdAt")
        .populate("answerCacheId", "question answer model createdAt").lean(),
      RoadmapDraft.find({ userId }).select("draftId query goal profile status roadmapId result createdAt updatedAt").lean(),
      TrialGrant.find({ user: userId }).select("plan campaignName reason startsAt endsAt status conversionPlan conversionConsentStatus createdAt updatedAt")
        .populate("plan", "name slug price currency").populate("conversionPlan", "name slug price currency billingInterval").lean(),
    ]);

    const payload = {
      format: "buddyforstudy.account-export.v1",
      exportedAt: new Date().toISOString(),
      exportCoverage: "partial_repository_inventory",
      account: {
        id: String(user._id),
        profile: user,
      },
      data: {
        enrollments,
        courseProgress: progress,
        personalizedRoadmaps: roadmaps,
        courseReviews: reviews,
        savedCourses,
        quizAttempts,
        learningStatistics: learningStats,
        subscriptions,
        payments,
        refundRequests: refunds,
        paymentIssues,
        notifications,
        notificationPreferences,
        consentHistory: consentEvents,
        pushDeviceStatus: pushSubscriptions,
        courseDiscoveryFeedback: curationFeedback,
        aiQuestionHistory: aiQuestions,
        recentRoadmapDrafts: roadmapDrafts,
        trialGrants,
      },
      exclusions: [
        "Passwords, password hashes, authentication tokens, OTPs, provider credentials and secrets are never included.",
        "Payment-provider order/payment identifiers and provider reconciliation tokens are excluded from this export.",
        "Internal administrator notes, private audit/security events, delivery credentials, push endpoints and push encryption keys are excluded.",
      ],
      knownLimitations: [
        "This export covers the user-linked server collections currently inventoried; it is not yet certified as an exhaustive legal data export.",
        "Lesson notes stored only in this browser's local storage are not available to the server export.",
        "Provider-side records, infrastructure logs and backups are not included.",
      ],
    };

    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"buddyforstudy-account-export-" + new Date().toISOString().slice(0, 10) + ".json\"",
      "Cache-Control": "private, no-store, no-cache, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function createMyPrivacyRequest(req, res, next) {
  try {
    const input = requestSchema.parse(req.body || {});
    const userId = authenticatedUserId(req);
    if (!userId) return failure(res, "Authentication required.", 401);

    const activeRequestKey = userId + ":" + input.type;
    const existing = await DataPrivacyRequest.findOne({ activeRequestKey });
    if (existing) {
      return success(res, {
        request: serializeLearnerRequest(existing),
        duplicate: true,
        executionAvailable: false,
      }, "An active request of this type already exists.", 200);
    }

    let request;
    try {
      request = await DataPrivacyRequest.create({
        user: userId,
        type: input.type,
        description: input.description,
        dataCategories: input.dataCategories,
        status: "identity_pending",
        activeRequestKey,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const raced = await DataPrivacyRequest.findOne({ activeRequestKey });
        if (raced) {
          return success(res, {
            request: serializeLearnerRequest(raced),
            duplicate: true,
            executionAvailable: false,
          }, "An active request of this type already exists.", 200);
        }
      }
      throw error;
    }

    const audit = await recordAuditEvent({
      actor: userId,
      action: "privacy.requested",
      targetType: "DataPrivacyRequest",
      targetId: request.requestId,
      before: null,
      after: { type: request.type, status: request.status },
      reason: "Authenticated account submitted a privacy request.",
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get("user-agent") || "").slice(0, 500),
    });

    if (!audit?.recorded && !audit?.queued) {
      await DataPrivacyRequest.deleteOne({ _id: request._id, status: "identity_pending" });
      return failure(res, "The request could not be durably recorded. Please retry.", 503);
    }

    return success(res, {
      request: serializeLearnerRequest(request),
      duplicate: false,
      executionAvailable: false,
    }, "Privacy request submitted. Identity verification and review are still required.", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Invalid privacy request.", 400, error.flatten().fieldErrors);
    return next(error);
  }
}

export async function listMyPrivacyRequests(req, res, next) {
  try {
    const userId = authenticatedUserId(req);
    const requests = await DataPrivacyRequest.find({ user: userId })
      .select("requestId type description dataCategories status identityVerifiedAt createdAt updatedAt")
      .sort({ createdAt: -1 }).limit(50).lean();
    return success(res, { requests }, "Your privacy requests.");
  } catch (error) {
    return next(error);
  }
}

export async function listAdminPrivacyRequests(req, res, next) {
  try {
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const filter = {};
    if (typeof req.query.status === "string" && DATA_PRIVACY_REQUEST_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.type === "deletion" || req.query.type === "correction") filter.type = req.query.type;

    const [rows, total] = await Promise.all([
      DataPrivacyRequest.find(filter).populate("user", "name email").populate("identityVerifiedBy", "name")
        .populate("reviewedBy", "name").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      DataPrivacyRequest.countDocuments(filter),
    ]);

    return success(res, {
      requests: rows.map(serializeAdminRequest),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    }, "Privacy request review queue.");
  } catch (error) {
    return next(error);
  }
}

export async function updateAdminPrivacyRequest(req, res, next) {
  try {
    const input = adminUpdateSchema.parse(req.body || {});
    const existing = await DataPrivacyRequest.findOne({ requestId: req.params.requestId });
    if (!existing) return failure(res, "Privacy request was not found.", 404);

    if (!(allowedTransitions[existing.status] || []).includes(input.status)) {
      return failure(res, "This privacy request status transition is not allowed.", 409);
    }

    const identityVerifiedAt = input.identityVerified === true
      ? (existing.identityVerifiedAt || new Date())
      : existing.identityVerifiedAt;
    const requiresVerifiedIdentity = ["in_review", "approved", "in_progress", "partially_fulfilled"].includes(input.status);
    if (requiresVerifiedIdentity && !identityVerifiedAt) {
      return failure(res, "Verify the requester's identity before moving this request forward.", 400);
    }
    if (input.status === "legal_hold" && input.reviewerNote.length < 20) {
      return failure(res, "A legal-hold explanation of at least 20 characters is required.", 400);
    }

    const reviewerId = actorId(req);
    const set = {
      status: input.status,
      reviewerNote: input.reviewerNote,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    };
    if (input.identityVerified === true) {
      set.identityVerifiedAt = identityVerifiedAt;
      set.identityVerifiedBy = reviewerId;
    }

    const updated = await DataPrivacyRequest.findOneAndUpdate(
      { _id: existing._id, status: existing.status },
      { $set: set },
      { new: true, runValidators: true }
    );
    if (!updated) return failure(res, "The request changed concurrently. Refresh the queue and retry.", 409);

    const audit = await recordAuditEvent({
      actor: reviewerId,
      action: "privacy.request_status_changed",
      targetType: "DataPrivacyRequest",
      targetId: existing.requestId,
      before: { status: existing.status, identityVerified: Boolean(existing.identityVerifiedAt) },
      after: { status: updated.status, identityVerified: Boolean(updated.identityVerifiedAt) },
      reason: "Privacy request status changed from " + existing.status + " to " + updated.status + ".",
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get("user-agent") || "").slice(0, 500),
    });

    if (!audit?.recorded && !audit?.queued) {
      await DataPrivacyRequest.updateOne(
        { _id: updated._id, status: updated.status, updatedAt: updated.updatedAt },
        { $set: {
          status: existing.status,
          identityVerifiedAt: existing.identityVerifiedAt,
          identityVerifiedBy: existing.identityVerifiedBy,
          reviewerNote: existing.reviewerNote,
          reviewedBy: existing.reviewedBy,
          reviewedAt: existing.reviewedAt,
        } }
      );
      return failure(res, "The status change was rolled back because its audit record could not be persisted.", 503);
    }

    return success(res, {
      request: serializeAdminRequest(updated),
      executionAvailable: false,
    }, "Privacy request status updated. No account data has been deleted or anonymized.");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Invalid privacy request update.", 400, error.flatten().fieldErrors);
    return next(error);
  }
}

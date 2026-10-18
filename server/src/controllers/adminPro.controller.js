import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { User } from "../models/User.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { PaymentIssue } from "../models/PaymentIssue.js";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
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
import { getAdminPermissions } from "../utils/adminRbac.js";

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

async function notificationAudienceUsers(audience) {
  if (audience === "active") return User.find({ isActive: true }).select("_id");
  if (audience === "subscribers") {
    const subs = await UserSubscription.find({ status: { $in: ["trialing", "active"] } }).select("user");
    return User.find({ _id: { $in: subs.map(s => s.user) }, isActive: true }).select("_id");
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
      Payment.aggregate([{ $match: { status: { $in: ["paid", "partially_refunded"] } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
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
    if (canBilling) Object.assign(stats, { activeSubscribers, pastDueSubscribers, revenue: Math.max(0, (grossRevenue[0]?.total || 0) - (processedRefunds[0]?.total || 0)), failedPayments });
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
    const [items, total] = await Promise.all([
      User.find(filter).select("-password").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    return success(res, { users: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
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
    return success(res, { user, subscription, payments, enrollments, notifications });
  } catch (e) { next(e); }
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
    await audit(req, "user.updated", "User", user._id, before, { isActive: user.isActive }, req.body.reason);
    return success(res, { user: user.toJSON() }, "User updated");
  } catch (e) { next(e); }
}

export async function courses(req, res, next) {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const searchPattern = q ? new RegExp(escapeRegex(q), "i") : null;
    const filter = searchPattern ? { $or: [{ title: searchPattern }, { category: searchPattern }] } : {};
    const courses = await Course.find(filter).select("title slug category level isPublished pricing enrollmentEnabled certificateEnabled featured createdAt updatedAt").sort({ createdAt: -1 }).lean();
    return success(res, { courses });
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
    await course.save();
    // Course catalogue caches must not retain stale publish state or metadata.
    await cacheDelete(`course:${course._id}`);
    const after = summarizeCourseForAudit(course);
    const publishTransition = before.isPublished !== after.isPublished;
    const action = publishTransition
      ? (after.isPublished ? "course.published" : "course.unpublished")
      : "course.updated";
    await audit(req, action, "Course", course._id, before, after, req.body.reason);
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
    });
    return success(res, { plan }, "Plan created", 201);
  } catch (e) { next(e); }
}

export async function updatePlan(req, res, next) {
  try {
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
    }, req.body.reason);
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

export async function refunds(req, res, next) {
  try {
    const items = await RefundRequest.find().populate("user", "name email").populate("payment").populate("processedBy", "name email").sort({ createdAt: -1 }).limit(200).lean();
    return success(res, { refunds: items });
  } catch (e) { next(e); }
}

export async function updateRefund(req, res, next) {
  try {
    if (!isValidObjectId(req.params.refundId)) return failure(res, "Invalid refundId", 400);
    const refund = await RefundRequest.findById(req.params.refundId); if (!refund) return failure(res, "Refund request not found", 404);
    if (!["approved", "rejected", "processed"].includes(req.body.status)) return failure(res, "Invalid refund status", 400);
    const payment = await Payment.findById(refund.payment);
    if (!payment) return failure(res, "Payment record not found", 404);

    const before = {
      status: refund.status,
      amount: refund.amount,
      hasAdminNote: Boolean(refund.adminNote),
      processedAt: refund.processedAt
    };
    refund.adminNote = req.body.adminNote || refund.adminNote;
    refund.processedBy = req.user.user._id;

    if (req.body.status === "rejected") {
      refund.status = "rejected";
      refund.processedAt = new Date();
    } else if (req.body.status === "approved" || req.body.status === "processed") {
      if (refund.status === "processed") return failure(res, "Refund is already processed", 409);
      if (payment.provider !== "razorpay" || !payment.providerPaymentId) {
        return failure(res, "Refund cannot be processed because the payment provider reference is missing", 400);
      }

      const providerRefund = await razorpay.refundPayment({
        paymentId: payment.providerPaymentId,
        amount: refund.amount
      });

      refund.status = "processed";
      refund.providerRefundId = providerRefund.id || "";
      refund.processedAt = new Date();

      const isFullRefund = refund.amount >= payment.amount;
      payment.status = isFullRefund ? "refunded" : "partially_refunded";
      await payment.save();
    }
    await refund.save();
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
    await audit(req, "refund.updated", "RefundRequest", refund._id, before, {
      status: refund.status,
      amount: refund.amount,
      hasAdminNote: Boolean(refund.adminNote),
      processedAt: refund.processedAt
    }, req.body.reason || "Refund status updated");
    return success(res, { refund }, "Refund updated");
  } catch (e) { next(e); }
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
    if (Array.isArray(req.body.userIds) && req.body.userIds.length > 500) {
      return failure(res, "Send to at most 500 selected users at a time", 400);
    }

    const ids = Array.isArray(req.body.userIds) ? req.body.userIds.filter(isValidObjectId) : [];
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }).select("_id")
      : await notificationAudienceUsers(req.body.audience || "all");
    const broadcastId = new mongoose.Types.ObjectId().toString();
    await Promise.all(users.map((user) => createNotificationEvent({
      userId: String(user._id),
      title,
      message,
      type,
      link,
      eventKey: `admin-notification:${broadcastId}:${user._id}`,
      email: false,
      push: false,
      metadata: { source: "admin-broadcast", broadcastId, initiatedBy: String(req.user.user._id) }
    })));
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

    const ids = Array.isArray(req.body.userIds) ? req.body.userIds.filter(isValidObjectId) : [];
    let users = [];
    let externalEmail = "";
    if (ids.length) {
      users = await User.find({ _id: { $in: ids } }).select("_id email name");
    } else if (req.body.email) {
      externalEmail = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(externalEmail)) return failure(res, "Enter a valid recipient email address", 400);
      const knownUser = await User.findOne({ email: externalEmail }).select("_id email name");
      if (knownUser) users = [knownUser];
    } else {
      users = await audienceUsers(req.body.audience || "all");
    }

    if (externalEmail && users.length === 0) {
      return failure(res, "Campaign email can only be sent to registered users so their notification preferences and consent can be checked.", 400);
    }

    if (!users.length) return success(res, { queued: 0, skipped: 0, recipients: 0 }, "No recipients matched the selected audience");
    const broadcastId = new mongoose.Types.ObjectId().toString();
    const results = await Promise.all(users.map((user) => createNotificationEvent({
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
    })));
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

    const announcement = await Announcement.create({
      title,
      message,
      audience: req.body.audience || "all",
      channel,
      link: typeof req.body.link === "string" ? req.body.link.trim().slice(0, 1000) : "",
      status: "sent",
      sentAt: new Date(),
      createdBy: req.user.user._id
    });
    const users = await audienceUsers(announcement.audience);
    const results = await Promise.all(users.map((user) => createNotificationEvent({
      userId: String(user._id),
      title: announcement.title,
      message: announcement.message,
      type: "promotion",
      link: announcement.link,
      eventKey: `announcement:${announcement._id}:${user._id}`,
      inApp: channel.includes("in_app"),
      email: channel.includes("email"),
      push: false,
      metadata: { source: "admin-announcement", announcementId: String(announcement._id) }
    })));
    await audit(req, "announcement.sent", "Announcement", announcement._id, null, {
      audience: announcement.audience,
      recipients: users.length,
      requestedChannels: channel,
      inAppVisible: results.filter((item) => item?.showInApp).length,
      emailsQueued: results.filter((item) => item?.emailStatus === "pending").length
    });
    return success(res, {
      announcement,
      recipients: users.length,
      emailsQueued: results.filter((item) => item?.emailStatus === "pending").length
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

export async function createCoupon(req, res, next) {
  try {
    const couponInput = { ...req.body, type: req.body.type || "percentage" };
    const validation = validateCouponAdminInput(couponInput);
    if (!validation.valid) return res.status(400).json({ success: false, message: "Coupon contains invalid fields", errors: validation.errors });
    const coupon = await Coupon.create({
      code: req.body.code, type: req.body.type || "percentage", value: Number(req.body.value) || 0,
      maxDiscount: req.body.maxDiscount == null ? null : Number(req.body.maxDiscount), minOrderAmount: Number(req.body.minOrderAmount) || 0,
      usageLimit: req.body.usageLimit == null ? null : Number(req.body.usageLimit), expiresAt: req.body.expiresAt || null,
      course: isValidObjectId(req.body.course) ? req.body.course : null, isActive: req.body.isActive !== false
    });
    await audit(req, "coupon.created", "Coupon", coupon._id, null, { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt, course: coupon.course, isActive: coupon.isActive }, req.body.reason);
    return success(res, { coupon }, "Coupon created", 201);
  } catch (e) { next(e); }
}

export async function updateCoupon(req, res, next) {
  try {
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
    await coupon.save(); await audit(req, "coupon.updated", "Coupon", coupon._id, before, { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minOrderAmount: coupon.minOrderAmount, usageLimit: coupon.usageLimit, expiresAt: coupon.expiresAt, course: coupon.course, isActive: coupon.isActive }, req.body.reason);
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

    const [enrollmentsDaily, revenueDaily, coursePerformance, subscriptionBreakdown, completionBreakdown] = await Promise.all([
      Enrollment.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: since }, status: { $in: ["paid", "partially_refunded"] } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
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
      ])
    ]);

    const totalEnrollmentPeriod = enrollmentsDaily.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const totalRevenuePeriod = revenueDaily.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return success(res, {
      period: { days, since, until: new Date() },
      enrollmentsDaily,
      revenueDaily,
      coursePerformance,
      subscriptionBreakdown,
      completionBreakdown,
      totals: {
        enrollments: totalEnrollmentPeriod,
        recordedRevenue: totalRevenuePeriod
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


export async function paymentIssues(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const status = String(req.query.status || "").trim();
    const allowedStatuses = ["open", "in_review", "resolved", "closed"];
    const filter = {};
    if (status && allowedStatuses.includes(status)) filter.status = status;
    const issues = await PaymentIssue.find(filter)
      .populate("user", "name email")
      .populate({ path: "payment", select: "amount currency status provider providerPaymentId createdAt course plan", populate: [{ path: "course", select: "title" }, { path: "plan", select: "name" }] })
      .sort({ createdAt: -1 }).limit(limit).lean();
    return success(res, { issues });
  } catch (e) { next(e); }
}

export async function updatePaymentIssue(req, res, next) {
  try {
    if (!isValidObjectId(req.params.issueId)) return failure(res, "Invalid issue ID", 400);
    const status = String(req.body?.status || "").trim();
    const allowedStatuses = ["open", "in_review", "resolved", "closed"];
    if (!allowedStatuses.includes(status)) return failure(res, "Invalid issue status", 400);
    const adminNote = typeof req.body?.adminNote === "string" ? req.body.adminNote.trim().slice(0, 2000) : "";
    const issue = await PaymentIssue.findById(req.params.issueId);
    if (!issue) return failure(res, "Payment issue not found", 404);
    const before = { status: issue.status, adminNote: issue.adminNote };
    issue.status = status;
    issue.adminNote = adminNote;
    issue.resolvedAt = ["resolved", "closed"].includes(status) ? new Date() : null;
    issue.resolvedBy = ["resolved", "closed"].includes(status) ? (req.user.user?._id || req.user.userId) : null;
    await issue.save();
    await audit(req, "payment_issue.updated", "PaymentIssue", String(issue._id), before, { status: issue.status, adminNote: issue.adminNote }, "Admin updated payment issue report");
    await createNotificationEvent({
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
    return success(res, { issue }, "Payment issue updated");
  } catch (e) { next(e); }
}

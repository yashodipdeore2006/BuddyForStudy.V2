import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { User } from "../models/User.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { AuditLog } from "../models/AuditLog.js";
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

async function audit(req, action, targetType, targetId = "", before = null, after = null, reason = "") {
  await AuditLog.create({
    actor: req.user.user._id, action, targetType, targetId: String(targetId || ""), before, after, reason,
    ip: req.ip || "", userAgent: req.get("user-agent") || ""
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

    return success(res, {
      stats: {
        users, activeUsers, admins, courses, published, unpublished, emptyCourses,
        enrollments, activeSubscribers, pastDueSubscribers,
        revenue: Math.max(0, (grossRevenue[0]?.total || 0) - (processedRefunds[0]?.total || 0)),
        failedPayments, pendingRefunds, unread
      },
      recentUsers, recentPayments, recentAudit, topCourses
    });
  } catch (e) { next(e); }
}

export async function users(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
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
    if (String(req.params.userId) === String(req.user.user._id)) return failure(res, "Admin cannot deactivate the current account", 400);
    const user = await User.findById(req.params.userId);
    if (!user) return failure(res, "User not found", 404);
    const before = { isActive: user.isActive, role: user.role };
    if (typeof req.body.isActive === "boolean") user.isActive = req.body.isActive;
    if (req.body.role === "user" || req.body.role === "admin") user.role = req.body.role;
    await user.save();
    await audit(req, "user.updated", "User", user._id, before, { isActive: user.isActive, role: user.role }, req.body.reason);
    return success(res, { user: user.toJSON() }, "User updated");
  } catch (e) { next(e); }
}

export async function courses(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const filter = q ? { $or: [{ title: new RegExp(q, "i") }, { category: new RegExp(q, "i") }] } : {};
    const courses = await Course.find(filter).select("title slug category level isPublished pricing enrollmentEnabled certificateEnabled featured createdAt updatedAt").sort({ createdAt: -1 }).lean();
    return success(res, { courses });
  } catch (e) { next(e); }
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

    const before = { title: module.title, description: module.description, resources: module.resources };
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return failure(res, "Module title cannot be empty", 400);
      module.title = title;
    }
    if (req.body.description !== undefined) module.description = String(req.body.description || "").trim();

    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.updated", "Course", course._id, before, {
      moduleId: String(module._id), title: module.title, description: module.description
    }, req.body.reason || "");
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

    const title = String(req.body.title || "").trim();
    const type = ["tutorial", "project", "quiz"].includes(req.body.type) ? req.body.type : "tutorial";
    if (!title) return failure(res, "Learning item title is required", 400);

    const lessonInput = {
      title,
      description: String(req.body.description || "").trim(),
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
    await audit(req, "course.module.resource.added", "Course", course._id, null, {
      moduleId: String(module._id), resourceId: String(resource._id), title, type, url: resourceUrl
    });
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
    module.resources.splice(index, 1);
    await course.save();
    await cacheDelete(`course:${course._id}`);
    await audit(req, "course.module.resource.deleted", "Course", course._id, {
      moduleId: String(module._id), resourceId: String(removed._id), title: removed.title
    }, null);
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

    const before = {
      moduleTitle: targetModule.title,
      lessons: (targetModule.lessons || []).map((lesson) => ({
        id: String(lesson._id), title: lesson.title, type: lesson.type, videos: lesson.tutorial?.videos || []
      }))
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
      { moduleTitle: targetModule.title, lessons: targetModule.lessons.map((lesson) => ({
        id: String(lesson._id), title: lesson.title, type: lesson.type, videos: lesson.tutorial?.videos || []
      })) },
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
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const before = {
      title: course.title,
      description: course.description,
      category: course.category,
      level: course.level,
      duration: course.duration,
      thumbnail: course.thumbnail,
      learningOutcomes: course.learningOutcomes,
      isPublished: course.isPublished,
      pricing: course.pricing,
      enrollmentEnabled: course.enrollmentEnabled,
      certificateEnabled: course.certificateEnabled,
      featured: course.featured
    };

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
    await audit(req, "course.updated", "Course", course._id, before, {
      title: course.title,
      description: course.description,
      category: course.category,
      level: course.level,
      duration: course.duration,
      thumbnail: course.thumbnail,
      learningOutcomes: course.learningOutcomes,
      isPublished: course.isPublished,
      pricing: course.pricing,
      enrollmentEnabled: course.enrollmentEnabled,
      certificateEnabled: course.certificateEnabled,
      featured: course.featured
    }, req.body.reason);
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
    const plan = await SubscriptionPlan.create({
      name: req.body.name, slug: req.body.slug, description: req.body.description || "", price: Number(req.body.price) || 0,
      currency: req.body.currency || "INR", billingInterval: req.body.billingInterval || "monthly",
      features: normalizeSubscriptionFeatures(req.body.features),
      limits: normalizePlanLimits(req.body.limits),
      isActive: req.body.isActive !== false,
      isPopular: Boolean(req.body.isPopular), trialDays: Number(req.body.trialDays) || 0, sortOrder: Number(req.body.sortOrder) || 0
    });
    await audit(req, "subscription_plan.created", "SubscriptionPlan", plan._id, null, plan.toObject());
    return success(res, { plan }, "Plan created", 201);
  } catch (e) { next(e); }
}

export async function updatePlan(req, res, next) {
  try {
    if (!isValidObjectId(req.params.planId)) return failure(res, "Invalid planId", 400);
    const plan = await SubscriptionPlan.findById(req.params.planId); if (!plan) return failure(res, "Plan not found", 404);
    const before = plan.toObject();
    const allowed = ["name", "slug", "description", "price", "currency", "billingInterval", "features", "limits", "isActive", "isPopular", "trialDays", "sortOrder"];
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      if (key === "features") plan[key] = normalizeSubscriptionFeatures(req.body[key]);
      else if (key === "limits") plan[key] = normalizePlanLimits(req.body[key]);
      else plan[key] = req.body[key];
    }
    await plan.save(); await audit(req, "subscription_plan.updated", "SubscriptionPlan", plan._id, before, plan.toObject(), req.body.reason);
    return success(res, { plan }, "Plan updated");
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

    const before = refund.toObject();
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
    await audit(req, "refund.updated", "RefundRequest", refund._id, before, refund.toObject(), req.body.adminNote);
    return success(res, { refund }, "Refund updated");
  } catch (e) { next(e); }
}

export async function sendNotification(req, res, next) {
  try {
    const ids = Array.isArray(req.body.userIds) ? req.body.userIds.filter(isValidObjectId) : [];
    const users = ids.length ? await User.find({ _id: { $in: ids } }).select("_id") : await notificationAudienceUsers(req.body.audience || "all");
    if (!req.body.title || !req.body.message) return failure(res, "title and message are required", 400);
    const docs = users.map(u => ({ user: u._id, title: req.body.title, message: req.body.message, type: req.body.type || "system", link: req.body.link || "", sentBy: req.user.user._id }));
    if (docs.length) await Notification.insertMany(docs);
    await audit(req, "notification.sent", "Notification", "", null, { recipients: docs.length, title: req.body.title });
    return success(res, { sent: docs.length }, "Notification sent");
  } catch (e) { next(e); }
}

export async function sendEmail(req, res, next) {
  try {
    const transport = mailer(); if (!transport) return failure(res, "SMTP is not configured", 503);
    let users = [];
    if (Array.isArray(req.body.userIds) && req.body.userIds.length) users = await User.find({ _id: { $in: req.body.userIds.filter(isValidObjectId) } }).select("email name");
    else if (req.body.email) users = [{ email: req.body.email, name: "" }];
    else users = await audienceUsers(req.body.audience || "all");
    if (!req.body.subject || !req.body.html) return failure(res, "subject and html are required", 400);
    const info = await transport.sendMail({ from: env.mailFrom, to: users.map(u => u.email).join(","), subject: req.body.subject, html: req.body.html });
    await audit(req, "email.sent", "EmailCampaign", info.messageId || "", null, { recipients: users.length, subject: req.body.subject });
    return success(res, { sent: users.length, messageId: info.messageId }, "Email sent");
  } catch (e) { next(e); }
}

export async function sendAnnouncement(req, res, next) {
  try {
    if (!req.body.title || !req.body.message) return failure(res, "title and message are required", 400);
    const announcement = await Announcement.create({ title: req.body.title, message: req.body.message, audience: req.body.audience || "all", channel: req.body.channel || ["in_app"], link: req.body.link || "", status: "sent", sentAt: new Date(), createdBy: req.user.user._id });
    const users = await audienceUsers(announcement.audience);
    if (announcement.channel.includes("in_app")) {
      await Notification.insertMany(users.map(u => ({ user: u._id, title: announcement.title, message: announcement.message, type: "system", link: announcement.link, sentBy: req.user.user._id })));
    }
    if (announcement.channel.includes("email") && env.smtpHost) {
      const transport = mailer(); if (transport && users.length) await transport.sendMail({ from: env.mailFrom, to: users.map(u => u.email).join(","), subject: announcement.title, html: announcement.message });
    }
    await audit(req, "announcement.sent", "Announcement", announcement._id, null, { audience: announcement.audience, recipients: users.length });
    return success(res, { announcement, recipients: users.length }, "Announcement sent", 201);
  } catch (e) { next(e); }
}

export async function settings(req, res, next) {
  try { return success(res, { settings: await PlatformSetting.find().sort({ key: 1 }).lean() }); }
  catch (e) { next(e); }
}

export async function upsertSetting(req, res, next) {
  try {
    if (!req.body.key) return failure(res, "key is required", 400);
    const current = await PlatformSetting.findOne({ key: req.body.key });
    const before = current?.value ?? null;
    const setting = await PlatformSetting.findOneAndUpdate({ key: req.body.key }, { $set: { value: req.body.value, description: req.body.description || "", isPublic: Boolean(req.body.isPublic), updatedBy: req.user.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await audit(req, "setting.updated", "PlatformSetting", setting._id, { value: before }, { value: setting.value }, req.body.reason);
    return success(res, { setting }, "Setting updated");
  } catch (e) { next(e); }
}

export async function coupons(req, res, next) {
  try { return success(res, { coupons: await Coupon.find().populate("course", "title").sort({ createdAt: -1 }).lean() }); }
  catch (e) { next(e); }
}

export async function createCoupon(req, res, next) {
  try {
    const coupon = await Coupon.create({
      code: req.body.code, type: req.body.type || "percentage", value: Number(req.body.value) || 0,
      maxDiscount: req.body.maxDiscount == null ? null : Number(req.body.maxDiscount), minOrderAmount: Number(req.body.minOrderAmount) || 0,
      usageLimit: req.body.usageLimit == null ? null : Number(req.body.usageLimit), expiresAt: req.body.expiresAt || null,
      course: isValidObjectId(req.body.course) ? req.body.course : null, isActive: req.body.isActive !== false
    });
    await audit(req, "coupon.created", "Coupon", coupon._id, null, coupon.toObject());
    return success(res, { coupon }, "Coupon created", 201);
  } catch (e) { next(e); }
}

export async function updateCoupon(req, res, next) {
  try {
    if (!isValidObjectId(req.params.couponId)) return failure(res, "Invalid couponId", 400);
    const coupon = await Coupon.findById(req.params.couponId); if (!coupon) return failure(res, "Coupon not found", 404);
    const before = coupon.toObject();
    for (const key of ["type","value","maxDiscount","minOrderAmount","usageLimit","expiresAt","isActive"]) if (req.body[key] !== undefined) coupon[key] = req.body[key];
    await coupon.save(); await audit(req, "coupon.updated", "Coupon", coupon._id, before, coupon.toObject(), req.body.reason);
    return success(res, { coupon }, "Coupon updated");
  } catch (e) { next(e); }
}

export async function auditLogs(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    // Treat the search term as literal text, not a user-supplied regular expression.
    const q = String(req.query.q || "").trim().slice(0, 100);
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) filter.$or = [
      { action: new RegExp(q, "i") },
      { targetType: new RegExp(q, "i") },
      { targetId: new RegExp(q, "i") },
      { reason: new RegExp(q, "i") }
    ];
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.targetType) filter.targetType = String(req.query.targetType);");
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

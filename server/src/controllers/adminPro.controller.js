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
import { env } from "../config/env.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import * as razorpay from "../services/razorpay.service.js";

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
    return User.find({ _id: { $in: subs.map(s => s.user) }, isActive: true }).select("_id email name");
  }
  return User.find({ isActive: true }).select("_id email name");
}

export async function overview(req, res, next) {
  try {
    const [users, activeUsers, courses, published, enrollments, subscribers, revenue, pendingRefunds, unread] = await Promise.all([
      User.countDocuments(), User.countDocuments({ isActive: true }), Course.countDocuments(), Course.countDocuments({ isPublished: true }),
      Enrollment.countDocuments(), UserSubscription.countDocuments({ status: { $in: ["trialing", "active"] } }),
      Payment.aggregate([{ $match: { status: { $in: ["paid", "partially_refunded"] } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      RefundRequest.countDocuments({ status: "pending" }), Notification.countDocuments({ readAt: null })
    ]);
    const recentUsers = await User.find().select("name email role isActive createdAt").sort({ createdAt: -1 }).limit(8).lean();
    const recentPayments = await Payment.find().populate("user", "name email").sort({ createdAt: -1 }).limit(8).lean();
    return success(res, { stats: { users, activeUsers, courses, published, enrollments, subscribers, revenue: revenue[0]?.total || 0, pendingRefunds, unread }, recentUsers, recentPayments });
  } catch (e) { next(e); }
}

export async function users(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const q = String(req.query.q || "").trim();
    const filter = q ? { $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] } : {};
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

export async function updateCourse(req, res, next) {
  try {
    if (!isValidObjectId(req.params.courseId)) return failure(res, "Invalid courseId", 400);
    const course = await Course.findById(req.params.courseId);
    if (!course) return failure(res, "Course not found", 404);
    const before = { isPublished: course.isPublished, pricing: course.pricing, enrollmentEnabled: course.enrollmentEnabled, certificateEnabled: course.certificateEnabled, featured: course.featured };
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
    await audit(req, "course.settings.updated", "Course", course._id, before, { isPublished: course.isPublished, pricing: course.pricing, enrollmentEnabled: course.enrollmentEnabled, certificateEnabled: course.certificateEnabled, featured: course.featured }, req.body.reason);
    return success(res, { course }, "Course controls updated");
  } catch (e) { next(e); }
}

export async function plans(req, res, next) {
  try { return success(res, { plans: await SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: 1 }).lean() }); }
  catch (e) { next(e); }
}

export async function createPlan(req, res, next) {
  try {
    const plan = await SubscriptionPlan.create({
      name: req.body.name, slug: req.body.slug, description: req.body.description || "", price: Number(req.body.price) || 0,
      currency: req.body.currency || "INR", billingInterval: req.body.billingInterval || "monthly",
      features: Array.isArray(req.body.features) ? req.body.features : [], isActive: req.body.isActive !== false,
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
    const allowed = ["name", "slug", "description", "price", "currency", "billingInterval", "features", "isActive", "isPopular", "trialDays", "sortOrder"];
    for (const key of allowed) if (req.body[key] !== undefined) plan[key] = req.body[key];
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
    const users = ids.length ? await User.find({ _id: { $in: ids }, isActive: true }).select("_id") : await audienceUsers(req.body.audience || "all");
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
    if (Array.isArray(req.body.userIds) && req.body.userIds.length) users = await User.find({ _id: { $in: req.body.userIds.filter(isValidObjectId) }, isActive: true }).select("email name");
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
    const logs = await AuditLog.find().populate("actor", "name email").sort({ createdAt: -1 }).limit(limit).lean();
    return success(res, { logs });
  } catch (e) { next(e); }
}

export async function health(req, res, next) {
  try {
    const dbState = mongoose.connection.readyState === 1;
    return success(res, { service: "BuddyForStudy API", database: dbState ? "connected" : "disconnected", uptimeSeconds: Math.round(process.uptime()), node: process.version, environment: env.nodeEnv });
  } catch (e) { next(e); }
}

import crypto from "node:crypto";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { mailRecipientAccepted, summarizeNotificationDeliveryOutcomes } from "./notificationDeliveryOutcomes.js";
import { env } from "../config/env.js";
import { Enrollment } from "../models/Enrollment.js";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Progress } from "../models/Progress.js";
import { Notification } from "../models/Notification.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { isWebPushConfigured, sendWebPushNotification } from "./webPush.service.js";
import { NotificationPreference } from "../models/NotificationPreference.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { MessageTemplate } from "../models/MessageTemplate.js";
import { getReminderClock, isWithinQuietHours, hasBeenInactive, learningReminderEventKey, getSubscriptionExpiryReminderWindow, subscriptionExpiryReminderEventKey } from "./reminderScheduling.js";
import { buildCoursePurchaseNotificationPayload, buildSubscriptionActivatedNotificationPayload, formatBillingNotificationDate } from "./billingNotificationPayloads.js";
import * as razorpay from "./razorpay.service.js";

const DEFAULT_PREFERENCES = {
  emailCourseUpdates: true,
  inAppCourseUpdates: true,
  emailProjectUpdates: true,
  inAppProjectUpdates: true,
  emailAnnouncements: false,
  inAppAnnouncements: true,
  emailLearningReminders: true,
  inAppLearningReminders: true,
  learningRemindersEnabled: true,
  pushEnabled: false,
  timezone: "Asia/Kolkata",
  reminderHour: 18,
  quietHoursStart: 22,
  quietHoursEnd: 8
};
const DEFAULT_PLATFORM_SETTINGS = {
  emailEnabled: true,
  inAppEnabled: true,
  pushEnabled: true,
  learningRemindersEnabled: true,
  inactiveDays: 3,
  subscriptionExpiryRemindersEnabled: true,
  subscriptionExpiryReminderDays: 3,
  emailRetryAttempts: 5,
  pushRetryAttempts: 3
};
const RETRY_DELAY_MS = 10 * 60 * 1000;
let transport;

async function getNotificationPlatformSettings() {
  const keys = [
    "notification_email_enabled",
    "notification_in_app_enabled",
    "notification_push_enabled",
    "learning_reminders_enabled",
    "learning_reminder_inactive_days",
    "subscription_expiry_reminders_enabled",
    "subscription_expiry_reminder_days",
    "notification_email_retry_attempts",
    "notification_push_retry_attempts"
  ];
  const rows = await PlatformSetting.find({ key: { $in: keys } }).select("key value").lean();
  const values = Object.fromEntries(rows.map((item) => [item.key, item.value]));
  return {
    emailEnabled: values.notification_email_enabled === undefined ? DEFAULT_PLATFORM_SETTINGS.emailEnabled : Boolean(values.notification_email_enabled),
    inAppEnabled: values.notification_in_app_enabled === undefined ? DEFAULT_PLATFORM_SETTINGS.inAppEnabled : Boolean(values.notification_in_app_enabled),
    pushEnabled: values.notification_push_enabled === undefined ? DEFAULT_PLATFORM_SETTINGS.pushEnabled : Boolean(values.notification_push_enabled),
    learningRemindersEnabled: values.learning_reminders_enabled === undefined ? DEFAULT_PLATFORM_SETTINGS.learningRemindersEnabled : Boolean(values.learning_reminders_enabled),
    inactiveDays: Math.max(1, Math.min(30, Math.trunc(Number(values.learning_reminder_inactive_days ?? DEFAULT_PLATFORM_SETTINGS.inactiveDays) || DEFAULT_PLATFORM_SETTINGS.inactiveDays))),
    subscriptionExpiryRemindersEnabled: values.subscription_expiry_reminders_enabled === undefined ? DEFAULT_PLATFORM_SETTINGS.subscriptionExpiryRemindersEnabled : Boolean(values.subscription_expiry_reminders_enabled),
    subscriptionExpiryReminderDays: Math.max(1, Math.min(14, Math.trunc(Number(values.subscription_expiry_reminder_days ?? DEFAULT_PLATFORM_SETTINGS.subscriptionExpiryReminderDays) || DEFAULT_PLATFORM_SETTINGS.subscriptionExpiryReminderDays))),
    emailRetryAttempts: Math.max(1, Math.min(10, Math.trunc(Number(values.notification_email_retry_attempts ?? DEFAULT_PLATFORM_SETTINGS.emailRetryAttempts) || DEFAULT_PLATFORM_SETTINGS.emailRetryAttempts))),
    pushRetryAttempts: Math.max(1, Math.min(6, Math.trunc(Number(values.notification_push_retry_attempts ?? DEFAULT_PLATFORM_SETTINGS.pushRetryAttempts) || DEFAULT_PLATFORM_SETTINGS.pushRetryAttempts)))
  };
}

function getMailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.mailFrom) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPass }
    });
  }
  return transport;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderTemplate(template, values, { html = false } = {}) {
  const entries = Object.entries(values || {});
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = entries.find(([name]) => name.toLowerCase() === String(key).toLowerCase())?.[1];
    const text = value === undefined || value === null ? "" : String(value);
    return html ? escapeHtml(text) : text;
  });
}

function preferenceKeys(type) {
  if (type === "learning") return { email: "emailLearningReminders", inApp: "inAppLearningReminders" };
  if (type === "course") return { email: "emailCourseUpdates", inApp: "inAppCourseUpdates" };
  if (type === "promotion") return { email: "emailAnnouncements", inApp: "inAppAnnouncements" };
  return { email: null, inApp: null };
}

export function normalizeUserNotificationPreferences(stored, userId) {
  const preferences = { ...DEFAULT_PREFERENCES, ...(stored || {}), user: String(userId) };
  // Historical defaults were on without recording opt-in; fail closed until explicit consent exists.
  if (!stored?.emailAnnouncementsConsentAt || stored?.emailAnnouncements !== true) {
    preferences.emailAnnouncements = false;
  }
  return preferences;
}

export async function getUserNotificationPreferences(userId) {
  const stored = await NotificationPreference.findOne({ user: userId }).lean();
  return normalizeUserNotificationPreferences(stored, userId);
}

export function createEmailUnsubscribeToken(userId, expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000) {
  if (!userId || !mongoose.isValidObjectId(String(userId))) throw new Error("A valid user ID is required for an unsubscribe token");
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: expiresAt })).toString("base64url");
  const signature = crypto.createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEmailUnsubscribeToken(token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, suppliedSignature] = parts;
  const expected = crypto.createHmac("sha256", env.jwtSecret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(suppliedSignature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!claims || !mongoose.isValidObjectId(String(claims.sub || "")) || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
  return { userId: String(claims.sub), expiresAt: claims.exp };
}

export async function saveUserNotificationPreferences(userId, updates) {
  const patch = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) patch[key] = updates[key];
  }
  if (Object.prototype.hasOwnProperty.call(updates, "emailAnnouncements")) {
    patch.emailAnnouncements = updates.emailAnnouncements === true;
    patch.emailAnnouncementsConsentAt = updates.emailAnnouncements === true ? new Date() : null;
  }
  const preferences = await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $set: patch, $setOnInsert: { user: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  return normalizeUserNotificationPreferences(preferences, userId);
}

async function dispatchEmail(notificationId) {
  const mailer = getMailer();
  const platform = await getNotificationPlatformSettings();
  if (!mailer || !platform.emailEnabled) return { status: "skipped" };
  const filter = {
    _id: notificationId,
    emailStatus: "pending",
    emailAttempts: { $lt: platform.emailRetryAttempts }
  };
  filter.$or = [
    { emailLastAttemptAt: null },
    { emailLastAttemptAt: { $lte: new Date(Date.now() - RETRY_DELAY_MS) } }
  ];
  const notification = await Notification.findOneAndUpdate(
    filter,
    { $inc: { emailAttempts: 1 }, $set: { emailLastAttemptAt: new Date() } },
    { new: true }
  ).populate("user", "name email");
  if (!notification) return { status: "not_attempted" };
  if (!notification.user?.email) {
    await Notification.updateOne({ _id: notification._id }, {
      $set: { emailStatus: "failed", emailError: "Recipient email is unavailable" }
    });
    return { status: "failed" };
  }

  const preferences = await getUserNotificationPreferences(notification.user._id);
  const keys = preferenceKeys(notification.type);
  const transactional = notification.type === "billing" || notification.type === "security";
  if (!transactional && keys.email && preferences[keys.email] === false) {
    await Notification.updateOne({ _id: notification._id }, {
      $set: { emailStatus: "skipped", emailError: "Disabled by learner email preferences" }
    });
    return { status: "skipped" };
  }

  try {
    const appUrl = env.clientUrl.replace(/\/$/, "");
    const link = notification.link ? appUrl + notification.link : appUrl + "/notifications";
    const title = escapeHtml(notification.title);
    const message = escapeHtml(notification.message).replace(/\n/g, "<br />");
    const isPromotional = notification.type === "promotion";
    const unsubscribeToken = isPromotional ? createEmailUnsubscribeToken(notification.user._id) : "";
    const unsubscribeUrl = unsubscribeToken
      ? `${env.apiUrl.replace(/\/$/, "")}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      : "";
    const unsubscribeText = unsubscribeUrl ? `\n\nUnsubscribe from promotional emails: ${unsubscribeUrl}` : "";
    const deliveryInfo = await mailer.sendMail({
      from: env.mailFrom,
      to: notification.user.email,
      subject: notification.emailSubject || notification.title,
      ...(unsubscribeUrl ? { headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      } } : {}),
      text: (notification.emailHtml
        ? String(notification.emailHtml).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
        : `${notification.title}\n\n${notification.message}\n\nOpen BuddyForStudy: ${link}`) + unsubscribeText,
      html: (notification.emailHtml || `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1c1e21;line-height:1.6"><div style="max-width:560px;margin:24px auto;padding:28px;border:1px solid #dee3e9;border-radius:20px"><p style="font-size:12px;font-weight:700;color:#0064e0;letter-spacing:1px">BUDDYFORSTUDY</p><h1 style="font-size:24px;font-weight:600">${title}</h1><p>${message}</p><p style="margin-top:28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:700">Open BuddyForStudy</a></p><p style="font-size:12px;color:#5d6c7b">You are receiving this email because of activity on your BuddyForStudy account.</p></div></body></html>`) +
        (unsubscribeUrl ? `<p style="font-size:12px;color:#5d6c7b;text-align:center">You received this promotional email because you opted in. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.</p>` : "")
    });
    if (!mailRecipientAccepted(deliveryInfo, notification.user.email)) {
      throw new Error("SMTP server did not confirm acceptance of the recipient");
    }
    await Notification.updateOne({ _id: notification._id }, {
      $set: { emailStatus: "sent", emailSentAt: new Date(), emailError: "" }
    });
    return { status: "sent" };
  } catch (error) {
    const attempts = Number(notification.emailAttempts || 1);
    const terminal = attempts >= platform.emailRetryAttempts;
    await Notification.updateOne({ _id: notification._id }, {
      $set: {
        emailStatus: terminal ? "failed" : "pending",
        emailError: String(error?.message || "Email delivery failed").slice(0, 500)
      }
    });
    console.error("[notifications] email delivery failed", {
      notificationId: String(notification._id),
      attempt: attempts,
      message: String(error?.message || "Unknown mail error").slice(0, 200)
    });
    return { status: terminal ? "failed" : "retrying" };
  }
}

async function dispatchPush(notificationId) {
  const platform = await getNotificationPlatformSettings();
  if (!isWebPushConfigured()) {
    await Notification.updateOne({ _id: notificationId, pushStatus: "pending" }, {
      $set: { pushStatus: "skipped", pushError: "Web Push VAPID keys are not configured" }
    });
    return { status: "skipped" };
  }
  if (!platform.pushEnabled) return { status: "skipped" };

  const filter = {
    _id: notificationId,
    pushStatus: "pending",
    pushAttempts: { $lt: platform.pushRetryAttempts }
  };
  filter.$or = [
    { pushLastAttemptAt: null },
    { pushLastAttemptAt: { $lte: new Date(Date.now() - RETRY_DELAY_MS) } }
  ];
  const notification = await Notification.findOneAndUpdate(
    filter,
    { $inc: { pushAttempts: 1 }, $set: { pushLastAttemptAt: new Date() } },
    { new: true }
  );
  if (!notification) return { status: "not_attempted" };

  const preferences = await getUserNotificationPreferences(notification.user);
  if (preferences.pushEnabled !== true) {
    await Notification.updateOne({ _id: notification._id }, {
      $set: { pushStatus: "skipped", pushError: "Push is not enabled in learner preferences" }
    });
    return { status: "skipped" };
  }

  const subscriptions = await PushSubscription.find({ user: notification.user, active: true }).lean();
  if (!subscriptions.length) {
    await Notification.updateOne({ _id: notification._id }, {
      $set: { pushStatus: "skipped", pushError: "No active browser push subscriptions" }
    });
    return { status: "skipped" };
  }

  let delivered = 0;
  let transientFailures = 0;
  for (const subscription of subscriptions) {
    try {
      await sendWebPushNotification(subscription, {
        notificationId: String(notification._id),
        title: notification.title,
        body: notification.message,
        url: notification.link || "/notifications"
      });
      delivered += 1;
      await PushSubscription.updateOne({ _id: subscription._id }, {
        $set: { lastSuccessAt: new Date(), lastError: "", lastFailureAt: null }
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      const expired = statusCode === 404 || statusCode === 410;
      const errorMessage = expired
        ? "Push subscription expired or no longer exists"
        : String(error?.message || "Web Push delivery failed").slice(0, 400);
      await PushSubscription.updateOne({ _id: subscription._id }, {
        $set: {
          ...(expired ? { active: false, deactivatedAt: new Date() } : {}),
          lastFailureAt: new Date(),
          lastError: errorMessage
        }
      });
      if (!expired) transientFailures += 1;
      console.error("[notifications] Web Push delivery failed", {
        notificationId: String(notification._id),
        subscriptionId: String(subscription._id),
        statusCode: statusCode || undefined,
        message: errorMessage
      });
    }
  }

  if (delivered > 0) {
    await Notification.updateOne({ _id: notification._id }, {
      $set: {
        pushStatus: "sent",
        pushSentAt: new Date(),
        pushError: transientFailures ? "Push was accepted for at least one device; another device delivery failed" : ""
      }
    });
    return { status: "sent", partialFailure: transientFailures > 0 };
  }

  const attempts = Number(notification.pushAttempts || 1);
  const stillActive = await PushSubscription.exists({ user: notification.user, active: true });
  const terminal = stillActive && attempts >= platform.pushRetryAttempts;
  await Notification.updateOne({ _id: notification._id }, {
    $set: {
      pushStatus: !stillActive ? "skipped" : terminal ? "failed" : "pending",
      pushError: !stillActive
        ? "All push subscriptions are expired or invalid"
        : "Web Push delivery failed for every active device"
    }
  });
  return { status: !stillActive ? "skipped" : terminal ? "failed" : "retrying" };
}

export async function retryNotificationDelivery(notificationId, channel) {
  if (!["email", "push"].includes(channel)) {
    const error = new Error("Channel must be email or push.");
    error.status = 400;
    throw error;
  }

  const platform = await getNotificationPlatformSettings();
  if (channel === "email") {
    if (!platform.emailEnabled) {
      const error = new Error("Email delivery is globally disabled in Platform Settings.");
      error.status = 409;
      throw error;
    }
    if (!getMailer()) {
      const error = new Error("Configure SMTP in the server environment before retrying email.");
      error.status = 503;
      throw error;
    }
  } else {
    if (!platform.pushEnabled) {
      const error = new Error("Push delivery is globally disabled in Platform Settings.");
      error.status = 409;
      throw error;
    }
    if (!isWebPushConfigured()) {
      const error = new Error("Configure WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT on the server before retrying push.");
      error.status = 503;
      throw error;
    }
  }

  const statusField = channel === "email" ? "emailStatus" : "pushStatus";
  const attemptsField = channel === "email" ? "emailAttempts" : "pushAttempts";
  const lastAttemptField = channel === "email" ? "emailLastAttemptAt" : "pushLastAttemptAt";
  const errorField = channel === "email" ? "emailError" : "pushError";
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, [statusField]: "failed" },
    { $set: { [statusField]: "pending", [attemptsField]: 0, [lastAttemptField]: null, [errorField]: "" } },
    { new: true }
  );
  if (!notification) {
    const error = new Error("Only failed deliveries can be retried.");
    error.status = 409;
    throw error;
  }

  // The atomic failed -> pending transition claims this retry exactly once.
  // The background worker performs provider I/O so an admin request never waits on SMTP/Web Push.
  return {
    notificationId: String(notification._id),
    channel,
    status: "pending",
    attempts: 0,
    error: "",
    queued: true
  };
}

export async function createNotificationEvent({
  userId,
  title,
  message,
  type = "system",
  link = "",
  eventKey,
  emailSubject = "",
  email = true,
  push = true,
  forceInApp = false,
  inApp = true,
  emailHtmlOverride = "",
  metadata = {},
  templateKeys = {},
  deferDispatch = false
}) {
  const [preferences, platform] = await Promise.all([getUserNotificationPreferences(userId), getNotificationPlatformSettings()]);
  const keys = preferenceKeys(type);
  const { User } = await import("../models/User.js");
  const user = await User.findById(userId).select("name").lean();
  const sourceLink = String(link || "");
  const appUrl = env.clientUrl.replace(/\/$/, "");
  const variables = {
    ...Object.fromEntries(Object.entries(metadata || {}).map(([key, value]) => [key, value === undefined || value === null ? "" : String(value)])),
    userName: user?.name || "learner",
    title,
    message,
    link: sourceLink ? appUrl + sourceLink : appUrl + "/notifications"
  };
  const [notificationTemplate, emailTemplate] = await Promise.all([
    templateKeys.notification ? MessageTemplate.findOne({ key: templateKeys.notification, channel: "notification", isActive: true }).lean() : null,
    templateKeys.email ? MessageTemplate.findOne({ key: templateKeys.email, channel: "email", isActive: true }).lean() : null
  ]);
  const renderedTitle = notificationTemplate?.title ? renderTemplate(notificationTemplate.title, variables) : title;
  const renderedMessage = notificationTemplate?.body ? renderTemplate(notificationTemplate.body, variables) : message;
  const renderedEmailSubject = emailTemplate?.subject ? renderTemplate(emailTemplate.subject, variables) : (emailSubject || title);
  const renderedEmailHtml = emailTemplate?.body ? renderTemplate(emailTemplate.body, variables, { html: true }) : "";
  const transactional = type === "billing" || type === "security";
  const showInApp = forceInApp || (inApp && transactional) || (inApp && platform.inAppEnabled && (!keys.inApp || preferences[keys.inApp] !== false));
  const smtpConfigured = Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.mailFrom);
  const pushConfigured = isWebPushConfigured();
  const explicitAnnouncementConsent = keys.email !== "emailAnnouncements" || (preferences.emailAnnouncements === true && Boolean(preferences.emailAnnouncementsConsentAt));
  const emailPreferenceAllowed = transactional || !keys.email || (preferences[keys.email] !== false && explicitAnnouncementConsent);
  const shouldEmail = email && platform.emailEnabled && smtpConfigured && emailPreferenceAllowed;
  const shouldPush = push && platform.pushEnabled && preferences.pushEnabled === true && pushConfigured;
  const emailSkippedReason = shouldEmail || !email
    ? ""
    : !platform.emailEnabled
      ? "Email delivery is disabled in admin platform settings"
      : !smtpConfigured
        ? "SMTP is not configured"
        : !emailPreferenceAllowed
          ? "Disabled by learner email preferences"
          : "";
  const pushSkippedReason = shouldPush || !push
    ? ""
    : !platform.pushEnabled
      ? "Push delivery is disabled in admin platform settings"
      : !pushConfigured
        ? "Web Push VAPID keys are not configured"
        : preferences.pushEnabled !== true
          ? "Push is not enabled in learner preferences"
          : "";
  const payload = {
    user: userId,
    title: String(renderedTitle || "BuddyForStudy update").slice(0, 200),
    message: String(renderedMessage || "").slice(0, 5000),
    type,
    link: String(link || "").slice(0, 1000),
    showInApp,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      requestedChannels: [
        ...(inApp || forceInApp ? ["in_app"] : []),
        ...(email ? ["email"] : []),
        ...(push ? ["push"] : [])
      ]
    },
    emailStatus: shouldEmail ? "pending" : "skipped",
    emailSubject: String(renderedEmailSubject || "BuddyForStudy update").slice(0, 200),
    emailHtml: String(emailHtmlOverride || renderedEmailHtml || "").slice(0, 20000),
    emailError: emailSkippedReason,
    pushStatus: shouldPush ? "pending" : "skipped",
    pushError: pushSkippedReason
  };
  let notification;
  let created = true;

  try {
    if (eventKey) {
      const normalizedEventKey = String(eventKey).slice(0, 200);
      const result = await Notification.updateOne(
        { user: userId, eventKey: normalizedEventKey },
        { $setOnInsert: { ...payload, eventKey: normalizedEventKey } },
        { upsert: true }
      );
      created = Number(result.upsertedCount || 0) > 0;
      notification = await Notification.findOne({ user: userId, eventKey: normalizedEventKey });
    } else {
      notification = await Notification.create(payload);
    }
  } catch (error) {
    if (error?.code !== 11000 || !eventKey) throw error;
    created = false;
    notification = await Notification.findOne({ user: userId, eventKey: String(eventKey).slice(0, 200) });
  }
  if (!notification) return null;
  if (created && !deferDispatch) {
    if (payload.emailStatus === "pending") void dispatchEmail(notification._id).catch((error) => console.error("[notifications] email dispatch error", String(error?.message || error).slice(0, 200)));
    if (payload.pushStatus === "pending") void dispatchPush(notification._id).catch((error) => console.error("[notifications] push dispatch error", String(error?.message || error).slice(0, 200)));
  }
  return notification;
}

export async function deliverPendingNotificationEmails(limit = 50) {
  const platform = await getNotificationPlatformSettings();
  const mailer = getMailer();
  if (!mailer || !platform.emailEnabled) {
    const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
    const emailError = !platform.emailEnabled
      ? "Email delivery is disabled in admin platform settings"
      : "SMTP is not configured";
    const skipped = await Notification.updateMany(
      {
        emailStatus: "pending",
        $or: [
          { emailLastAttemptAt: null },
          { emailLastAttemptAt: { $lte: retryBefore } }
        ]
      },
      { $set: { emailStatus: "skipped", emailError } }
    );
    return { attempted: 0, skipped: skipped.modifiedCount };
  }
  const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
  const pending = await Notification.find({
    emailStatus: "pending",
    emailAttempts: { $lt: platform.emailRetryAttempts },
    $or: [{ emailLastAttemptAt: null }, { emailLastAttemptAt: { $lte: retryBefore } }]
  }).sort({ createdAt: 1 }).limit(Math.min(Math.max(limit, 1), 100)).select("_id").lean();
  const outcomes = await Promise.all(pending.map((item) => dispatchEmail(item._id)));
  return summarizeNotificationDeliveryOutcomes(outcomes);
}

export async function deliverPendingNotificationPush(limit = 50) {
  const platform = await getNotificationPlatformSettings();
  if (!platform.pushEnabled || !isWebPushConfigured()) {
    const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
    const pushError = !platform.pushEnabled
      ? "Push delivery is disabled in admin platform settings"
      : "Web Push VAPID keys are not configured";
    const skipped = await Notification.updateMany(
      {
        pushStatus: "pending",
        $or: [
          { pushLastAttemptAt: null },
          { pushLastAttemptAt: { $lte: retryBefore } }
        ]
      },
      { $set: { pushStatus: "skipped", pushError } }
    );
    return { attempted: 0, skipped: skipped.modifiedCount };
  }

  const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
  const pending = await Notification.find({
    pushStatus: "pending",
    pushAttempts: { $lt: platform.pushRetryAttempts },
    $or: [{ pushLastAttemptAt: null }, { pushLastAttemptAt: { $lte: retryBefore } }]
  }).sort({ createdAt: 1 }).limit(Math.min(Math.max(limit, 1), 100)).select("_id").lean();
  const outcomes = await Promise.all(pending.map((item) => dispatchPush(item._id)));
  return {
    attempted: outcomes.filter((item) => item?.status !== "not_attempted").length,
    failures: outcomes.filter((item) => ["failed", "retrying"].includes(item?.status) || item?.partialFailure).length
  };
}

export async function processSubscriptionExpiryReminders(now = new Date()) {
  const platform = await getNotificationPlatformSettings();
  if (!platform.subscriptionExpiryRemindersEnabled) {
    return { checked: 0, queued: 0, disabled: true };
  }

  const { start, end } = getSubscriptionExpiryReminderWindow(now, platform.subscriptionExpiryReminderDays);
  const eligible = {
    status: { $in: ["trialing", "active"] },
    cancelAtPeriodEnd: { $ne: true },
    currentPeriodEnd: { $gte: start, $lte: end }
  };
  const upperBound = await UserSubscription.findOne(eligible).sort({ _id: -1 }).select("_id").lean();
  if (!upperBound) return { checked: 0, queued: 0 };

  let cursor = null;
  let checked = 0;
  let queued = 0;
  while (true) {
    const filter = { ...eligible };
    filter._id = cursor ? { $gt: cursor, $lte: upperBound._id } : { $lte: upperBound._id };
    const subscriptions = await UserSubscription.find(filter)
      .sort({ _id: 1 })
      .limit(200)
      .populate("plan", "name billingInterval")
      .lean();
    if (!subscriptions.length) break;

    cursor = subscriptions[subscriptions.length - 1]._id;
    checked += subscriptions.length;
    for (const subscription of subscriptions) {
      try {
        const periodEnd = subscription.currentPeriodEnd;
        const subscriptionId = String(subscription.providerSubscriptionId || subscription._id);
        const eventKey = subscriptionExpiryReminderEventKey(subscriptionId, periodEnd);
        if (await Notification.exists({ user: subscription.user, eventKey })) continue;

        const planName = subscription.plan?.name || "BuddyForStudy";
        const currentPeriodEnd = formatBillingNotificationDate(periodEnd);
        const notification = await createNotificationEvent({
          userId: String(subscription.user),
          title: "Your subscription period is ending soon",
          message: "Your current billing period for " + planName + " ends on " + currentPeriodEnd + ". Review Billing for the latest renewal status or to manage your plan.",
          type: "billing",
          link: "/billing",
          eventKey,
          emailSubject: "Your BuddyForStudy billing period is ending soon",
          push: true,
          metadata: {
            subscriptionId,
            planName,
            billingInterval: subscription.plan?.billingInterval || "recurring",
            currentPeriodEnd,
            reminderDays: String(platform.subscriptionExpiryReminderDays)
          },
          templateKeys: { notification: "subscription-expiring-in-app", email: "subscription-expiring-email" }
        });
        if (notification) queued += 1;
      } catch (error) {
        console.error("[notifications] subscription expiry reminder failed", {
          subscriptionId: String(subscription.providerSubscriptionId || subscription._id),
          message: String(error?.message || "Unknown notification error").slice(0, 200)
        });
      }
    }
    if (subscriptions.length < 200) break;
  }
  return { checked, queued };
}

export async function reconcilePendingCoursePurchaseNotifications(now = new Date(), pageSize = 100) {
  const retryBefore = new Date(now.getTime() - RETRY_DELAY_MS);
  const eligible = {
    status: { $in: ["paid", "partially_refunded"] },
    course: { $ne: null },
    purchaseNotificationStatus: "pending",
    $or: [
      { purchaseNotificationLastCheckedAt: null },
      { purchaseNotificationLastCheckedAt: { $lte: retryBefore } }
    ]
  };
  const upperBound = await Payment.findOne(eligible).sort({ _id: -1 }).select("_id").lean();
  if (!upperBound) return { checked: 0, queued: 0, waitingForEnrollment: 0, failures: 0 };

  const limit = Math.min(Math.max(Math.trunc(Number(pageSize) || 100), 1), 500);
  let cursor = null;
  let checked = 0;
  let queued = 0;
  let waitingForEnrollment = 0;
  let failures = 0;

  while (true) {
    const filter = { ...eligible };
    filter._id = cursor
      ? { $gt: cursor, $lte: upperBound._id }
      : { $lte: upperBound._id };
    const payments = await Payment.find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .populate("course", "title")
      .lean();
    if (!payments.length) break;

    cursor = payments[payments.length - 1]._id;
    checked += payments.length;
    for (const payment of payments) {
      try {
        const course = payment.course;
        const enrollment = await Enrollment.findOne({
          user: payment.user,
          course: course?._id || payment.course,
          status: "active"
        }).lean();
        if (!enrollment) {
          waitingForEnrollment += 1;
          await Payment.updateOne(
            { _id: payment._id, purchaseNotificationStatus: "pending" },
            { $set: { purchaseNotificationLastCheckedAt: now } }
          );
          continue;
        }

        const notification = await createNotificationEvent(buildCoursePurchaseNotificationPayload({
          userId: String(payment.user),
          payment,
          course,
          enrollment
        }));
        if (!notification) throw new Error("Course purchase notification was not persisted");
        const updated = await Payment.updateOne(
          { _id: payment._id, purchaseNotificationStatus: "pending" },
          { $set: { purchaseNotificationStatus: "queued", purchaseNotificationQueuedAt: new Date(), purchaseNotificationLastCheckedAt: now } }
        );
        if (updated.modifiedCount > 0) queued += 1;
      } catch (error) {
        failures += 1;
        await Payment.updateOne(
          { _id: payment._id, purchaseNotificationStatus: "pending" },
          { $set: { purchaseNotificationLastCheckedAt: now } }
        ).catch(() => {});
        console.error("[notifications] course purchase reconciliation failed", {
          paymentId: String(payment._id),
          message: String(error?.message || "Unknown notification error").slice(0, 200)
        });
      }
    }

    if (payments.length < limit) break;
  }

  return { checked, queued, waitingForEnrollment, failures };
}

export async function reconcilePendingSubscriptionActivationNotifications(now = new Date(), pageSize = 100) {
  const retryBefore = new Date(now.getTime() - RETRY_DELAY_MS);
  const eligible = {
    provider: "razorpay",
    status: "paid",
    course: null,
    plan: { $ne: null },
    subscriptionNotificationStatus: "pending",
    $or: [
      { subscriptionNotificationLastCheckedAt: null },
      { subscriptionNotificationLastCheckedAt: { $lte: retryBefore } }
    ]
  };
  const upperBound = await Payment.findOne(eligible).sort({ _id: -1 }).select("_id").lean();
  if (!upperBound) return { checked: 0, queued: 0, waitingForActive: 0, failures: 0 };

  const limit = Math.min(Math.max(Math.trunc(Number(pageSize) || 100), 1), 500);
  let cursor = null;
  let checked = 0;
  let queued = 0;
  let waitingForActive = 0;
  let failures = 0;

  while (true) {
    const filter = { ...eligible };
    filter._id = cursor ? { $gt: cursor, $lte: upperBound._id } : { $lte: upperBound._id };
    const payments = await Payment.find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .populate("plan", "name billingInterval providerPlanId")
      .lean();
    if (!payments.length) break;

    cursor = payments[payments.length - 1]._id;
    checked += payments.length;

    for (const payment of payments) {
      try {
        const subscriptionId = String(payment.providerOrderId || "");
        if (!subscriptionId || !payment.plan) {
          throw new Error("Subscription payment is missing its provider reference or plan");
        }

        let subscription = await UserSubscription.findOne({
          user: payment.user,
          provider: "razorpay",
          providerSubscriptionId: subscriptionId,
          status: "active"
        }).populate("plan", "name billingInterval").lean();

        if (!subscription) {
          // Recover the brief crash window where payment was durably marked paid
          // before the active subscription document was written.
          const providerSubscription = await razorpay.fetchSubscription(subscriptionId);
          if (String(providerSubscription?.status || "").toLowerCase() !== "active") {
            waitingForActive += 1;
            await Payment.updateOne(
              { _id: payment._id, subscriptionNotificationStatus: "pending" },
              { $set: { subscriptionNotificationLastCheckedAt: now } }
            );
            continue;
          }
          if (payment.plan.providerPlanId &&
              String(providerSubscription?.plan_id || "") !== String(payment.plan.providerPlanId)) {
            throw new Error("Provider subscription plan does not match the recorded plan");
          }

          subscription = await UserSubscription.findOneAndUpdate(
            { user: payment.user },
            {
              $set: {
                plan: payment.plan._id,
                status: "active",
                provider: "razorpay",
                providerSubscriptionId: subscriptionId,
                currentPeriodStart: providerSubscription?.current_start
                  ? new Date(Number(providerSubscription.current_start) * 1000)
                  : new Date(),
                currentPeriodEnd: providerSubscription?.current_end
                  ? new Date(Number(providerSubscription.current_end) * 1000)
                  : null,
                cancelAtPeriodEnd: Boolean(providerSubscription?.end_at)
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          ).populate("plan", "name billingInterval");
        }

        const notification = await createNotificationEvent(buildSubscriptionActivatedNotificationPayload({
          userId: String(payment.user),
          payment,
          plan: subscription?.plan || payment.plan,
          subscription,
          subscriptionId
        }));
        if (!notification) throw new Error("Subscription activation notification was not persisted");

        const updated = await Payment.updateOne(
          { _id: payment._id, subscriptionNotificationStatus: "pending" },
          { $set: {
            subscriptionNotificationStatus: "queued",
            subscriptionNotificationQueuedAt: new Date(),
            subscriptionNotificationLastCheckedAt: now
          } }
        );
        if (updated.modifiedCount > 0) queued += 1;
      } catch (error) {
        failures += 1;
        await Payment.updateOne(
          { _id: payment._id, subscriptionNotificationStatus: "pending" },
          { $set: { subscriptionNotificationLastCheckedAt: now } }
        ).catch(() => {});
        console.error("[notifications] subscription activation reconciliation failed", {
          paymentId: String(payment._id),
          message: String(error?.message || "Unknown notification error").slice(0, 200)
        });
      }
    }

    if (payments.length < limit) break;
  }

  return { checked, queued, waitingForActive, failures };
}

export async function processLearningReminders(now = new Date(), batchSize = 500) {
  const platform = await getNotificationPlatformSettings();
  if (!platform.learningRemindersEnabled) return { checked: 0, sent: 0, disabled: true };

  // The requested batch size is a page size, not a total-run cap. This avoids
  // starving later users when earlier learners have different local reminder hours.
  const pageSize = Math.min(Math.max(Math.trunc(Number(batchSize) || 500), 1), 1000);
  let lastId = null;
  let checked = 0;
  let sent = 0;
  const processedUsers = new Set();

  while (true) {
    const filter = { status: "active" };
    if (lastId) filter._id = { $gt: lastId };
    const enrollments = await Enrollment.find(filter)
      .sort({ _id: 1 })
      .limit(pageSize)
      .populate("course", "title isPublished")
      .lean();
    if (!enrollments.length) break;

    checked += enrollments.length;
    lastId = enrollments[enrollments.length - 1]._id;
    const userIds = [...new Set(enrollments.map((item) => String(item.user)))];
    const courseIds = [...new Set(enrollments.map((item) => String(item.course?._id || item.course)).filter(Boolean))];
    const [preferenceDocs, progressDocs] = await Promise.all([
      NotificationPreference.find({ user: { $in: userIds } }).lean(),
      Progress.find({ user: { $in: userIds }, course: { $in: courseIds } }).lean()
    ]);
    const preferences = new Map(preferenceDocs.map((item) => [String(item.user), { ...DEFAULT_PREFERENCES, ...item }]));
    const progressMap = new Map(progressDocs.map((item) => [String(item.user) + ":" + String(item.course), item]));

    for (const enrollment of enrollments) {
      const userId = String(enrollment.user);
      const course = enrollment.course;
      if (!course?._id || course.isPublished === false || processedUsers.has(userId)) continue;

      const pref = preferences.get(userId) || { ...DEFAULT_PREFERENCES, user: userId };
      if (!pref.learningRemindersEnabled) {
        processedUsers.add(userId);
        continue;
      }

      const clock = getReminderClock(now, pref.timezone || "Asia/Kolkata");
      if (clock.hour !== Number(pref.reminderHour ?? 18) ||
          isWithinQuietHours(clock.hour, pref.quietHoursStart ?? 22, pref.quietHoursEnd ?? 8)) {
        processedUsers.add(userId);
        continue;
      }

      const eventKey = learningReminderEventKey(userId, clock.dateKey);
      if (await Notification.exists({ user: userId, eventKey })) {
        processedUsers.add(userId);
        continue;
      }

      const progress = progressMap.get(userId + ":" + String(course._id));
      if (progress && Number(progress.percentage || 0) >= 100) continue;
      const lastActivity = progress?.lastAccessedAt || enrollment.updatedAt || enrollment.enrolledAt;
      if (!hasBeenInactive(now, lastActivity, platform.inactiveDays)) continue;

      const notice = await createNotificationEvent({
        userId,
        title: "Your next learning session is waiting",
        message: "Pick up where you left off in " + course.title + ". A short session today can keep your learning progress moving.",
        type: "learning",
        link: "/courses/" + course._id + "/roadmap",
        eventKey,
        emailSubject: "Your BuddyForStudy learning reminder",
        email: pref.emailLearningReminders !== false,
        push: true,
        metadata: { courseId: String(course._id), courseTitle: course.title, reminderDate: clock.dateKey },
        templateKeys: { notification: "learning-reminder-in-app", email: "learning-reminder-email" }
      });
      if (notice) {
        processedUsers.add(userId);
        sent += 1;
      }
    }

    if (enrollments.length < pageSize) break;
  }

  return { checked, sent };
}

import { isValidObjectId } from "../utils/ids.js";
import { Notification } from "../models/Notification.js";
import { failure, success } from "../utils/response.js";
import { z } from "zod";
import { getUserNotificationPreferences, saveUserNotificationPreferences, verifyEmailUnsubscribeToken } from "../services/notification.service.js";
import { isWithinQuietHours } from "../services/reminderScheduling.js";

import { PushSubscription } from "../models/PushSubscription.js";
import { getWebPushPublicKey, isWebPushConfigured, sendWebPushNotification } from "../services/webPush.service.js";
import { isIP } from "node:net";
import { hasExplicitPushConsentChoice, recordPushNotificationConsent, revokeMarketingEmailConsent } from "../services/consent.service.js";

function unsubscribePage(res, { title, message, token = "", status = 200, showForm = false }) {
  const safeToken = /^[A-Za-z0-9_.-]{1,2048}$/.test(token) ? token : "";
  const form = showForm
    ? `<form method="post" action="/api/notifications/unsubscribe"><input type="hidden" name="token" value="${safeToken}"><button type="submit" style="background:#111827;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:600;cursor:pointer">Unsubscribe from promotional emails</button></form>`
    : "";
  return res.status(status).type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#111827"><h1>${title}</h1><p>${message}</p>${form}<p style="color:#6b7280;font-size:13px;margin-top:28px">BuddyForStudy email preferences</p></body></html>`);
}

export async function unsubscribeLanding(req, res) {
  const token = String(req.query?.token || "");
  const claims = verifyEmailUnsubscribeToken(token);
  if (!claims) return unsubscribePage(res, {
    title: "Unsubscribe link expired",
    message: "This link is invalid or has expired. You can update email preferences from your BuddyForStudy account.",
    status: 400
  });
  return unsubscribePage(res, {
    title: "Manage promotional emails",
    message: "Confirm below to stop receiving promotional emails from BuddyForStudy. Important account, security, and billing emails are not affected.",
    token,
    showForm: true
  });
}

export async function unsubscribePromotionalEmails(req, res, next) {
  try {
    const token = String(req.body?.token || req.query?.token || "");
    const claims = verifyEmailUnsubscribeToken(token);
    if (!claims) return unsubscribePage(res, {
      title: "Unsubscribe link expired",
      message: "This link is invalid or has expired. You can update email preferences from your BuddyForStudy account.",
      status: 400
    });
    await revokeMarketingEmailConsent(claims.userId);
    return unsubscribePage(res, {
      title: "You are unsubscribed",
      message: "Promotional emails have been turned off for this account. Transactional account, security, and billing emails may still be sent."
    });
  } catch (error) {
    return next(error);
  }
}

export async function list(req, res, next) {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 50;
    const notifications = await Notification.find({ user: req.user.userId, showInApp: { $ne: false } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      user: req.user.userId,
      showInApp: { $ne: false },
      readAt: null
    });

    return success(res, { notifications, unreadCount });
  } catch (e) {
    next(e);
  }
}

export async function markRead(req, res, next) {
  try {
    if (!isValidObjectId(req.params.notificationId)) {
      return failure(res, "Invalid notificationId", 400);
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user.userId },
      { $set: { readAt: new Date() } },
      { new: true }
    ).lean();

    if (!notification) return failure(res, "Notification not found", 404);

    return success(res, { notification }, "Notification marked as read");
  } catch (e) {
    next(e);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const result = await Notification.updateMany(
      { user: req.user.userId, showInApp: { $ne: false }, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return success(res, { updated: result.modifiedCount }, "Notifications marked as read");
  } catch (e) {
    next(e);
  }
}

const preferencesSchema = z.object({
  emailCourseUpdates: z.boolean().optional(),
  inAppCourseUpdates: z.boolean().optional(),
  emailProjectUpdates: z.boolean().optional(),
  inAppProjectUpdates: z.boolean().optional(),
  emailAnnouncements: z.boolean().optional(),
  inAppAnnouncements: z.boolean().optional(),
  emailLearningReminders: z.boolean().optional(),
  inAppLearningReminders: z.boolean().optional(),
  learningRemindersEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional()
});

export async function getPreferences(req, res, next) {
  try {
    const preferences = await getUserNotificationPreferences(req.user.userId);
    return success(res, {
      preferences,
      pushAvailable: isWebPushConfigured()
    });
  } catch (e) {
    next(e);
  }
}

export async function updatePreferences(req, res, next) {
  try {
    const input = preferencesSchema.parse(req.body);
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(new Date());
      } catch {
        return failure(res, "Timezone must be a valid IANA timezone, such as Asia/Kolkata.", 400);
      }
    }
    const current = await getUserNotificationPreferences(req.user.userId);
    const next = { ...current, ...input };
    if (next.learningRemindersEnabled && isWithinQuietHours(next.reminderHour, next.quietHoursStart, next.quietHoursEnd)) {
      return failure(res, "Reminder time falls within quiet hours. Choose a reminder time outside the quiet-hour window.", 400);
    }
    const preferences = await saveUserNotificationPreferences(req.user.userId, input);
    // This field is sent only by the explicit Enable/Disable push action.
    // General preference saves omit it so they cannot manufacture consent events.
    if (hasExplicitPushConsentChoice(input)) {
      await recordPushNotificationConsent(req.user.userId, input.pushEnabled);
    }
    return success(res, { preferences, pushAvailable: isWebPushConfigured() }, "Notification preferences saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid notification preferences", 400, e.flatten().fieldErrors);
    next(e);
  }
}


const browserPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512)
  }),
  userAgent: z.string().max(500).optional()
});

const pushEndpointSchema = z.object({ endpoint: z.string().url().max(2048) });

export function isPushSubscriptionOwnedByUser(subscription, userId) {
  return !subscription || String(subscription.user) === String(userId);
}

function isAllowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (isIP(hostname)) return false;

    // Only accept endpoints issued by major browser push services. This avoids
    // using authenticated registration as an arbitrary outbound-request proxy.
    return hostname === "fcm.googleapis.com" ||
      hostname === "web.push.apple.com" ||
      hostname.endsWith(".push.apple.com") ||
      hostname === "push.services.mozilla.com" ||
      hostname.endsWith(".push.services.mozilla.com") ||
      hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

export async function getPushPublicKey(req, res, next) {
  try {
    if (!isWebPushConfigured()) return failure(res, "Web Push is not configured on the server.", 503);
    return success(res, { publicKey: getWebPushPublicKey() });
  } catch (e) {
    next(e);
  }
}

export async function registerPushSubscription(req, res, next) {
  try {
    if (!isWebPushConfigured()) return failure(res, "Web Push is not configured on the server.", 503);
    const input = browserPushSubscriptionSchema.parse(req.body);
    if (!isAllowedPushEndpoint(input.endpoint)) {
      return failure(res, "The push endpoint must be a public HTTPS browser push-service URL.", 400);
    }

    // A push endpoint is a credential-like identifier. Never let one
    // authenticated user transfer an endpoint already registered to another.
    const existingSubscription = await PushSubscription.findOne({ endpoint: input.endpoint }).select("user");
    if (!isPushSubscriptionOwnedByUser(existingSubscription, req.user.userId)) {
      return failure(res, "This browser push endpoint is already registered to another account.", 409);
    }

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint: input.endpoint, user: req.user.userId },
      {
        $set: {
          user: req.user.userId,
          endpoint: input.endpoint,
          keys: input.keys,
          expirationTime: input.expirationTime ?? null,
          userAgent: input.userAgent || String(req.get("user-agent") || "").slice(0, 500),
          active: true,
          lastError: "",
          lastFailureAt: null,
          deactivatedAt: null
        },
        $setOnInsert: { lastSuccessAt: null }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).select("_id active");

    // Registering a device subscription must not silently change the account's
    // notification preference. The explicit Settings action saves pushEnabled
    // separately and records the consent event.
    return success(res, { subscription: { id: String(subscription._id), active: subscription.active } }, "Browser push subscription saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid browser push subscription", 400, e.flatten().fieldErrors);
    // A concurrent registration can race after the ownership check. The
    // unique endpoint index remains authoritative and must not enable takeover.
    if (e?.code === 11000) return failure(res, "This browser push endpoint is already registered to another account.", 409);
    next(e);
  }
}

export async function removePushSubscription(req, res, next) {
  try {
    const input = pushEndpointSchema.parse(req.body);
    const result = await PushSubscription.updateOne(
      { user: req.user.userId, endpoint: input.endpoint },
      { $set: { active: false, deactivatedAt: new Date() } }
    );
    return success(res, { deactivated: result.modifiedCount }, "Browser push subscription removed");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid push endpoint", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function sendTestPush(req, res, next) {
  try {
    if (!isWebPushConfigured()) return failure(res, "Web Push is not configured on the server.", 503);
    const preferences = await getUserNotificationPreferences(req.user.userId);
    if (preferences.pushEnabled !== true) return failure(res, "Enable push notifications before sending a test.", 409);

    const subscriptions = await PushSubscription.find({ user: req.user.userId, active: true }).lean();
    if (!subscriptions.length) return failure(res, "This browser has no active push subscription. Enable push first.", 409);

    let sent = 0;
    let failed = 0;
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await sendWebPushNotification(subscription, {
          title: "BuddyForStudy test notification",
          body: "Push notifications are connected to this device.",
          url: "/settings",
          notificationId: "test-" + Date.now()
        });
        sent += 1;
        await PushSubscription.updateOne({ _id: subscription._id }, {
          $set: { lastSuccessAt: new Date(), lastError: "", lastFailureAt: null }
        });
      } catch (error) {
        failed += 1;
        const statusCode = Number(error?.statusCode || error?.status || 0);
        const expired = statusCode === 404 || statusCode === 410;
        await PushSubscription.updateOne({ _id: subscription._id }, {
          $set: {
            ...(expired ? { active: false, deactivatedAt: new Date() } : {}),
            lastFailureAt: new Date(),
            lastError: expired ? "Push subscription expired or no longer exists" : String(error?.message || "Web Push delivery failed").slice(0, 400)
          }
        });
      }
    }));

    if (!sent) return failure(res, "Web Push could not deliver to this browser. Check server logs and try subscribing again.", 502);
    return success(res, { attempted: subscriptions.length, sent, failed }, "Test push submitted");
  } catch (error) {
    // Per-subscription delivery failures are handled inside the Promise.all
    // callback above. Errors from preference lookup, subscription retrieval,
    // or persistence belong to the normal Express error pipeline.
    return next(error);
  }
}

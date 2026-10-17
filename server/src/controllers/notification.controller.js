import { isValidObjectId } from "../utils/ids.js";
import { Notification } from "../models/Notification.js";
import { failure, success } from "../utils/response.js";
import { z } from "zod";
import { getUserNotificationPreferences, saveUserNotificationPreferences } from "../services/notification.service.js";
import { isWithinQuietHours } from "../services/reminderScheduling.js";
import { NotificationPreference } from "../models/NotificationPreference.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { getWebPushPublicKey, isWebPushConfigured, sendWebPushNotification } from "../services/webPush.service.js";
import { isIP } from "node:net";

export async function list(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
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

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint: input.endpoint },
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

    await NotificationPreference.findOneAndUpdate(
      { user: req.user.userId },
      { $set: { pushEnabled: true }, $setOnInsert: { user: req.user.userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return success(res, { subscription: { id: String(subscription._id), active: subscription.active } }, "Browser push subscription saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid browser push subscription", 400, e.flatten().fieldErrors);
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
    failed += 1;

    const statusCode = Number(error?.statusCode || error?.status || 0);
    const expired = statusCode === 404 || statusCode === 410;
    const responseBody = String(error?.body || "");
    const details = [
      error?.message || "Web Push delivery failed",
      statusCode ? `HTTP ${statusCode}` : "",
      responseBody ? `Response: ${responseBody}` : ""
    ].filter(Boolean).join(" | ").slice(0, 400);

    console.error("[web-push] Test delivery failed", {
      statusCode,
      message: error?.message,
      responseBody: responseBody.slice(0, 300)
    });

    await PushSubscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          ...(expired
            ? { active: false, deactivatedAt: new Date() }
            : {}),
          lastFailureAt: new Date(),
          lastError: expired
            ? "Push subscription expired or no longer exists"
            : details
        }
      }
    );
  }
}

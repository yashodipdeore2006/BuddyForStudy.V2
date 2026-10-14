import { isValidObjectId } from "../utils/ids.js";
import { Notification } from "../models/Notification.js";
import { failure, success } from "../utils/response.js";
import { z } from "zod";
import { env } from "../config/env.js";
import { getUserNotificationPreferences, saveUserNotificationPreferences } from "../services/notification.service.js";

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
  reminderHour: z.number().int().min(0).max(23).optional()
});

export async function getPreferences(req, res, next) {
  try {
    const preferences = await getUserNotificationPreferences(req.user.userId);
    return success(res, {
      preferences,
      pushAvailable: Boolean(env.oneSignalAppId && env.oneSignalRestApiKey)
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
    const preferences = await saveUserNotificationPreferences(req.user.userId, input);
    return success(res, { preferences, pushAvailable: Boolean(env.oneSignalAppId && env.oneSignalRestApiKey) }, "Notification preferences saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid notification preferences", 400, e.flatten().fieldErrors);
    next(e);
  }
}

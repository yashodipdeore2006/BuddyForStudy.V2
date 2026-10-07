import { isValidObjectId } from "../utils/ids.js";
import { Notification } from "../models/Notification.js";
import { failure, success } from "../utils/response.js";

export async function list(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const notifications = await Notification.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      user: req.user.userId,
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
      { user: req.user.userId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return success(res, { updated: result.modifiedCount }, "Notifications marked as read");
  } catch (e) {
    next(e);
  }
}

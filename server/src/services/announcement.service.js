import crypto from "node:crypto";
import { Announcement } from "../models/Announcement.js";
import { Notification } from "../models/Notification.js";
import { createNotificationEvent } from "./notification.service.js";

async function mapLimit(items, limit, callback) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    results.push(...await Promise.all(batch.map(callback)));
  }
  return results;
}

function statsPipeline(announcement) {
  const requested = new Set(announcement.channel || []);
  const successConditions = [];
  const failedConditions = [];
  const pendingConditions = [];
  if (requested.has("in_app")) successConditions.push({ $eq: ["$showInApp", true] });
  if (requested.has("email")) {
    successConditions.push({ $eq: ["$emailStatus", "sent"] });
    failedConditions.push({ $eq: ["$emailStatus", "failed"] });
    pendingConditions.push({ $eq: ["$emailStatus", "pending"] });
  }
  if (requested.has("push")) {
    successConditions.push({ $eq: ["$pushStatus", "sent"] });
    failedConditions.push({ $eq: ["$pushStatus", "failed"] });
    pendingConditions.push({ $eq: ["$pushStatus", "pending"] });
  }
  const any = (conditions) => conditions.length ? { $or: conditions } : false;
  return [
    { $match: { "metadata.announcementId": String(announcement._id) } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      sent: { $sum: { $cond: [any(successConditions), 1, 0] } },
      failed: { $sum: { $cond: [{ $and: [{ $not: [any(successConditions)] }, any(failedConditions)] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $and: [{ $not: [any(successConditions)] }, { $not: [any(failedConditions)] }, any(pendingConditions)] }, 1, 0] } },
      in_app_sent: { $sum: { $cond: [{ $eq: ["$showInApp", true] }, 1, 0] } },
      email_sent: { $sum: { $cond: [{ $eq: ["$emailStatus", "sent"] }, 1, 0] } },
      email_pending: { $sum: { $cond: [{ $eq: ["$emailStatus", "pending"] }, 1, 0] } },
      email_failed: { $sum: { $cond: [{ $eq: ["$emailStatus", "failed"] }, 1, 0] } },
      email_skipped: { $sum: { $cond: [{ $eq: ["$emailStatus", "skipped"] }, 1, 0] } },
      push_sent: { $sum: { $cond: [{ $eq: ["$pushStatus", "sent"] }, 1, 0] } },
      push_pending: { $sum: { $cond: [{ $eq: ["$pushStatus", "pending"] }, 1, 0] } },
      push_failed: { $sum: { $cond: [{ $eq: ["$pushStatus", "failed"] }, 1, 0] } },
      push_skipped: { $sum: { $cond: [{ $eq: ["$pushStatus", "skipped"] }, 1, 0] } }
    } }
  ];
}

export async function refreshAnnouncementStats(announcement) {
  const rows = await Notification.aggregate(statsPipeline(announcement));
  const row = rows[0] || {};
  const total = Number(announcement.recipientIds?.length || announcement.stats?.total || 0);
  const sent = Number(row.sent || 0);
  const channelFailed = Number(row.failed || 0);
  const channelPending = Number(row.pending || 0);
  const processed = Number(row.total || 0);
  const unprocessed = Math.max(0, total - processed);
  const cancelled = announcement.status === "cancelled";
  const abandoned = announcement.status === "failed" ? unprocessed : 0;
  const failed = channelFailed + abandoned;
  const skipped = cancelled
    ? Math.max(0, total - sent - failed - channelPending)
    : Math.max(0, processed - sent - failed - channelPending);
  const pending = cancelled || abandoned ? channelPending : Math.max(channelPending, total - sent - failed - skipped);
  const terminalUnprocessed = cancelled ? unprocessed : abandoned;
  const stats = {
    total, sent, failed, skipped, pending,
    in_app: {
      sent: announcement.channel?.includes("in_app") ? Number(row.in_app_sent || 0) : 0,
      pending: announcement.channel?.includes("in_app") && !cancelled && !abandoned ? unprocessed : 0, failed: announcement.channel?.includes("in_app") ? terminalUnprocessed : 0,
      skipped: announcement.channel?.includes("in_app") ? Math.max(0, processed - Number(row.in_app_sent || 0)) + (cancelled ? unprocessed : 0) : 0
    },
    email: announcement.channel?.includes("email") ? {
      sent: Number(row.email_sent || 0), pending: Number(row.email_pending || 0) + (!cancelled && !abandoned ? unprocessed : 0),
      failed: Number(row.email_failed || 0) + abandoned, skipped: Number(row.email_skipped || 0) + (cancelled ? unprocessed : 0)
    } : { sent: 0, pending: 0, failed: 0, skipped: 0 },
    push: announcement.channel?.includes("push") ? {
      sent: Number(row.push_sent || 0), pending: Number(row.push_pending || 0) + (!cancelled && !abandoned ? unprocessed : 0),
      failed: Number(row.push_failed || 0) + abandoned, skipped: Number(row.push_skipped || 0) + (cancelled ? unprocessed : 0)
    } : { sent: 0, pending: 0, failed: 0, skipped: 0 }
  };
  await Announcement.updateOne({ _id: announcement._id }, { $set: { stats } });
  return stats;
}

/**
 * Claims bounded chunks with an expiring lease. Notification event keys are
 * deterministic per campaign and recipient, so a crash after enqueueing but
 * before advancing the cursor safely replays the same batch without duplicates.
 */
export async function processScheduledAnnouncements(now = new Date(), maxBatches = 5, batchSize = 100) {
  const safeBatchCount = Math.min(50, Math.max(1, Math.trunc(Number(maxBatches) || 5)));
  const safeBatchSize = Math.min(100, Math.max(1, Math.trunc(Number(batchSize) || 100)));
  let batches = 0;
  let recipientsQueued = 0;
  let failures = 0;

  while (batches < safeBatchCount) {
    const lockToken = crypto.randomUUID();
    const lockUntil = new Date(now.getTime() + 5 * 60 * 1000);
    const announcement = await Announcement.findOneAndUpdate(
      {
        $or: [
          { status: "sending" },
          { status: "scheduled", scheduledAt: { $lte: now } }
        ],
        $and: [
          { $or: [{ batchLockUntil: null }, { batchLockUntil: { $lte: now } }] },
          { $or: [{ nextBatchAt: null }, { nextBatchAt: { $lte: now } }] }
        ]
      },
      {
        $set: { status: "sending", batchLockUntil: lockUntil, batchLockToken: lockToken, lastError: "" },
        $inc: { batchAttempts: 1 }
      },
      { new: true, sort: { lastBatchAt: 1, createdAt: 1, _id: 1 } }
    );
    if (!announcement) break;
    batches += 1;

    if (!announcement.startedAt) {
      await Announcement.updateOne({ _id: announcement._id, batchLockToken: lockToken }, { $set: { startedAt: now } });
    }
    const recipientIds = announcement.recipientIds || [];
    const start = Math.max(0, Number(announcement.nextRecipientIndex) || 0);
    if (start >= recipientIds.length) {
      const stats = await refreshAnnouncementStats(announcement);
      const finished = stats.pending === 0;
      await Announcement.updateOne(
        { _id: announcement._id, batchLockToken: lockToken },
        { $set: {
          status: finished ? (stats.failed > 0 ? "failed" : "sent") : "sending",
          ...(finished ? { sentAt: now, completedAt: now, nextBatchAt: null } : { nextBatchAt: new Date(now.getTime() + 30 * 1000) }),
          batchLockUntil: null, batchLockToken: "", batchAttempts: 0
        } }
      );
      continue;
    }

    const batch = recipientIds.slice(start, start + safeBatchSize);
    let outcomes;
    try {
      outcomes = await mapLimit(batch, 10, async (userId) => createNotificationEvent({
        userId: String(userId), title: announcement.title, message: announcement.message, type: "promotion",
        link: announcement.link, eventKey: "announcement:" + announcement._id + ":" + userId,
        inApp: announcement.channel.includes("in_app"), email: announcement.channel.includes("email"),
        push: announcement.channel.includes("push"), deferDispatch: true,
        metadata: { source: "admin-announcement", announcementId: String(announcement._id), initiatedBy: String(announcement.createdBy) }
      }));
      if (outcomes.some((item) => !item)) throw new Error("Announcement batch produced an empty notification result");
    } catch (error) {
      failures += 1;
      await recoverAnnouncementBatch(announcement._id, lockToken, error, now);
      continue;
    }
    const nextIndex = start + batch.length;
    const updated = await Announcement.updateOne(
      { _id: announcement._id, batchLockToken: lockToken, nextRecipientIndex: start },
      { $set: { nextRecipientIndex: nextIndex, batchLockUntil: null, nextBatchAt: null, lastBatchAt: now, batchLockToken: "", batchAttempts: 0 } }
    );
    if (!updated.modifiedCount) continue;
    recipientsQueued += batch.length;
    const stats = await refreshAnnouncementStats(announcement);
    if (nextIndex >= recipientIds.length) {
      const finished = stats.pending === 0;
      await Announcement.updateOne(
        { _id: announcement._id, nextRecipientIndex: nextIndex, batchLockToken: "" },
        { $set: {
          status: finished ? (stats.failed > 0 ? "failed" : "sent") : "sending",
          ...(finished ? { sentAt: now, completedAt: now, nextBatchAt: null } : { nextBatchAt: new Date(now.getTime() + 30 * 1000) })
        } }
      );
    }
  }
  return { batches, recipientsQueued, failures };
}

export async function recoverAnnouncementBatch(announcementId, lockToken, error, now = new Date()) {
  const message = String(error?.message || "Announcement batch failed").slice(0, 500);
  const announcement = await Announcement.findOne({ _id: announcementId, batchLockToken: lockToken }).select("batchAttempts").lean();
  if (!announcement) return;
  const attempts = Number(announcement.batchAttempts || 0);
  await Announcement.updateOne(
    { _id: announcementId, batchLockToken: lockToken },
    { $set: {
      ...(attempts >= 5 ? { status: "failed", completedAt: now } : {}),
      batchLockUntil: null, batchLockToken: "", lastError: message,
      ...(attempts < 5 ? { nextBatchAt: new Date(now.getTime() + Math.min(15 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attempts - 1)))) } : {})
    } }
  );
  if (attempts < 5) console.warn("[announcements] batch will be retried", { announcementId: String(announcementId), attempts });
}

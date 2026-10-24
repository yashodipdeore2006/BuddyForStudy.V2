import crypto from "node:crypto";
import { AuditLog } from "../models/AuditLog.js";
import { AuditOutbox } from "../models/AuditOutbox.js";

export async function recordAuditEvent(event) {
  const eventId = crypto.randomUUID();
  const idempotentEvent = { ...event, eventId };
  try {
    await AuditLog.create(idempotentEvent);
    return { recorded: true, queued: false };
  } catch (auditError) {
    try {
      await AuditOutbox.create({
        eventId,
        event: idempotentEvent,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: String(auditError?.message || "Audit write failed").slice(0, 500)
      });
      return { recorded: false, queued: true };
    } catch (outboxError) {
      console.error("[audit-outbox] Failed to persist audit event for retry.", {
        auditError: String(auditError?.message || "Unknown audit error").slice(0, 300),
        outboxError: String(outboxError?.message || "Unknown outbox error").slice(0, 300)
      });
      return { recorded: false, queued: false };
    }
  }
}

export async function processPendingAuditOutbox(limit = 100, now = new Date()) {
  const requestedBatchSize = Number(limit);
  const batchSize = Math.max(1, Math.min(Number.isFinite(requestedBatchSize) && requestedBatchSize !== 0 ? Math.trunc(requestedBatchSize) : 100, 500));
  let processed = 0;
  let failures = 0;

  // Recover work abandoned by a worker crash. Idempotent event IDs make
  // replay safe even if the audit write succeeded before the crash.
  await AuditOutbox.updateMany(
    { status: "processing", lockedAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } },
    { $set: { status: "pending", lockedAt: null } }
  );

  for (let index = 0; index < batchSize; index += 1) {
    const item = await AuditOutbox.findOneAndUpdate(
      { status: "pending", nextAttemptAt: { $lte: now } },
      { $set: { status: "processing", lockedAt: now } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, new: true }
    );
    if (!item) break;

    try {
      await AuditLog.updateOne(
        { eventId: item.eventId },
        { $setOnInsert: item.event },
        { upsert: true }
      );
      await AuditOutbox.deleteOne({ _id: item._id, status: "processing" });
      processed += 1;
    } catch (error) {
      failures += 1;
      const attempts = Number(item.attempts || 0) + 1;
      const backoffMs = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 12)));
      await AuditOutbox.updateOne(
        { _id: item._id, status: "processing" },
        { $set: {
          status: "pending",
          attempts,
          nextAttemptAt: new Date(now.getTime() + backoffMs),
          lastError: String(error?.message || "Audit retry failed").slice(0, 500),
          lockedAt: null
        } }
      );
    }
  }

  return { processed, failures };
}

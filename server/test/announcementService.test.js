import test from "node:test";
import assert from "node:assert/strict";
import { Announcement } from "../src/models/Announcement.js";
import { Notification } from "../src/models/Notification.js";
import { parseAnnouncementChannels } from "../src/utils/announcementChannels.js";
import {
  normalizeAnnouncementBatchLimits,
  recoverAnnouncementBatch,
  refreshAnnouncementStats
} from "../src/services/announcement.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); }
  finally { for (const { target, key, original } of originals.reverse()) target[key] = original; }
}

test("announcement channel selection is deduplicated and rejects unknown channels", () => {
  assert.deepEqual(parseAnnouncementChannels(["email", "push", "email"]), ["email", "push"]);
  assert.deepEqual(parseAnnouncementChannels("in_app"), ["in_app"]);
  assert.equal(parseAnnouncementChannels([]), null);
  assert.equal(parseAnnouncementChannels(["email", "sms"]), null);
});

test("announcement batch limits remain bounded for caller-supplied values", () => {
  assert.deepEqual(normalizeAnnouncementBatchLimits(0, 0), { maxBatches: 5, batchSize: 100 });
  assert.deepEqual(normalizeAnnouncementBatchLimits(1000, 1000), { maxBatches: 50, batchSize: 100 });
  assert.deepEqual(normalizeAnnouncementBatchLimits(-10, -10), { maxBatches: 1, batchSize: 1 });
  assert.deepEqual(normalizeAnnouncementBatchLimits(3.9, 12.8), { maxBatches: 3, batchSize: 12 });
});

test("announcement batch failures use bounded exponential retry and release their lease", async () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  let update;
  await withMocks([
    [Announcement, {
      findOne: () => ({ select() { return this; }, lean: async () => ({ batchAttempts: 3 }) }),
      updateOne: async (_filter, value) => { update = value; return { modifiedCount: 1 }; }
    }]
  ], async () => {
    await recoverAnnouncementBatch("announcement-1", "lock-token", new Error("temporary provider failure"), now);
  });
  assert.equal(update.$set.batchLockUntil, null);
  assert.equal(update.$set.batchLockToken, "");
  assert.equal(update.$set.lastError, "temporary provider failure");
  assert.equal(update.$set.nextBatchAt.toISOString(), "2026-10-30T12:02:00.000Z");
  assert.equal(update.$set.status, undefined);
});

test("fifth announcement batch failure is dead-lettered and cannot be rescheduled", async () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  let update;
  await withMocks([
    [Announcement, {
      findOne: () => ({ select() { return this; }, lean: async () => ({ batchAttempts: 5 }) }),
      updateOne: async (_filter, value) => { update = value; return { modifiedCount: 1 }; }
    }]
  ], async () => {
    await recoverAnnouncementBatch("announcement-2", "lock-token", new Error("permanent provider failure"), now);
  });
  assert.equal(update.$set.status, "failed");
  assert.equal(update.$set.completedAt, now);
  assert.equal(update.$set.nextBatchAt, null);
  assert.equal(update.$set.batchLockUntil, null);
  assert.equal(update.$set.batchLockToken, "");
});

test("announcement delivery report keeps channel results separate", async () => {
  let savedStats;
  await withMocks([
    [Notification, {
      aggregate: async () => [{
        total: 2,
        sent: 1,
        failed: 1,
        pending: 0,
        in_app_sent: 0,
        email_sent: 1,
        email_pending: 0,
        email_failed: 1,
        email_skipped: 0,
        push_sent: 0,
        push_pending: 0,
        push_failed: 0,
        push_skipped: 0
      }]
    }],
    [Announcement, {
      updateOne: async (_filter, update) => { savedStats = update.$set.stats; return { modifiedCount: 1 }; }
    }]
  ], async () => {
    const stats = await refreshAnnouncementStats({
      _id: "announcement-3",
      recipientIds: ["user-1", "user-2"],
      channel: ["email"],
      status: "sent",
      stats: {}
    });
    assert.equal(stats.email.sent, 1);
    assert.equal(stats.email.failed, 1);
    assert.deepEqual(stats.in_app, { sent: 0, pending: 0, failed: 0, skipped: 0 });
    assert.deepEqual(stats.push, { sent: 0, pending: 0, failed: 0, skipped: 0 });
  });
  assert.equal(savedStats.email.failed, 1);
});

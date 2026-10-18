import test from "node:test";
import assert from "node:assert/strict";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { processPendingAuditOutbox, recordAuditEvent } from "../src/services/auditOutbox.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

test("audit events are queued for retry when the audit collection write fails", async () => {
  let queued;
  await withMocks([
    [AuditLog, { create: async () => { throw new Error("audit collection unavailable"); } }],
    [AuditOutbox, { create: async (entry) => { queued = entry; return entry; } }]
  ], async () => {
    const result = await recordAuditEvent({ action: "admin.invitation.accepted", targetType: "user", targetId: "u1" });
    assert.deepEqual(result, { recorded: false, queued: true });
    assert.equal(queued.status, "pending");
    assert.equal(queued.event.eventId, queued.eventId);
    assert.equal(queued.event.action, "admin.invitation.accepted");
    assert.match(queued.lastError, /unavailable/);
  });
});

test("audit outbox replay is idempotent and removes successfully persisted events", async () => {
  const event = { eventId: "event-123", action: "admin.invitation.accepted", targetType: "user", targetId: "u1" };
  let claimCount = 0;
  let storedFilter;
  let storedUpdate;
  let deleted;
  let recoveredStaleLocks = false;
  await withMocks([
    [AuditOutbox, {
      updateMany: async () => { recoveredStaleLocks = true; },
      findOneAndUpdate: async () => {
        claimCount += 1;
        return claimCount === 1 ? { _id: "outbox-1", eventId: event.eventId, event, attempts: 0 } : null;
      },
      deleteOne: async (filter) => { deleted = filter; }
    }],
    [AuditLog, { updateOne: async (filter, update, options) => {
      storedFilter = filter;
      storedUpdate = update;
      assert.equal(options.upsert, true);
    } }]
  ], async () => {
    const result = await processPendingAuditOutbox(10, new Date("2026-10-18T12:00:00.000Z"));
    assert.deepEqual(result, { processed: 1, failures: 0 });
    assert.equal(recoveredStaleLocks, true);
    assert.deepEqual(storedFilter, { eventId: "event-123" });
    assert.deepEqual(storedUpdate.$setOnInsert, event);
    assert.deepEqual(deleted, { _id: "outbox-1", status: "processing" });
  });
});


test("audit outbox retry records failure details and applies bounded exponential backoff", async () => {
  const now = new Date("2026-10-18T12:00:00.000Z");
  const item = {
    _id: "outbox-2",
    eventId: "event-retry",
    event: { eventId: "event-retry", action: "admin.invitation.revoked", targetType: "admin_invitation", targetId: "i1" },
    attempts: 0
  };
  let updated;
  let updateFilter;
  await withMocks([
    [AuditOutbox, {
      updateMany: async () => ({}),
      findOneAndUpdate: async () => item,
      updateOne: async (filter, update) => { updateFilter = filter; updated = update.$set; }
    }],
    [AuditLog, { updateOne: async () => { throw new Error("audit database temporarily unavailable"); } }]
  ], async () => {
    const result = await processPendingAuditOutbox(1, now);
    assert.deepEqual(result, { processed: 0, failures: 1 });
    assert.deepEqual(updateFilter, { _id: "outbox-2", status: "processing" });
    assert.equal(updated.status, "pending");
    assert.equal(updated.attempts, 1);
    assert.equal(updated.nextAttemptAt.getTime(), now.getTime() + 2000);
    assert.match(updated.lastError, /temporarily unavailable/);
    assert.equal(updated.lockedAt, null);
  });
});

test("audit events report immediate persistence without creating an outbox item", async () => {
  let saved;
  let outboxCalled = false;
  await withMocks([
    [AuditLog, { create: async (event) => { saved = event; return event; } }],
    [AuditOutbox, { create: async () => { outboxCalled = true; } }]
  ], async () => {
    const result = await recordAuditEvent({ action: "admin.plan.updated", targetType: "subscription_plan", targetId: "plan-1" });
    assert.deepEqual(result, { recorded: true, queued: false });
    assert.equal(saved.action, "admin.plan.updated");
    assert.match(saved.eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(outboxCalled, false);
  });
});

test("audit event reports when both primary persistence and outbox fallback fail", async () => {
  await withMocks([
    [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox database unavailable"); } }]
  ], async () => {
    const result = await recordAuditEvent({ action: "admin.role.changed", targetType: "user", targetId: "user-2" });
    assert.deepEqual(result, { recorded: false, queued: false });
  });
});


test("audit outbox truncates fractional batch limits instead of exceeding the requested work", async () => {
  let claims = 0;
  await withMocks([
    [AuditOutbox, {
      updateMany: async () => ({}),
      findOneAndUpdate: async () => {
        claims += 1;
        return { _id: `outbox-${claims}`, eventId: `event-${claims}`, event: { eventId: `event-${claims}` }, attempts: 0 };
      },
      deleteOne: async () => ({ deletedCount: 1 })
    }],
    [AuditLog, { updateOne: async () => ({ acknowledged: true }) }]
  ], async () => {
    const result = await processPendingAuditOutbox(1.9, new Date("2026-10-18T12:00:00.000Z"));
    assert.deepEqual(result, { processed: 1, failures: 0 });
    assert.equal(claims, 1);
  });
});

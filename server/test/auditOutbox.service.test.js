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

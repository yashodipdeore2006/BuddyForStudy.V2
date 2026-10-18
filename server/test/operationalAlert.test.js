import test from "node:test";
import assert from "node:assert/strict";
import { OperationalAlert, recordOperationalAlert, resolveOperationalAlert } from "../src/models/OperationalAlert.js";

async function withFindOneAndUpdate(mock, run) {
  const original = OperationalAlert.findOneAndUpdate;
  OperationalAlert.findOneAndUpdate = mock;
  try { await run(); } finally { OperationalAlert.findOneAndUpdate = original; }
}

test("operational alerts enforce a unique key and track repeated occurrences atomically", async () => {
  const uniqueIndex = OperationalAlert.schema.indexes().find(([keys]) => keys.key === 1);
  assert.ok(uniqueIndex);
  assert.equal(uniqueIndex[1].unique, true);

  let captured;
  await withFindOneAndUpdate(async (...args) => { captured = args; return { key: "notification-job-email-delivery-failure" }; }, async () => {
    await recordOperationalAlert({
      key: "notification-job-email-delivery-failure",
      severity: "critical",
      source: "notification-worker:email-delivery",
      message: "Delivery failed".repeat(100)
    });
  });

  const [filter, update, options] = captured;
  assert.deepEqual(filter, { key: "notification-job-email-delivery-failure" });
  assert.equal(update.$set.severity, "critical");
  assert.equal(update.$set.status, "open");
  assert.equal(update.$set.message.length, 1000);
  assert.ok(update.$set.lastSeenAt instanceof Date);
  assert.ok(update.$setOnInsert.firstSeenAt instanceof Date);
  assert.deepEqual(update.$setOnInsert, { firstSeenAt: update.$setOnInsert.firstSeenAt, occurrenceCount: 0 });
  assert.deepEqual(update.$inc, { occurrenceCount: 1 });
  assert.equal(options.upsert, true);
  assert.equal(options.new, true);
});

test("resolving an operational alert is idempotent for already-resolved alerts", async () => {
  let captured;
  await withFindOneAndUpdate(async (...args) => { captured = args; return null; }, async () => {
    const result = await resolveOperationalAlert("notification-job-email-delivery-failure");
    assert.equal(result, null);
  });
  assert.deepEqual(captured[0], { key: "notification-job-email-delivery-failure", status: { $ne: "resolved" } });
  assert.equal(captured[1].$set.status, "resolved");
  assert.ok(captured[1].$set.resolvedAt instanceof Date);
  assert.deepEqual(captured[2], { new: true });
});

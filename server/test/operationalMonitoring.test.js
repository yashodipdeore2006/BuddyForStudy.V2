import test from "node:test";
import assert from "node:assert/strict";
import {
  checkPaymentWebhookBacklog,
  checkYouTubeQuotaOperationalState,
  WEBHOOK_STALE_PROCESSING_AFTER_MS
} from "../src/services/operationalMonitoring.service.js";

test("failed and stale Razorpay webhook events raise critical operational alerts", async () => {
  const recorded = [];
  const resolved = [];
  const now = new Date("2026-11-03T12:00:00.000Z");
  const result = await checkPaymentWebhookBacklog(now, {}, {
    countFailed: async () => 2,
    countStaleProcessing: async (cutoff) => {
      assert.equal(cutoff.toISOString(), "2026-11-03T11:55:00.000Z");
      return 3;
    },
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });

  assert.equal(result.failed, 2);
  assert.equal(result.staleProcessing, 3);
  assert.equal(result.staleAfterMs, WEBHOOK_STALE_PROCESSING_AFTER_MS);
  assert.deepEqual(recorded.map((item) => item.key).sort(), [
    "razorpay-webhook-failed-events",
    "razorpay-webhook-stuck-processing"
  ]);
  assert.ok(recorded.every((item) => item.severity === "critical"));
  assert.equal(resolved.length, 0);
});

test("cleared webhook backlog resolves both operational alerts", async () => {
  const recorded = [];
  const resolved = [];
  const result = await checkPaymentWebhookBacklog(new Date("2026-11-03T12:00:00.000Z"), { staleAfterMs: 60000 }, {
    countFailed: async () => 0,
    countStaleProcessing: async (cutoff) => {
      assert.equal(cutoff.toISOString(), "2026-11-03T11:59:00.000Z");
      return 0;
    },
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });

  assert.equal(result.failed, 0);
  assert.equal(result.staleProcessing, 0);
  assert.equal(recorded.length, 0);
  assert.deepEqual(resolved.sort(), [
    "razorpay-webhook-failed-events",
    "razorpay-webhook-stuck-processing"
  ]);
});

test("webhook stale-processing age is clamped to a safe one-minute to one-hour window", async () => {
  let cutoff;
  const now = new Date("2026-11-03T12:00:00.000Z");
  const result = await checkPaymentWebhookBacklog(now, { staleAfterMs: 1 }, {
    countFailed: async () => 0,
    countStaleProcessing: async (value) => { cutoff = value; return 0; },
    recordAlert: async () => {},
    resolveAlert: async () => {}
  });
  assert.equal(result.staleAfterMs, 60 * 1000);
  assert.equal(cutoff.toISOString(), "2026-11-03T11:59:00.000Z");
});

test("degraded and exhausted YouTube quota states raise warning and critical alerts", async () => {
  for (const [quota, expectedSeverity] of [
    [{ state: "degraded", units: 8000, budget: 9000, store: "mongo" }, "warning"],
    [{ state: "exhausted", units: 9000, budget: 9000, store: "redis" }, "critical"],
    [{ state: "degraded", units: 0, budget: 9000, store: "unavailable" }, "critical"]
  ]) {
    const recorded = [];
    const resolved = [];
    const result = await checkYouTubeQuotaOperationalState({
      getQuotaState: async () => quota,
      recordAlert: async (alert) => recorded.push(alert),
      resolveAlert: async (key) => resolved.push(key)
    });
    assert.deepEqual(result, quota);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].key, "youtube-daily-quota-degraded");
    assert.equal(recorded[0].severity, expectedSeverity);
    assert.equal(resolved.length, 0);
  }
});

test("healthy YouTube quota state resolves the quota alert", async () => {
  const recorded = [];
  const resolved = [];
  await checkYouTubeQuotaOperationalState({
    getQuotaState: async () => ({ state: "ok", units: 100, budget: 9000, store: "mongo" }),
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });
  assert.equal(recorded.length, 0);
  assert.deepEqual(resolved, ["youtube-daily-quota-degraded"]);
});

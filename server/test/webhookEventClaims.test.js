import test from "node:test";
import assert from "node:assert/strict";
import { getWebhookClaimDisposition, WEBHOOK_EVENT_LEASE_MS } from "../src/services/webhookEventClaims.js";

const now = new Date("2026-10-18T12:00:00.000Z");

test("a new webhook event can be claimed", () => {
  assert.equal(getWebhookClaimDisposition(null, now), "claim");
});

test("completed and legacy completed events are treated as duplicates", () => {
  assert.equal(getWebhookClaimDisposition({ status: "processed", processedAt: now }, now), "duplicate");
  assert.equal(getWebhookClaimDisposition({ processedAt: now }, now), "duplicate");
});

test("a fresh processing claim is not executed concurrently", () => {
  assert.equal(getWebhookClaimDisposition({ status: "processing", claimedAt: now }, now), "in_progress");
});

test("a stale processing claim can be recovered after the lease expires", () => {
  const stale = new Date(now.getTime() - WEBHOOK_EVENT_LEASE_MS - 1);
  assert.equal(getWebhookClaimDisposition({ status: "processing", claimedAt: stale }, now), "reclaim");
});

test("failed claims can be retried", () => {
  assert.equal(getWebhookClaimDisposition({ status: "failed" }, now), "reclaim");
});

import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionEventTimestamp, subscriptionEventFreshnessFilter } from "../src/services/subscriptionWebhookTransitions.js";

test("subscription webhook timestamp parses provider Unix seconds", () => {
  assert.equal(subscriptionEventTimestamp({ created_at: 1792324800 }).toISOString(), "2026-10-18T12:00:00.000Z");
});

test("missing or invalid provider timestamps only permit updates to legacy untracked records", () => {
  assert.equal(subscriptionEventTimestamp({}), null);
  const legacyOnlyFilter = {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null }
    ]
  };
  assert.deepEqual(subscriptionEventFreshnessFilter(null), legacyOnlyFilter);
  assert.deepEqual(subscriptionEventFreshnessFilter(new Date("invalid")), legacyOnlyFilter);
});

test("subscription update filter only accepts events newer than the last applied provider event", () => {
  const eventAt = new Date("2026-10-18T12:00:00.000Z");
  assert.deepEqual(subscriptionEventFreshnessFilter(eventAt), {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null },
      { providerEventAt: { $lte: eventAt } }
    ]
  });
});

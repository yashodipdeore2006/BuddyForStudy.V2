import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionEventTimestamp, subscriptionEventFreshnessFilter } from "../src/services/subscriptionWebhookTransitions.js";

test("subscription webhook timestamp parses provider Unix seconds", () => {
  assert.equal(subscriptionEventTimestamp({ created_at: 1792324800 }).toISOString(), "2026-10-18T12:00:00.000Z");
});

test("missing or invalid provider timestamps do not invent an ordering constraint", () => {
  assert.equal(subscriptionEventTimestamp({}), null);
  assert.deepEqual(subscriptionEventFreshnessFilter(null), {});
  assert.deepEqual(subscriptionEventFreshnessFilter(new Date("invalid")), {});
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

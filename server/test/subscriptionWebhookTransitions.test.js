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

test("subscription update filter accepts strictly newer events and exact retries only", () => {
  const eventAt = new Date("2026-10-18T12:00:00.000Z");
  assert.deepEqual(subscriptionEventFreshnessFilter(eventAt, "evt_new", "subscription.activated"), {
    $or: [
      { providerEventAt: { $exists: false } },
      { providerEventAt: null },
      { providerEventAt: { $lt: eventAt } }
    ]
  });
});

test("same-second different events are rejected but exact retries are eligible", () => {
  const firstEventAt = subscriptionEventTimestamp({ created_at: 1792324800 });
  const sameSecondEventAt = subscriptionEventTimestamp({ created_at: 1792324800 });
  assert.equal(firstEventAt.getTime(), sameSecondEventAt.getTime());
  const differentEvent = subscriptionEventFreshnessFilter(sameSecondEventAt, "evt-cancel", "subscription.cancelled");
  assert.equal(differentEvent.$or.some((clause) => clause.providerEventId === "evt-cancel"), true);
  assert.equal(differentEvent.$or.some((clause) => clause.providerEventId === "evt-activate"), false);

  const exactRetry = subscriptionEventFreshnessFilter(firstEventAt, "evt-activate", "subscription.activated");
  assert.equal(exactRetry.$or.some((clause) =>
    clause.providerEventAt?.getTime?.() === firstEventAt.getTime() &&
    clause.providerEventId === "evt-activate" &&
    clause.providerEventName === "subscription.activated"
  ), true);
});

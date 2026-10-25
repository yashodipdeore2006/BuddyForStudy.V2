import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionEventTimestamp, subscriptionEventFreshnessFilter, normalizeSubscriptionCharge } from "../src/services/subscriptionWebhookTransitions.js";
import { readFileSync } from "node:fs";

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
      { providerEventAt: { $lt: eventAt } },
      { providerEventAt: eventAt, providerEventId: "evt_new", providerEventName: "subscription.activated" }
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


test("subscription charge normalization records provider amount and currency from a captured charge", () => {
  assert.deepEqual(normalizeSubscriptionCharge(
    { id: "sub_123" },
    { id: "pay_123", subscription_id: "sub_123", amount: 19900, currency: "inr", status: "captured" }
  ), {
    valid: true,
    providerPaymentId: "pay_123",
    amount: 199,
    currency: "INR"
  });
});

test("subscription charge normalization rejects mismatched identity and invalid payment values", () => {
  const subscription = { id: "sub_123" };
  assert.equal(normalizeSubscriptionCharge(subscription, null).valid, false);
  assert.equal(normalizeSubscriptionCharge(subscription, { id: "pay_123", subscription_id: "sub_other", amount: 1000, currency: "INR", status: "captured" }).reason, "Provider payment subscription mismatch");
  assert.equal(normalizeSubscriptionCharge(subscription, { id: "pay_123", amount: 0, currency: "INR", status: "captured" }).reason, "Invalid subscription payment amount");
  assert.equal(normalizeSubscriptionCharge(subscription, { id: "pay_123", amount: 1000, currency: "", status: "captured" }).reason, "Invalid subscription payment currency");
  assert.equal(normalizeSubscriptionCharge(subscription, { id: "pay_123", amount: 1000, currency: "INR", status: "failed" }).reason, "Subscription payment is not captured");
  assert.equal(normalizeSubscriptionCharge(subscription, { amount: 1000, currency: "INR", status: "captured" }).reason, "Missing provider payment ID");
});

test("subscription charge webhook uses normalized provider amount and currency for persisted payment records", () => {
  const webhook = readFileSync(new URL("../src/controllers/webhook.controller.js", import.meta.url), "utf8");
  const start = webhook.indexOf("async function recordSubscriptionCharge");
  const end = webhook.indexOf("export async function razorpayWebhook", start);
  assert.ok(start >= 0 && end > start, "Expected subscription charge handler");
  const handler = webhook.slice(start, end);
  assert.match(handler, /normalizeSubscriptionCharge\(subscription, paymentEntity\)/);
  assert.match(handler, /duplicate\.amount = amount/);
  assert.match(handler, /duplicate\.currency = currency/);
  assert.match(handler, /payment\.amount = amount/);
  assert.match(handler, /payment\.currency = currency/);
  assert.match(handler, /amount,[\s\S]*?currency,[\s\S]*?providerPaymentId/);
});

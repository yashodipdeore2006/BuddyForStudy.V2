import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendBillingNotificationSafely } from "../src/services/billingNotification.service.js";
import { cancelSubscription } from "../src/services/razorpay.service.js";

test("billing notification failures are swallowed after a durable transition", async () => {
  const context = "subscription-cancellation";
  const payload = { eventKey: "subscription-cancel-scheduled:test" };
  const originalError = console.error;
  let logged;
  console.error = (...args) => { logged = args; };

  try {
    const result = await sendBillingNotificationSafely(
      payload,
      context,
      async (receivedPayload) => {
        assert.equal(receivedPayload, payload);
        throw new Error("notification transport unavailable");
      }
    );

    assert.equal(result, null);
    assert.equal(logged?.[0], "[notifications] billing event notice failed");
    assert.deepEqual(logged?.[1], {
      context,
      message: "notification transport unavailable"
    });
  } finally {
    console.error = originalError;
  }

  const source = readFileSync(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");
  const start = source.indexOf('router.post("/subscription/cancel"');
  const end = source.indexOf('router.get("/refunds"', start);
  assert.ok(start >= 0 && end > start, "Expected subscription cancellation route");
  const route = source.slice(start, end);

  assert.match(source, /sendNotificationSafely\(payload, context\)[\s\S]*?sendBillingNotificationSafely\(payload, context, createNotificationEvent\)/);
  assert.match(route, /razorpay\.cancelSubscription\(subscription\.providerSubscriptionId,\s*true\)/);
  assert.match(route, /await subscription\.save\(\)/);
  assert.match(route, /await sendNotificationSafely\([\s\S]*?"subscription-cancellation"\)/);
  assert.doesNotMatch(route, /await createNotificationEvent\(/);
  const persistenceIndex = route.indexOf("await subscription.save()");
  const notificationIndex = route.indexOf("await sendNotificationSafely(");
  assert.ok(persistenceIndex >= 0 && notificationIndex > persistenceIndex,
    "Subscription persistence must complete before optional notification dispatch");
});

test("successful billing notification dispatch returns the queued event", async () => {
  const payload = { eventKey: "subscription-cancel-scheduled:test" };
  const event = { id: "notification-event-test" };
  const result = await sendBillingNotificationSafely(payload, "subscription-cancellation", async (receivedPayload) => {
    assert.equal(receivedPayload, payload);
    return event;
  });
  assert.equal(result, event);
});


test("provider cancellation remains available after new checkout is disabled", async () => {
  const calls = [];
  const RazorpayClient = class {
    constructor(credentials) {
      calls.push({ type: "client", credentials });
      this.subscriptions = {
        cancel: async (subscriptionId, cancelAtCycleEnd) => {
          calls.push({ type: "cancel", subscriptionId, cancelAtCycleEnd });
          return { id: subscriptionId, status: "cancelled", end_at: 1792324800 };
        }
      };
    }
  };
  const result = await cancelSubscription("sub_existing", true, {
    config: {
      paymentsEnabled: false,
      razorpayKeyId: "rzp_test_key",
      razorpayKeySecret: "test_key_secret"
    },
    RazorpayClient
  });

  assert.equal(result.status, "cancelled");
  assert.deepEqual(calls[1], {
    type: "cancel",
    subscriptionId: "sub_existing",
    cancelAtCycleEnd: true
  });

  const source = readFileSync(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");
  const start = source.indexOf('router.post("/subscription/cancel"');
  const end = source.indexOf('router.get("/refunds"', start);
  assert.ok(start >= 0 && end > start, "Expected existing subscription cancellation route");
  const route = source.slice(start, end);
  assert.match(route, /razorpay\.cancelSubscription\(subscription\.providerSubscriptionId,\s*true\)/);
  assert.match(route, /await subscription\.save\(\)/);
  assert.doesNotMatch(route, /paymentsEnabled|requirePaymentsEnabled/,
    "New-checkout availability must not gate an existing subscription cancellation");
});

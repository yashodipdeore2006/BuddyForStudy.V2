import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendBillingNotificationSafely } from "../src/services/billingNotification.service.js";

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
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("subscription cancellation remains successful when its notification transport fails", () => {
  const source = readFileSync(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");
  const start = source.indexOf('router.post("/subscription/cancel"');
  const end = source.indexOf('router.get("/refunds"', start);
  assert.ok(start >= 0 && end > start, "Expected subscription cancellation route");
  const route = source.slice(start, end);

  assert.match(source, /async function sendNotificationSafely\([\s\S]*?catch \(error\)[\s\S]*?return null;/);
  assert.match(route, /await razorpay\.cancelSubscription\(subscription\.providerSubscriptionId, true\)/);
  assert.match(route, /await subscription\.save\(\)/);
  assert.match(route, /await sendNotificationSafely\([\s\S]*?"subscription-cancellation"\)/);
  assert.doesNotMatch(route, /await createNotificationEvent\(/);
});

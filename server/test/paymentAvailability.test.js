import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentAvailabilityMiddleware } from "../src/middleware/paymentAvailability.js";

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("payment routes are blocked with a clear 503 response when payments are disabled", () => {
  const middleware = createPaymentAvailabilityMiddleware({ enabled: false });
  const res = makeResponse();
  let nextCalled = false;

  middleware({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    success: false,
    message: "Payments are temporarily unavailable. Please try again later."
  });
});

test("payment routes continue when payments are explicitly enabled", () => {
  const middleware = createPaymentAvailabilityMiddleware({ enabled: true });
  const res = makeResponse();
  let nextCalled = false;

  middleware({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

import { readFile } from "node:fs/promises";

test("only new payment-order routes are guarded by the payments availability switch", async () => {
  const routes = await readFile(new URL("../src/routes/payment.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/course\/order", requirePaymentsEnabled, controller\.createCourseOrder\)/);
  assert.match(routes, /router\.post\("\/subscription\/order", requirePaymentsEnabled, controller\.createSubscriptionOrder\)/);
  assert.match(routes, /router\.post\("\/course\/verify", controller\.verifyCoursePayment\)/);
});

test("signed provider webhooks and payment reconciliation routes remain mounted when checkout is disabled", async () => {
  const server = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /app\.use\("\/api\/payments", paymentLimiter, paymentRoutes\)/);
  assert.match(server, /app\.use\("\/api\/webhooks", webhookLimiter, webhookRoutes\)/);
  assert.doesNotMatch(server, /app\.use\("\/api\/webhooks",[^\n]*requirePaymentsEnabled/);
  assert.doesNotMatch(server, /app\.use\("\/api\/payments",[^\n]*requirePaymentsEnabled/);
});

test("provider client availability is independent from the new-checkout switch", async () => {
  const source = await readFile(new URL("../src/services/razorpay.service.js", import.meta.url), "utf8");
  const clientStart = source.indexOf("function getClient(");
  const clientEnd = source.indexOf("\n}\n", clientStart);
  const clientFactory = source.slice(clientStart, clientEnd);
  assert.ok(clientStart >= 0 && clientEnd > clientStart);
  assert.doesNotMatch(clientFactory, /paymentsEnabled/);
  assert.match(source, /export async function createOrder[\s\S]*?assertPaymentsEnabled\(dependencies\.config \|\| env\)/);
  assert.match(source, /export async function createSubscription[\s\S]*?assertPaymentsEnabled\(dependencies\.config \|\| env\)/);
  assert.match(source, /export async function fetchSubscription\(subscriptionId, dependencies = \{\}\)[\s\S]*?getClient\(dependencies\)/);
  assert.match(source, /export async function cancelSubscription\(subscriptionId, cancelAtCycleEnd = true, dependencies = \{\}\)[\s\S]*?getClient\(dependencies\)/);
});


test("only new order creation is feature-gated; existing verification, subscription sync, cancellation, and webhooks stay reachable", async () => {
  const paymentRoutes = await readFile(new URL("../src/routes/payment.routes.js", import.meta.url), "utf8");
  const billingRoutes = await readFile(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");
  const webhookRoutes = await readFile(new URL("../src/routes/webhook.routes.js", import.meta.url), "utf8");

  assert.match(paymentRoutes, /router\.post\("\/course\/order", requirePaymentsEnabled, controller\.createCourseOrder\)/);
  assert.match(paymentRoutes, /router\.post\("\/subscription\/order", requirePaymentsEnabled, controller\.createSubscriptionOrder\)/);
  assert.match(paymentRoutes, /router\.post\("\/course\/verify", controller\.verifyCoursePayment\)/);
  assert.doesNotMatch(paymentRoutes, /router\.post\("\/course\/verify", requirePaymentsEnabled/);

  assert.match(billingRoutes, /router\.post\("\/subscription\/sync", async/);
  assert.match(billingRoutes, /router\.post\("\/subscription\/cancel", async/);
  assert.doesNotMatch(billingRoutes, /requirePaymentsEnabled|createPaymentAvailabilityMiddleware/);

  assert.match(webhookRoutes, /router\.post\("\/razorpay", controller\.razorpayWebhook\)/);
  assert.doesNotMatch(webhookRoutes, /requirePaymentsEnabled|createPaymentAvailabilityMiddleware/);
});

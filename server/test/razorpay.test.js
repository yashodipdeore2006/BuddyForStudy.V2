import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "../src/services/razorpay.service.js";

test("accepts a valid Razorpay payment signature", () => {
  const orderId = "order_test";
  const paymentId = "pay_test";
  const secret = "test_secret";
  const signature = crypto.createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature, secret }), true);
});

test("rejects a tampered Razorpay payment signature", () => {
  const signature = crypto.createHmac("sha256", "test_secret").update("order_test|pay_test").digest("hex");
  assert.equal(verifyPaymentSignature({ orderId: "order_test", paymentId: "pay_other", signature, secret: "test_secret" }), false);
});

test("accepts a valid Razorpay webhook signature over the exact raw request body", () => {
  const rawBody = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123"}}}}');
  const secret = "webhook_test_secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(rawBody, signature, secret), true);
});

test("rejects tampered webhook bodies and missing webhook signature inputs", () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const secret = "webhook_test_secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(rawBody, "", secret), false);
  assert.equal(verifyWebhookSignature(Buffer.alloc(0), signature, secret), false);
});


function createRazorpayClientHarness(calls) {
  return class FakeRazorpayClient {
    constructor(credentials) {
      calls.credentials = credentials;
      calls.clientCreations = (calls.clientCreations || 0) + 1;
      this.orders = {
        create: async (input) => { calls.orderInput = input; return { id: "order_created" }; }
      };
      this.plans = {
        create: async (input) => { calls.planInput = input; return { id: "plan_created" }; }
      };
      this.subscriptions = {
        create: async (input) => { calls.subscriptionCreateInput = input; return { id: "subscription_created" }; },
        fetch: async (id) => { calls.subscriptionFetchId = id; return { id, status: "active" }; },
        cancel: async (id, atCycleEnd) => {
          calls.subscriptionCancel = { id, atCycleEnd };
          return { id, status: "cancelled", end_at: 1792324800 };
        }
      };
      this.payments = {
        fetch: async (id) => { calls.paymentFetchId = id; return { id, status: "captured" }; },
        refund: async (id, input) => { calls.refundInput = { id, ...input }; return { id: "refund_created" }; }
      };
      this.refunds = {
        fetch: async (id, options) => { calls.refundFetch = { id, ...options }; return { id, status: "processed" }; }
      };
    }
  };
}

const providerCredentials = {
  razorpayKeyId: "rzp_test_key",
  razorpayKeySecret: "test_key_secret"
};

test("new Razorpay order and subscription creation fail closed before provider initialization when payments are disabled", async () => {
  const calls = {};
  const RazorpayClient = createRazorpayClientHarness(calls);
  const config = { ...providerCredentials, paymentsEnabled: false };

  await assert.rejects(
    createOrder({ amount: 499, currency: "INR", receipt: "receipt_disabled" }, { config, RazorpayClient }),
    (error) => error?.status === 503 && /temporarily unavailable/i.test(error.message)
  );
  await assert.rejects(
    createSubscriptionPlan({ name: "Pro", amount: 199, currency: "INR", interval: 1, period: "monthly" }, { config, RazorpayClient }),
    (error) => error?.status === 503 && /temporarily unavailable/i.test(error.message)
  );
  await assert.rejects(
    createSubscription({ planId: "plan_existing", totalCount: 12 }, { config, RazorpayClient }),
    (error) => error?.status === 503 && /temporarily unavailable/i.test(error.message)
  );

  assert.equal(calls.clientCreations || 0, 0, "disabled checkout must not initialize the provider client");
});

test("enabled Razorpay checkout operations use the configured credentials and server-computed provider amounts", async () => {
  const calls = {};
  const RazorpayClient = createRazorpayClientHarness(calls);
  const config = { ...providerCredentials, paymentsEnabled: true };

  const order = await createOrder(
    { amount: 499, currency: "INR", receipt: "receipt_enabled", notes: { userId: "learner-1" } },
    { config, RazorpayClient }
  );
  const plan = await createSubscriptionPlan(
    { name: "Pro Monthly", amount: 199, currency: "INR", interval: 1, period: "monthly" },
    { config, RazorpayClient }
  );
  const subscription = await createSubscription(
    { planId: plan.id, customerNotify: 1, totalCount: 12 },
    { config, RazorpayClient }
  );

  assert.equal(order.id, "order_created");
  assert.equal(plan.id, "plan_created");
  assert.equal(subscription.id, "subscription_created");
  assert.deepEqual(calls.credentials, { key_id: providerCredentials.razorpayKeyId, key_secret: providerCredentials.razorpayKeySecret });
  assert.deepEqual(calls.orderInput, {
    amount: 49900,
    currency: "INR",
    receipt: "receipt_enabled",
    notes: { userId: "learner-1" }
  });
  assert.deepEqual(calls.planInput, {
    period: "monthly",
    interval: 1,
    item: { name: "Pro Monthly", amount: 19900, currency: "INR", description: "Pro Monthly" }
  });
  assert.deepEqual(calls.subscriptionCreateInput, {
    plan_id: "plan_created",
    customer_notify: 1,
    quantity: 1,
    total_count: 12
  });
  assert.equal(calls.clientCreations, 3);
});

test("existing payment, refund, subscription reconciliation and cancellation operations remain available when new checkout is disabled", async () => {
  const calls = {};
  const RazorpayClient = createRazorpayClientHarness(calls);
  const config = { ...providerCredentials, paymentsEnabled: false };

  const subscription = await fetchSubscription("sub_existing", { config, RazorpayClient });
  const payment = await fetchPayment("pay_existing", { config, RazorpayClient });
  const refund = await fetchRefund({ refundId: "rf_existing", paymentId: "pay_existing" }, { config, RazorpayClient });
  const refundCreated = await refundPayment(
    { paymentId: "pay_existing", amount: 25.5, currency: "INR", notes: { reason: "approved" } },
    { config, RazorpayClient }
  );
  const cancelled = await cancelSubscription("sub_existing", true, { config, RazorpayClient });

  assert.equal(subscription.status, "active");
  assert.equal(payment.status, "captured");
  assert.equal(refund.status, "processed");
  assert.equal(refundCreated.id, "refund_created");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(calls.clientCreations, 5);
  assert.deepEqual(calls.subscriptionCancel, { id: "sub_existing", atCycleEnd: true });
  assert.deepEqual(calls.refundFetch, { id: "rf_existing", payment_id: "pay_existing" });
  assert.deepEqual(calls.refundInput, {
    id: "pay_existing",
    amount: 2550,
    notes: { reason: "approved" }
  });
});

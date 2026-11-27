import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/subscription-webhook-availability-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const [{ Payment }, { UserSubscription }, { WebhookEvent }, { env }, { razorpayWebhook }] = await Promise.all([
  import("../src/models/Payment.js"),
  import("../src/models/UserSubscription.js"),
  import("../src/models/WebhookEvent.js"),
  import("../src/config/env.js"),
  import("../src/controllers/webhook.controller.js")
]);

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function subscriptionChargedEvent() {
  return {
    event: "subscription.charged",
    created_at: 1792324800,
    payload: {
      subscription: {
        entity: {
          id: "sub_existing",
          status: "active",
          current_start: 1792324800,
          current_end: 1795003200
        }
      },
      payment: {
        entity: {
          id: "pay_subscription_existing",
          subscription_id: "sub_existing",
          status: "captured",
          amount: 19900,
          currency: "INR"
        }
      }
    }
  };
}

function signedRequest(event, secret, eventId = "evt_subscription_charge_disabled") {
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return {
    rawBody,
    body: event,
    get(name) {
      if (name === "x-razorpay-signature") return signature;
      if (name === "x-razorpay-event-id") return eventId;
      return undefined;
    }
  };
}

test("a valid subscription charge reconciles an existing payment while new payments are disabled", async () => {
  const previousEnabled = env.paymentsEnabled;
  const previousSecret = env.razorpayWebhookSecret;
  const secret = "subscription-webhook-secret-used-only-by-this-test";
  const event = subscriptionChargedEvent();
  const paymentRecord = {
    _id: "payment-existing-subscription",
    user: "learner-existing",
    plan: "plan-pro",
    provider: "razorpay",
    providerOrderId: "sub_existing",
    amount: 199,
    currency: "INR",
    status: "pending",
    metadata: { checkoutType: "subscription" },
    save: async () => { calls.paymentSaved += 1; }
  };
  const calls = {
    paymentLookups: [],
    paymentSaved: 0,
    webhookClaim: null,
    webhookFinalization: null,
    subscriptionTransition: null
  };
  env.paymentsEnabled = false;
  env.razorpayWebhookSecret = secret;

  try {
    await withMocks([
      [Payment, {
        findOne(filter) {
          calls.paymentLookups.push(filter);
          if (filter.providerPaymentId) return Promise.resolve(null);
          return { sort: async () => paymentRecord };
        }
      }],
      [UserSubscription, {
        findOneAndUpdate: async (filter, update, options) => {
          calls.subscriptionTransition = { filter, update, options };
          return { _id: "subscription-local", user: "learner-existing", ...update.$set };
        }
      }],
      [WebhookEvent, {
        create: async (claim) => {
          calls.webhookClaim = claim;
          return claim;
        },
        updateOne: async (filter, update) => {
          calls.webhookFinalization = { filter, update };
          return { modifiedCount: 1 };
        }
      }]
    ], async () => {
      const res = makeResponse();
      let forwardedError;
      await razorpayWebhook(signedRequest(event, secret), res, (error) => { forwardedError = error; });

      assert.equal(forwardedError, undefined);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, message: "Operation successful", received: true });
    });

    assert.equal(env.paymentsEnabled, false);
    assert.equal(calls.paymentLookups.length, 2);
    assert.deepEqual(calls.paymentLookups[0], {
      provider: "razorpay",
      providerPaymentId: "pay_subscription_existing"
    });
    assert.deepEqual(calls.paymentLookups[1], {
      provider: "razorpay",
      providerOrderId: "sub_existing",
      status: "pending"
    });

    assert.equal(paymentRecord.providerPaymentId, "pay_subscription_existing");
    assert.equal(paymentRecord.amount, 199);
    assert.equal(paymentRecord.currency, "INR");
    assert.equal(paymentRecord.status, "paid");
    assert.ok(paymentRecord.paidAt instanceof Date);
    assert.equal(calls.paymentSaved, 1);

    assert.equal(calls.subscriptionTransition.filter.user, "learner-existing");
    assert.equal(calls.subscriptionTransition.update.$set.status, "active");
    assert.equal(calls.subscriptionTransition.update.$set.provider, "razorpay");
    assert.equal(calls.subscriptionTransition.update.$set.providerSubscriptionId, "sub_existing");
    assert.equal(calls.subscriptionTransition.update.$set.providerEventName, "subscription.charged");
    assert.equal(calls.subscriptionTransition.options.new, true);

    assert.equal(calls.webhookClaim.event, "subscription.charged");
    assert.equal(calls.webhookClaim.status, "processing");
    assert.equal(calls.webhookFinalization.filter.eventId, "evt_subscription_charge_disabled");
    assert.equal(calls.webhookFinalization.filter.status, "processing");
    assert.equal(calls.webhookFinalization.update.$set.status, "processed");
  } finally {
    env.paymentsEnabled = previousEnabled;
    env.razorpayWebhookSecret = previousSecret;
  }
});

test("a previously processed subscription charge webhook is acknowledged without replaying billing mutations", async () => {
  const previousEnabled = env.paymentsEnabled;
  const previousSecret = env.razorpayWebhookSecret;
  const secret = "subscription-webhook-secret-used-only-by-this-test";
  const event = subscriptionChargedEvent();
  const calls = { paymentLookups: 0, claims: 0, transitions: 0, finalizations: 0 };
  env.paymentsEnabled = false;
  env.razorpayWebhookSecret = secret;

  try {
    await withMocks([
      [Payment, {
        findOne: async () => { calls.paymentLookups += 1; return null; }
      }],
      [UserSubscription, {
        findOneAndUpdate: async () => { calls.transitions += 1; return null; }
      }],
      [WebhookEvent, {
        create: async () => {
          calls.claims += 1;
          const error = new Error("duplicate webhook event");
          error.code = 11000;
          throw error;
        },
        findOne: async () => ({
          eventId: "evt_subscription_charge_duplicate",
          event: "subscription.charged",
          status: "processed",
          processedAt: new Date()
        }),
        updateOne: async () => { calls.finalizations += 1; return { modifiedCount: 1 }; }
      }]
    ], async () => {
      const res = makeResponse();
      await razorpayWebhook(signedRequest(event, secret, "evt_subscription_charge_duplicate"), res, assert.fail);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, message: "Operation successful", received: true, duplicate: true });
    });

    assert.equal(calls.claims, 1);
    assert.equal(calls.paymentLookups, 0);
    assert.equal(calls.transitions, 0);
    assert.equal(calls.finalizations, 0);
  } finally {
    env.paymentsEnabled = previousEnabled;
    env.razorpayWebhookSecret = previousSecret;
  }
});

test("an invalid subscription webhook signature is rejected before claiming or mutating billing state", async () => {
  const previousEnabled = env.paymentsEnabled;
  const previousSecret = env.razorpayWebhookSecret;
  const secret = "subscription-webhook-secret-used-only-by-this-test";
  const event = subscriptionChargedEvent();
  const calls = { claims: 0, paymentLookups: 0, transitions: 0 };
  env.paymentsEnabled = false;
  env.razorpayWebhookSecret = secret;
  const request = signedRequest(event, secret, "evt_subscription_charge_invalid");
  request.get = (name) => name === "x-razorpay-signature" ? "invalid-signature" : "evt_subscription_charge_invalid";

  try {
    await withMocks([
      [Payment, {
        findOne: async () => { calls.paymentLookups += 1; return null; }
      }],
      [UserSubscription, {
        findOneAndUpdate: async () => { calls.transitions += 1; return null; }
      }],
      [WebhookEvent, {
        create: async () => { calls.claims += 1; return {}; }
      }]
    ], async () => {
      const res = makeResponse();
      await razorpayWebhook(request, res, assert.fail);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, {
        success: false,
        message: "Invalid webhook signature"
      });
    });

    assert.equal(calls.claims, 0);
    assert.equal(calls.paymentLookups, 0);
    assert.equal(calls.transitions, 0);
  } finally {
    env.paymentsEnabled = previousEnabled;
    env.razorpayWebhookSecret = previousSecret;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/payment-webhook-availability-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const [{ Payment }, { WebhookEvent }, { env }, { razorpayWebhook }] = await Promise.all([
  import("../src/models/Payment.js"),
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

function signedRequest(event, secret, eventId = "evt_payment_capture_disabled") {
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

test("a valid captured-payment webhook reconciles an existing order while new payments are disabled", async () => {
  const previousEnabled = env.paymentsEnabled;
  const previousSecret = env.razorpayWebhookSecret;
  const secret = "webhook-secret-used-only-by-this-test";
  const paymentRecord = {
    _id: "payment-existing",
    amount: 499,
    currency: "INR",
    status: "pending",
    providerOrderId: "order_existing"
  };
  const event = {
    event: "payment.captured",
    created_at: 1792324800,
    payload: {
      payment: {
        entity: {
          id: "pay_existing",
          order_id: "order_existing",
          status: "captured",
          amount: 49900,
          currency: "INR"
        }
      }
    }
  };
  const calls = { paymentLookup: 0, paymentTransition: null, webhookClaim: null, webhookFinalization: null };
  env.paymentsEnabled = false;
  env.razorpayWebhookSecret = secret;

  try {
    await withMocks([
      [Payment, {
        findOne(filter) {
          calls.paymentLookup += 1;
          assert.equal(filter.provider, "razorpay");
          assert.equal(filter.providerOrderId, "order_existing");
          assert.deepEqual(filter.status.$in, ["created", "pending", "failed"]);
          return { sort: async () => paymentRecord };
        },
        findOneAndUpdate: async (filter, update, options) => {
          calls.paymentTransition = { filter, update, options };
          return { ...paymentRecord, ...update.$set };
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
      assert.equal(res.body.success, true);
      assert.equal(res.body.received, true);
    });

    assert.equal(calls.paymentLookup, 1);
    assert.equal(calls.webhookClaim.eventId, "evt_payment_capture_disabled");
    assert.equal(calls.paymentTransition.update.$set.status, "paid");
    assert.equal(calls.paymentTransition.update.$set.providerPaymentId, "pay_existing");
    assert.deepEqual(calls.paymentTransition.filter.status.$in, ["created", "pending", "failed"]);
    assert.equal(calls.webhookFinalization.filter.eventId, "evt_payment_capture_disabled");
    assert.equal(calls.webhookFinalization.update.$set.status, "processed");
  } finally {
    env.paymentsEnabled = previousEnabled;
    env.razorpayWebhookSecret = previousSecret;
  }
});

test("an invalid webhook signature is rejected before claiming or mutating an event when payments are disabled", async () => {
  const previousEnabled = env.paymentsEnabled;
  const previousSecret = env.razorpayWebhookSecret;
  const secret = "webhook-secret-used-only-by-this-test";
  const calls = { claims: 0, paymentWrites: 0 };
  env.paymentsEnabled = false;
  env.razorpayWebhookSecret = secret;

  const event = {
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_tampered", order_id: "order_tampered", status: "captured", amount: 49900, currency: "INR" } } }
  };
  const request = signedRequest(event, secret);
  request.get = (name) => name === "x-razorpay-signature" ? "invalid-signature" : "evt_invalid_signature";

  try {
    await withMocks([
      [WebhookEvent, { create: async () => { calls.claims += 1; return {}; } }],
      [Payment, { findOneAndUpdate: async () => { calls.paymentWrites += 1; } }]
    ], async () => {
      const res = makeResponse();
      await razorpayWebhook(request, res, assert.fail);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, "Invalid webhook signature");
    });

    assert.equal(calls.claims, 0);
    assert.equal(calls.paymentWrites, 0);
  } finally {
    env.paymentsEnabled = previousEnabled;
    env.razorpayWebhookSecret = previousSecret;
  }
});

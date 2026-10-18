import test from "node:test";
import assert from "node:assert/strict";
import { Payment } from "../src/models/Payment.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { createSubscriptionOrder } from "../src/controllers/payment.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
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

test("subscription order creation reuses an existing pending provider checkout", async () => {
  await withMocks([
    [UserSubscription, {
      findOne: async () => null,
    }],
    [Payment, {
      findOne: () => ({
        select() {
          return {
            populate() {
              return {
                lean: async () => ({
              _id: "507f1f77bcf86cd799439011",
              providerOrderId: "sub_pending_123",
              plan: {
                _id: "507f1f77bcf86cd799439012",
                name: "Pro",
                price: 199,
                currency: "INR",
                billingInterval: "monthly",
              },
                }),
              };
            },
          };
        },
      }),
    }],
  ], async () => {
    const res = makeResponse();
    await createSubscriptionOrder({
      body: { planId: "507f1f77bcf86cd799439012" },
      user: { userId: "507f1f77bcf86cd799439013" },
    }, res, (error) => assert.fail(error));

    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.match(res.result.body.message, /checkout reused/i);
    assert.equal(res.result.body.subscriptionId, "sub_pending_123");
    assert.equal(res.result.body.plan.name, "Pro");
    assert.equal(res.result.body.plan.price, 199);
  });
});

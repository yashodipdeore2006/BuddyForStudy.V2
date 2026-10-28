import test from "node:test";
import assert from "node:assert/strict";
import { Payment } from "../src/models/Payment.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { SubscriptionPlan } from "../src/models/SubscriptionPlan.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { createSubscriptionOrder } from "../src/controllers/payment.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

const checkoutLockMocks = [PlatformSetting, {
  findOneAndUpdate: async (_filter, update) => ({ value: update.$set.value }),
  updateOne: async () => ({ modifiedCount: 1 })
}];

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


test("subscription checkout sends the selected plan price, currency, interval and period to Razorpay", async () => {
  const cases = [
    {
      planId: "507f1f77bcf86cd799439012",
      name: "USD Monthly",
      price: 9.99,
      currency: "USD",
      billingInterval: "monthly",
      providerPlanId: "plan_usd_monthly",
      expectedPeriod: "monthly",
      expectedInterval: 1,
      expectedCount: 120
    },
    {
      planId: "507f1f77bcf86cd799439014",
      name: "JPY Yearly",
      price: 125,
      currency: "JPY",
      billingInterval: "yearly",
      providerPlanId: "plan_jpy_yearly",
      expectedPeriod: "yearly",
      expectedInterval: 1,
      expectedCount: 10
    }
  ];

  for (const item of cases) {
    const plan = {
      _id: item.planId,
      name: item.name,
      price: item.price,
      currency: item.currency,
      billingInterval: item.billingInterval,
      isActive: true,
      providerPlanId: "",
      save: async function () {}
    };
    const captured = { providerPlan: null, providerSubscription: null, payment: null };
    await withMocks([
      checkoutLockMocks,
      [SubscriptionPlan, {
        findOne: async (filter) => {
          assert.deepEqual(filter, { _id: item.planId, isActive: true });
          return plan;
        }
      }],
      [UserSubscription, { findOne: async () => null }],
      [Payment, {
        find: () => {
          const query = {
            sort() { return query; },
            select() { return query; },
            populate() { return { lean: async () => [] }; }
          };
          return query;
        },
        create: async (document) => {
          captured.payment = { ...document };
          return document;
        }
      }]
    ], async () => {
      const res = makeResponse();
      await createSubscriptionOrder({
        body: { planId: item.planId },
        user: { userId: "507f1f77bcf86cd799439099" }
      }, res, (error) => assert.fail(error), {
        createSubscriptionPlan: async (input) => {
          captured.providerPlan = input;
          return { id: item.providerPlanId };
        },
        createSubscription: async (input) => {
          captured.providerSubscription = input;
          return { id: "sub_" + item.currency.toLowerCase() };
        },
        getPublicKey: () => "rzp_test_public_key"
      });

      assert.equal(res.result.statusCode, 201);
      assert.equal(res.result.body.plan.name, item.name);
      assert.equal(res.result.body.plan.price, item.price);
      assert.equal(res.result.body.plan.currency, item.currency);
      assert.equal(res.result.body.plan.billingInterval, item.billingInterval);
      assert.deepEqual(captured.providerPlan, {
        name: item.name,
        amount: item.price,
        currency: item.currency,
        period: item.expectedPeriod,
        interval: item.expectedInterval
      });
      assert.deepEqual(captured.providerSubscription, {
        planId: item.providerPlanId,
        customerNotify: 1,
        totalCount: item.expectedCount
      });
      assert.equal(captured.payment.amount, item.price);
      assert.equal(captured.payment.currency, item.currency);
      assert.equal(captured.payment.metadata.checkoutType, "subscription");
    });
  }
});

test("concurrent subscription checkout is rejected before subscription eligibility or payment writes", async () => {
  const planId = "507f1f77bcf86cd799439012";
  const userId = "507f1f77bcf86cd799439099";
  let eligibilityReads = 0;
  let pendingPaymentReads = 0;
  let providerPlanCalls = 0;
  let providerSubscriptionCalls = 0;
  let paymentWrites = 0;
  let releaseCalls = 0;
  const plan = {
    _id: planId,
    name: "Pro",
    price: 199,
    currency: "INR",
    billingInterval: "monthly",
    isActive: true,
    providerPlanId: ""
  };
  const res = makeResponse();
  await createSubscriptionOrder({
    body: { planId },
    user: { userId }
  }, res, (error) => { throw error; }, {
    SubscriptionPlan: {
      findOne: async (filter) => {
        assert.deepEqual(filter, { _id: planId, isActive: true });
        return plan;
      }
    },
    UserSubscription: {
      findOne: async () => { eligibilityReads += 1; return null; }
    },
    Payment: {
      find: () => {
        pendingPaymentReads += 1;
        throw new Error("A contending request must not inspect pending payments");
      },
      create: async () => { paymentWrites += 1; }
    },
    TrialGrant: { findOne: async () => null },
    acquireCheckoutLock: async (key) => {
      assert.match(key, /subscription/);
      return null;
    },
    releaseCheckoutLock: async () => { releaseCalls += 1; },
    createSubscriptionPlan: async () => { providerPlanCalls += 1; return { id: "unexpected" }; },
    createSubscription: async () => { providerSubscriptionCalls += 1; return { id: "unexpected" }; },
    getPublicKey: () => "rzp_test_public_key"
  });

  assert.equal(res.result.statusCode, 409);
  assert.match(res.result.body.message, /already being prepared/i);
  assert.equal(eligibilityReads, 0);
  assert.equal(pendingPaymentReads, 0);
  assert.equal(providerPlanCalls, 0);
  assert.equal(providerSubscriptionCalls, 0);
  assert.equal(paymentWrites, 0);
  assert.equal(releaseCalls, 0);
});

test("subscription order creation reuses an existing pending provider checkout", async () => {
  await withMocks([
    checkoutLockMocks,
    [SubscriptionPlan, {
      findOne: async () => ({
        _id: "507f1f77bcf86cd799439012",
        name: "Pro",
        price: 199,
        currency: "INR",
        billingInterval: "monthly",
        providerPlanId: "plan_razorpay",
      }),
    }],
    [UserSubscription, {
      findOne: async () => null,
    }],
    [Payment, {
      find: () => {
        const query = {
          sort() { return query; },
          select() { return query; },
          populate() {
            return {
              lean: async () => [{
                _id: "507f1f77bcf86cd799439011",
                providerOrderId: "sub_pending_123",
                metadata: { checkoutType: "subscription" },
                plan: {
                  _id: "507f1f77bcf86cd799439012",
                  name: "Pro",
                  price: 199,
                  currency: "INR",
                  billingInterval: "monthly",
                },
              }],
            };
          },
        };
        return query;
      },
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


test("subscription order creation refuses to reuse a pending checkout for a different plan", async () => {
  await withMocks([
    checkoutLockMocks,
    [SubscriptionPlan, {
      findOne: async () => ({
        _id: "507f1f77bcf86cd799439012",
        name: "Premium",
        price: 499,
        currency: "INR",
        billingInterval: "monthly",
        providerPlanId: "plan_premium",
      }),
    }],
    [UserSubscription, {
      findOne: async () => null,
    }],
    [Payment, {
      find: () => {
        const query = {
          sort() { return query; },
          select() { return query; },
          populate() {
            return {
              lean: async () => [{
                _id: "507f1f77bcf86cd799439011",
                providerOrderId: "sub_pending_pro",
                metadata: { checkoutType: "subscription" },
                plan: {
                  _id: "507f1f77bcf86cd799439014",
                  name: "Pro",
                  price: 199,
                  currency: "INR",
                  billingInterval: "monthly",
                },
              }],
            };
          },
        };
        return query;
      },
    }],
  ], async () => {
    const res = makeResponse();
    await createSubscriptionOrder({
      body: { planId: "507f1f77bcf86cd799439012" },
      user: { userId: "507f1f77bcf86cd799439013" },
    }, res, (error) => assert.fail(error));

    assert.equal(res.result.statusCode, 409);
    assert.equal(res.result.body.success, false);
    assert.match(res.result.body.message, /different plan or trial conversion/i);
    assert.equal(res.result.body.errors?.pendingPlanId, "507f1f77bcf86cd799439014");
  });
});
import test from "node:test";
import assert from "node:assert/strict";
import { listPublicPlans } from "../src/routes/billing.routes.js";

function makeResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

test("public plan catalogue includes every active plan when payments are disabled", async () => {
  const activePlans = [
    { _id: "free-plan", slug: "free", name: "Free", price: 0, isActive: true, sortOrder: 0, features: ["basic"] },
    { _id: "starter-plan", slug: "starter", name: "Starter", price: 299, isActive: true, sortOrder: 1, features: ["starter"] },
    { _id: "pro-plan", slug: "pro", name: "Pro", price: 999, isActive: true, sortOrder: 2, features: ["pro"] }
  ];
  let query;
  let sort;

  const SubscriptionPlan = {
    find(filter) {
      query = filter;
      return {
        sort(value) {
          sort = value;
          return { lean: async () => activePlans };
        }
      };
    }
  };
  const normalized = (features) => features.map((value) => "normalized:" + value);
  const res = makeResponse();

  await listPublicPlans({}, res, assert.fail, {
    SubscriptionPlan,
    paymentsEnabled: false,
    normalizeFeatures: normalized
  });

  assert.deepEqual(query, { isActive: true });
  assert.deepEqual(sort, { sortOrder: 1, createdAt: 1 });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.paymentsEnabled, false);
  assert.deepEqual(res.result.body.plans.map((plan) => plan.slug), ["free", "starter", "pro"]);
  assert.deepEqual(res.result.body.plans[1].features, ["normalized:starter"]);
});

test("public plan catalogue keeps checkout availability separate when enabled", async () => {
  const SubscriptionPlan = {
    find() {
      return { sort() { return { lean: async () => [{ _id: "pro", slug: "pro", price: 999, features: [] }] }; } };
    }
  };
  const res = makeResponse();

  await listPublicPlans({}, res, assert.fail, {
    SubscriptionPlan,
    paymentsEnabled: true,
    normalizeFeatures: (features) => features
  });

  assert.equal(res.result.body.paymentsEnabled, true);
  assert.equal(res.result.body.plans.length, 1);
  assert.equal(res.result.body.plans[0].slug, "pro");
});

test("public plan catalogue forwards database errors to the application error handler", async () => {
  const expectedError = new Error("database unavailable");
  let forwarded;
  const SubscriptionPlan = {
    find() {
      return { sort() { return { lean: async () => { throw expectedError; } }; } };
    }
  };

  await listPublicPlans({}, makeResponse(), (error) => { forwarded = error; }, {
    SubscriptionPlan,
    paymentsEnabled: false
  });

  assert.equal(forwarded, expectedError);
});

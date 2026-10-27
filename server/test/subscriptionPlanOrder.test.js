import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/subscription-plan-order-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { SubscriptionPlan } = await import("../src/models/SubscriptionPlan.js");
const { default: billingRouter } = await import("../src/routes/billing.routes.js");

test("public billing plans preserve admin sortOrder across different currencies and billing periods", async () => {
  const plans = [
    {
      _id: "plan-third",
      name: "Configured Third",
      slug: "configured-third",
      price: 125,
      currency: "JPY",
      billingInterval: "quarterly",
      sortOrder: 3,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      features: ["Quarterly access"]
    },
    {
      _id: "plan-first",
      name: "Configured First",
      slug: "configured-first",
      price: 499,
      currency: "INR",
      billingInterval: "yearly",
      sortOrder: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      features: ["Annual access"]
    },
    {
      _id: "plan-second",
      name: "Configured Second",
      slug: "configured-second",
      price: 9.99,
      currency: "USD",
      billingInterval: "monthly",
      sortOrder: 2,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      features: ["Monthly global access"]
    }
  ];

  const originalFind = SubscriptionPlan.find;
  let capturedFilter;
  let capturedSort;
  SubscriptionPlan.find = (filter) => {
    capturedFilter = filter;
    const query = {
      sort(sortSpec) {
        capturedSort = sortSpec;
        return query;
      },
      lean: async () => plans
        .filter((plan) => plan.isActive !== false)
        .slice()
        .sort((left, right) =>
          left.sortOrder - right.sortOrder ||
          left.createdAt.getTime() - right.createdAt.getTime()
        )
    };
    return query;
  };

  const app = express();
  app.use("/api/billing", billingRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string", "test server should bind to an ephemeral port");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/billing/plans`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.deepEqual(capturedFilter, { isActive: true });
    assert.deepEqual(capturedSort, { sortOrder: 1, createdAt: 1 });
    assert.deepEqual(body.plans.map((plan) => plan.name), [
      "Configured First",
      "Configured Second",
      "Configured Third"
    ]);
    assert.deepEqual(body.plans.map((plan) => plan.currency), ["INR", "USD", "JPY"]);
    assert.deepEqual(body.plans.map((plan) => plan.billingInterval), ["yearly", "monthly", "quarterly"]);
  } finally {
    SubscriptionPlan.find = originalFind;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

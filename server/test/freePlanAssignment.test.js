import test from "node:test";
import assert from "node:assert/strict";
import { getOrCreateFreePlanSubscription } from "../src/services/freePlanAssignment.service.js";

function modelQuery(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    lean: async () => value
  };
}

test("a learner without a subscription receives the configured active free plan without payment", async () => {
  const freePlan = { _id: "free-plan", slug: "free", price: 0, isActive: true };
  const createdDocuments = [];
  const UserSubscription = {
    findOne: () => modelQuery(null),
    create: async (document) => {
      createdDocuments.push(document);
      return { ...document, _id: "free-subscription", toObject() { return { ...document, _id: "free-subscription" }; } };
    }
  };
  const SubscriptionPlan = {
    findOne(filter) {
      assert.deepEqual(filter, { isActive: true, $or: [{ slug: "free" }, { price: 0 }] });
      return modelQuery(freePlan);
    }
  };
  const now = new Date("2026-11-19T12:00:00.000Z");

  const result = await getOrCreateFreePlanSubscription("learner-1", {
    SubscriptionPlan,
    UserSubscription,
    now: () => now
  });

  assert.equal(createdDocuments.length, 1);
  assert.deepEqual(createdDocuments[0], {
    user: "learner-1",
    plan: "free-plan",
    status: "active",
    provider: "manual",
    currentPeriodStart: now,
    currentPeriodEnd: null
  });
  assert.equal(result.plan, freePlan);
  assert.equal(result.status, "active");
});

test("an existing subscription is preserved and no second free assignment is created", async () => {
  const existing = { _id: "paid-subscription", status: "active", plan: { _id: "paid-plan" } };
  let created = false;
  const result = await getOrCreateFreePlanSubscription("learner-2", {
    UserSubscription: {
      findOne: () => modelQuery(existing),
      create: async () => { created = true; }
    },
    SubscriptionPlan: {
      findOne: () => { throw new Error("free plan lookup should not run for an existing subscription"); }
    }
  });

  assert.equal(result, existing);
  assert.equal(created, false);
});

test("a concurrent duplicate assignment recovers the winning subscription", async () => {
  const winner = { _id: "winning-subscription", status: "active", plan: { _id: "free-plan" } };
  let reads = 0;
  const UserSubscription = {
    findOne: () => modelQuery(++reads === 1 ? null : winner),
    create: async () => { throw Object.assign(new Error("duplicate user subscription"), { code: 11000 }); }
  };
  const SubscriptionPlan = { findOne: () => modelQuery({ _id: "free-plan", price: 0 }) };

  const result = await getOrCreateFreePlanSubscription("learner-3", {
    SubscriptionPlan,
    UserSubscription
  });

  assert.equal(reads, 2);
  assert.equal(result, winner);
});

test("missing free plan returns no invented entitlement", async () => {
  let created = false;
  const result = await getOrCreateFreePlanSubscription("learner-4", {
    UserSubscription: {
      findOne: () => modelQuery(null),
      create: async () => { created = true; }
    },
    SubscriptionPlan: { findOne: () => modelQuery(null) }
  });

  assert.equal(result, null);
  assert.equal(created, false);
});

test("unexpected assignment failures are propagated instead of silently granting access", async () => {
  const failure = new Error("database unavailable");
  await assert.rejects(
    getOrCreateFreePlanSubscription("learner-5", {
      UserSubscription: {
        findOne: () => modelQuery(null),
        create: async () => { throw failure; }
      },
      SubscriptionPlan: { findOne: () => modelQuery({ _id: "free-plan", price: 0 }) }
    }),
    failure
  );
});

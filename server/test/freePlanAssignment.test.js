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
  const freePlan = { _id: "free-plan", slug: "free", price: 0, isActive: true, isDefaultFree: true };
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
      assert.deepEqual(filter, { isDefaultFree: true, isActive: true, price: 0 });
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


test("an existing provider-backed paid subscription is never changed to Free", async () => {
  const paid = {
    _id: "paid-subscription",
    user: "learner-paid",
    plan: { _id: "pro-plan", slug: "pro", price: 999 },
    status: "active",
    provider: "razorpay",
    providerSubscriptionId: "razorpay-sub-1",
    currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z")
  };
  let writes = 0;
  const result = await getOrCreateFreePlanSubscription("learner-paid", {
    UserSubscription: {
      findOne: () => modelQuery(paid),
      findOneAndUpdate: () => { writes += 1; throw new Error("paid subscription must not be updated"); },
      create: async () => { writes += 1; }
    },
    SubscriptionPlan: {
      findOne: () => { throw new Error("paid subscriptions must not resolve the Free plan"); }
    }
  });

  assert.equal(result, paid);
  assert.equal(writes, 0);
});

test("an active trial with a zero-price plan is not mistaken for a legacy Free assignment", async () => {
  const trial = {
    _id: "trial-subscription",
    user: "learner-trial",
    plan: { _id: "trial-plan", slug: "welcome-pro-trial", price: 0 },
    status: "trialing",
    provider: "manual",
    providerSubscriptionId: "",
    trialGrant: "trial-grant-1",
    trialCampaign: "trial-campaign-1",
    currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z")
  };
  let writes = 0;
  const result = await getOrCreateFreePlanSubscription("learner-trial", {
    UserSubscription: {
      findOne: () => modelQuery(trial),
      findOneAndUpdate: () => { writes += 1; throw new Error("active trial must not be updated"); },
      create: async () => { writes += 1; }
    },
    SubscriptionPlan: {
      findOne: () => { throw new Error("active trials must not resolve the Free plan"); }
    }
  });

  assert.equal(result, trial);
  assert.equal(writes, 0);
});

test("an active manual legacy Free assignment is atomically moved to the canonical Free plan", async () => {
  const legacy = {
    _id: "legacy-subscription",
    user: "learner-legacy",
    plan: { _id: "legacy-zero-plan", slug: "starter-free", price: 0, isActive: true },
    status: "active",
    provider: "manual",
    providerSubscriptionId: "",
    trialGrant: null,
    trialCampaign: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
  };
  const canonical = { _id: "canonical-free", slug: "free", price: 0, isActive: true, isDefaultFree: true };
  const migrated = { ...legacy, plan: canonical };
  let updateFilter;
  let updateDocument;
  const UserSubscription = {
    findOne: () => modelQuery(legacy),
    findOneAndUpdate(filter, update, options) {
      updateFilter = filter;
      updateDocument = { update, options };
      return modelQuery(migrated);
    },
    create: async () => assert.fail("legacy subscription must be migrated, not duplicated")
  };
  const SubscriptionPlan = {
    findOne(filter) {
      assert.deepEqual(filter, { isDefaultFree: true, isActive: true, price: 0 });
      return modelQuery(canonical);
    }
  };

  const result = await getOrCreateFreePlanSubscription("learner-legacy", {
    UserSubscription,
    SubscriptionPlan
  });

  assert.equal(result.plan, canonical);
  assert.deepEqual(updateDocument.update, { $set: { plan: canonical._id } });
  assert.equal(updateDocument.options.new, true);
  assert.equal(updateDocument.options.runValidators, true);
  assert.equal(updateFilter._id, legacy._id);
  assert.equal(updateFilter.user, "learner-legacy");
  assert.equal(updateFilter.plan, legacy.plan._id);
  assert.equal(updateFilter.status, "active");
  assert.equal(updateFilter.provider, "manual");
  assert.deepEqual(updateFilter.providerSubscriptionId, { $in: ["", null] });
  assert.equal(updateFilter.trialGrant, null);
  assert.equal(updateFilter.trialCampaign, null);
  assert.equal(updateFilter.currentPeriodEnd, null);
  assert.deepEqual(updateFilter.cancelAtPeriodEnd, { $ne: true });
});

test("a concurrent paid-plan transition wins over a legacy Free migration compare-and-set", async () => {
  const legacy = {
    _id: "legacy-subscription",
    user: "learner-race",
    plan: { _id: "legacy-free", slug: "free", price: 0 },
    status: "active",
    provider: "manual",
    providerSubscriptionId: "",
    trialGrant: null,
    trialCampaign: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
  };
  const paidWinner = {
    ...legacy,
    plan: { _id: "paid-plan", slug: "pro", price: 999 },
    provider: "razorpay",
    providerSubscriptionId: "provider-subscription"
  };
  let reads = 0;
  const UserSubscription = {
    findOne: () => modelQuery(++reads === 1 ? legacy : paidWinner),
    findOneAndUpdate: () => modelQuery(null),
    create: async () => assert.fail("a newer subscription already exists")
  };
  const SubscriptionPlan = {
    findOne: () => modelQuery({ _id: "canonical-free", slug: "free", price: 0, isActive: true, isDefaultFree: true })
  };

  const result = await getOrCreateFreePlanSubscription("learner-race", {
    UserSubscription,
    SubscriptionPlan
  });

  assert.equal(reads, 2);
  assert.equal(result, paidWinner);
});

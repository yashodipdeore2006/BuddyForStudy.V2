import test from "node:test";
import assert from "node:assert/strict";
import { getLearnerTrialOffer } from "../src/services/trialCampaignOffer.service.js";

const USER_ID = "507f1f77bcf86cd799439011";
const CAMPAIGN_A = "507f1f77bcf86cd799439012";
const CAMPAIGN_B = "507f1f77bcf86cd799439013";
const NOW = new Date("2026-11-21T10:00:00.000Z");

function query(value, calls = []) {
  return {
    sort(sortValue) { calls.push(["sort", sortValue]); return this; },
    limit(limitValue) { calls.push(["limit", limitValue]); return this; },
    populate(path, fields) { calls.push(["populate", path, fields]); return this; },
    select(fields) { calls.push(["select", fields]); return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function makeCampaign(overrides = {}) {
  return {
    _id: CAMPAIGN_A,
    internalName: "Internal welcome campaign",
    internalReason: "Internal reason that must never be exposed to learners.",
    offerTitle: "Explore Premium for 14 days",
    offerDescription: "Try premium learning resources during this limited offer.",
    status: "published",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-01T00:00:00.000Z"),
    trialDays: 14,
    maxClaims: 100,
    claimedCount: 2,
    trialPlan: {
      _id: "507f1f77bcf86cd799439014",
      name: "Premium Trial",
      description: "Premium learning access.",
      isActive: true,
      features: ["advanced_courses"],
      limits: { monthlyRoadmaps: 20 }
    },
    conversionMode: "consent_required",
    conversionPlan: {
      _id: "507f1f77bcf86cd799439015",
      name: "Premium Monthly",
      description: "Full premium membership.",
      price: 299,
      currency: "INR",
      billingInterval: "monthly",
      isActive: true,
      features: ["advanced_courses"],
      limits: { monthlyRoadmaps: 100 }
    },
    eligibility: {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: true,
      requireNoPreviousTrial: true
    },
    ...overrides
  };
}

function fixture({ campaigns = [makeCampaign()], learner, subscription = null, previousTrial = null, claims = [], liveClaim = null, activeTrial = null } = {}) {
  const calls = [];
  const filters = {};
  const dependencies = {
    TrialCampaignModel: {
      find(filter) {
        filters.campaigns = filter;
        return query(campaigns, calls);
      }
    },
    TrialCampaignClaimModel: {
      find(filter) {
        filters.claims = filter;
        return query(claims, calls);
      },
      async exists(filter) {
        if (Object.hasOwn(filter, "activeClaimKey")) {
          filters.liveClaim = filter;
          return liveClaim;
        }
        return null;
      }
    },
    TrialGrantModel: {
      async exists(filter) {
        if (filter.status === "trialing") return activeTrial;
        return previousTrial;
      }
    },
    UserModel: {
      findById(id) {
        filters.userId = id;
        return query(learner === undefined ? {
          _id: USER_ID, role: "user", isActive: true, emailVerified: true
        } : learner, calls);
      }
    },
    UserSubscriptionModel: {
      findOne(filter) {
        filters.subscription = filter;
        return query(subscription, calls);
      }
    }
  };
  return { dependencies, calls, filters };
}

test("no available published campaign returns a safe empty offer response", async () => {
  const f = fixture({ campaigns: [] });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.equal(result.offer, null);
  assert.deepEqual(result.eligibility.reasonCodes, ["NO_AVAILABLE_CAMPAIGN"]);
  assert.equal(f.filters.campaigns.status, "published");
  assert.deepEqual(f.filters.campaigns.startsAt, { $lte: NOW });
  assert.deepEqual(f.filters.campaigns.$expr, { $lt: ["$claimedCount", "$maxClaims"] });
  assert.equal(f.filters.userId, undefined);
});

test("eligible response contains learner-safe offer fields and no internal campaign data", async () => {
  const f = fixture();
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, true);
  assert.equal(result.eligibility.eligible, true);
  assert.deepEqual(result.eligibility.reasonCodes, []);
  assert.equal(result.offer.campaignId, CAMPAIGN_A);
  assert.equal(result.offer.title, "Explore Premium for 14 days");
  assert.equal(result.offer.durationDays, 14);
  assert.equal(result.offer.trialPlan.name, "Premium Trial");
  assert.equal(result.offer.conversion.requiresSeparateConsent, true);
  assert.equal(result.offer.conversion.plan.price, 299);
  assert.deepEqual(result.offer.payment, {
    paymentMethodRequired: false,
    paymentOrderCreated: false,
    autopayAuthorized: false
  });
  assert.equal("internalName" in result.offer, false);
  assert.equal("internalReason" in result.offer, false);
  assert.equal("claimedCount" in result.offer, false);
});

test("an existing free/default subscription does not block a trial offer", async () => {
  const f = fixture({
    subscription: {
      status: "active",
      currentPeriodEnd: null,
      plan: { slug: "free", price: 0 }
    }
  });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, true);
});

test("paid subscription blocks an offer even when campaign rules disable that check", async () => {
  const campaign = makeCampaign({
    eligibility: {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: false,
      requireNoPreviousTrial: false
    }
  });
  const f = fixture({
    campaigns: [campaign],
    subscription: {
      status: "active",
      currentPeriodEnd: new Date("2026-12-10T00:00:00.000Z"),
      plan: { slug: "premium", price: 299 }
    }
  });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.ok(result.eligibility.reasonCodes.includes("ACTIVE_SUBSCRIPTION"));
});

test("an already claimed campaign is skipped in favour of another eligible campaign", async () => {
  const second = makeCampaign({
    _id: CAMPAIGN_B,
    offerTitle: "A different offer",
    eligibility: { requireActiveAccount: true, requireVerifiedEmail: true, requireNoActiveSubscription: true, requireNoPreviousTrial: false }
  });
  const f = fixture({
    campaigns: [makeCampaign(), second],
    claims: [{ campaign: CAMPAIGN_A }]
  });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, true);
  assert.equal(result.offer.campaignId, CAMPAIGN_B);
});

test("an active claim from another campaign prevents a competing offer", async () => {
  const f = fixture({ liveClaim: { _id: "live-claim" } });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.deepEqual(result.eligibility.reasonCodes, ["TRIAL_CLAIM_IN_PROGRESS"]);
});

test("an active administrator trial prevents a campaign offer", async () => {
  const f = fixture({ activeTrial: { _id: "active-grant" } });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.deepEqual(result.eligibility.reasonCodes, ["ACTIVE_SUBSCRIPTION"]);
});

test("inactive or missing trial plans fail closed", async () => {
  const f = fixture({ campaigns: [makeCampaign({ trialPlan: null })] });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.deepEqual(result.eligibility.reasonCodes, ["TRIAL_PLAN_INACTIVE"]);
});

test("unverified email and prior-trial rules are calculated from persisted learner facts", async () => {
  const f = fixture({
    learner: { _id: USER_ID, role: "user", isActive: true, emailVerified: false }
  });
  const result = await getLearnerTrialOffer({ userId: USER_ID, now: NOW }, f.dependencies);
  assert.equal(result.available, false);
  assert.ok(result.eligibility.reasonCodes.includes("EMAIL_NOT_VERIFIED"));
  assert.equal(f.filters.subscription.user, USER_ID);
});

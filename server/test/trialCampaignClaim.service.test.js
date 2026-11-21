import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { claimTrialCampaign } from "../src/services/trialCampaignClaim.service.js";

const learnerId = "507f1f77bcf86cd799439011";
const campaignId = "507f1f77bcf86cd799439012";
const now = new Date("2026-11-20T10:00:00.000Z");
const idempotencyKey = "learner-trial-claim-0001";

function query(value) {
  return {
    session(session) { this.sessionValue = session; return this; },
    select() { return this; },
    populate() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}
function fixture(overrides = {}) {
  const campaign = {
    _id: campaignId,
    internalName: "Welcome premium trial",
    internalReason: "Give new learners time to explore premium resources.",
    createdBy: "507f1f77bcf86cd799439020",
    status: "published",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: null,
    maxClaims: 2,
    claimedCount: 0,
    trialPlan: "507f1f77bcf86cd799439013",
    trialDays: 7,
    conversionMode: "none",
    conversionPlan: null,
    eligibility: {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: false,
      requireNoPreviousTrial: true
    },
    ...(overrides.campaign || {})
  };
  const session = {
    transactionCalls: 0,
    ended: false,
    async withTransaction(callback) { this.transactionCalls += 1; return callback(); },
    async endSession() { this.ended = true; }
  };
  const recorded = {
    filters: [],
    updates: [],
    claimCreateOptions: null,
    claimCreated: null,
    claimActivation: null,
    grantCreated: null,
    grantCreateOptions: null,
    subscriptionCreated: null,
    subscriptionCreateOptions: null,
    subscriptionUpdate: null,
    eligibilityCampaign: null,
    eligibilitySession: null
  };
  const claimRecord = {
    _id: "507f1f77bcf86cd799439099",
    campaign: campaignId,
    user: learnerId,
    status: "reserved",
    claimedAt: now,
    trialDays: campaign.trialDays,
    trialPlan: campaign.trialPlan,
    conversionMode: campaign.conversionMode
  };
  const activeClaimRecord = {
    ...claimRecord,
    status: "active",
    trialGrant: "507f1f77bcf86cd799439098",
    userSubscription: "507f1f77bcf86cd799439097",
    activatedAt: now,
    trialEndsAt: new Date(now.getTime() + campaign.trialDays * 86400000)
  };
  const createdSubscription = {
    _id: "507f1f77bcf86cd799439097",
    user: learnerId,
    plan: campaign.trialPlan,
    status: "trialing",
    provider: "manual",
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + campaign.trialDays * 86400000)
  };
  const dependencies = {
    mongoose: { async startSession() { return session; } },
    TrialCampaignModel: {
      findById() { return query(campaign); },
      findOneAndUpdate(filter, update, options) {
        recorded.filters.push(filter);
        recorded.updates.push(update);
        recorded.updateOptions = options;
        return query({ ...campaign, claimedCount: campaign.claimedCount + 1 });
      }
    },
    TrialCampaignClaimModel: {
      findOne(filter) {
        if (Object.hasOwn(filter, "idempotencyKey")) return query(overrides.priorByKey || null);
        if (Object.hasOwn(filter, "activeClaimKey")) return query(overrides.activeClaim || null);
        return query(overrides.priorByCampaign || null);
      },
      async create(documents, options) {
        recorded.claimCreateOptions = options;
        recorded.claimCreated = documents[0];
        return [{ ...claimRecord, ...documents[0] }];
      },
      findOneAndUpdate(filter, update, options) {
        recorded.claimActivation = { filter, update, options };
        return query(activeClaimRecord);
      }
    },
    SubscriptionPlanModel: {
      findOne() { return query(overrides.activePlan === undefined ? { _id: campaign.trialPlan } : overrides.activePlan); }
    },
    TrialGrantModel: {
      exists(filter) { return query(filter.status === "trialing" ? overrides.activeTrial || null : null); },
      async create(documents, options) {
        recorded.grantCreated = documents[0];
        recorded.grantCreateOptions = options;
        return [{ _id: "507f1f77bcf86cd799439098", ...documents[0] }];
      }
    },
    UserSubscriptionModel: {
      findOne() { return query(overrides.currentSubscription || null); },
      findOneAndUpdate(filter, update, options) {
        recorded.subscriptionUpdate = { filter, update, options };
        return query({ _id: "507f1f77bcf86cd799439097", user: learnerId, ...update.$set });
      },
      async create(documents, options) {
        recorded.subscriptionCreated = documents[0];
        recorded.subscriptionCreateOptions = options;
        return [{ ...createdSubscription, ...documents[0] }];
      }
    },
    eligibilityLookup: async (input, options) => {
      recorded.eligibilityCampaign = input.campaign;
      recorded.eligibilitySession = options.session;
      return overrides.eligibility || { eligible: true, reasonCodes: [], reasons: [] };
    }
  };
  return { dependencies, session, recorded, campaign, claimRecord, activeClaimRecord };
}

test("campaign claim creates TrialGrant and UserSubscription atomically with the claim and cap", async () => {
  const f = fixture();
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, false);
  assert.equal(result.claim.status, "active");
  assert.equal(result.claim.entitlementStatus, "active");
  assert.equal(result.claim.trialEndsAt.toISOString(), "2026-11-27T10:00:00.000Z");
  assert.equal(f.session.transactionCalls, 1);
  assert.equal(f.session.ended, true);
  assert.equal(f.recorded.claimCreateOptions.session, f.session);
  assert.equal(f.recorded.grantCreateOptions.session, f.session);
  assert.equal(f.recorded.subscriptionCreateOptions.session, f.session);
  assert.equal(f.recorded.claimActivation.options.session, f.session);
  assert.equal(f.recorded.eligibilitySession, f.session);
  assert.equal(f.recorded.eligibilityCampaign.eligibility.requireNoActiveSubscription, true);
  assert.equal(f.recorded.grantCreated.source, "campaign");
  assert.equal(f.recorded.grantCreated.grantedBy, null);
  assert.equal(f.recorded.grantCreated.campaign, campaignId);
  assert.equal(f.recorded.grantCreated.campaignClaim, f.claimRecord._id);
  assert.equal(f.recorded.grantCreated.claimedBy, learnerId);
  assert.equal(f.recorded.grantCreated.conversionConsentStatus, "not_requested");
  assert.equal(f.recorded.subscriptionCreated.status, "trialing");
  assert.equal(f.recorded.subscriptionCreated.provider, "manual");
  assert.equal(f.recorded.subscriptionCreated.trialCampaign, campaignId);
  assert.equal(f.recorded.claimActivation.update.$set.status, "active");
  assert.deepEqual(f.recorded.updates, [{ $inc: { claimedCount: 1 } }]);
  assert.deepEqual(f.recorded.filters[0].$expr, { $lt: ["$claimedCount", "$maxClaims"] });
});

test("an existing free-plan subscription is conditionally upgraded to the trial plan", async () => {
  const freeSubscription = {
    _id: "free-subscription",
    user: learnerId,
    plan: { _id: "free-plan-id", slug: "free", price: 0 },
    status: "active",
    currentPeriodEnd: null
  };
  const f = fixture({ currentSubscription: freeSubscription });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(f.recorded.subscriptionUpdate.filter._id, freeSubscription._id);
  assert.equal(f.recorded.subscriptionUpdate.filter.plan, "free-plan-id");
  assert.equal(f.recorded.subscriptionUpdate.filter.status, "active");
  assert.equal(f.recorded.subscriptionUpdate.update.$set.status, "trialing");
  assert.equal(f.recorded.subscriptionUpdate.update.$set.plan, f.campaign.trialPlan);
  assert.equal(f.recorded.subscriptionUpdate.options.session, f.session);
  assert.equal(f.recorded.subscriptionCreated, null);
});

test("an active paid subscription is never overwritten even if eligibility reports eligible", async () => {
  const paidSubscription = {
    _id: "paid-subscription",
    user: learnerId,
    plan: { _id: "paid-plan-id", slug: "pro", price: 499 },
    status: "active",
    currentPeriodEnd: new Date("2026-12-20T00:00:00.000Z")
  };
  const f = fixture({ currentSubscription: paidSubscription });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, false);
  assert.equal(result.code, "ACTIVE_SUBSCRIPTION");
  assert.equal(f.recorded.filters.length, 0);
  assert.equal(f.recorded.grantCreated, null);
  assert.equal(f.recorded.subscriptionUpdate, null);
});

test("an active trial blocks another campaign even when its plan is zero-price", async () => {
  const trialSubscription = {
    _id: "trial-subscription",
    user: learnerId,
    plan: { _id: "zero-trial-plan", slug: "free", price: 0 },
    status: "trialing",
    currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z")
  };
  const f = fixture({ currentSubscription: trialSubscription });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "ACTIVE_SUBSCRIPTION");
  assert.equal(f.recorded.filters.length, 0);
});

test("conversion configuration records pending learner consent and makes no provider call", async () => {
  const f = fixture({ campaign: { conversionMode: "consent_required", conversionPlan: "507f1f77bcf86cd799439055" } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(f.recorded.grantCreated.conversionPlan, "507f1f77bcf86cd799439055");
  assert.equal(f.recorded.grantCreated.conversionConsentStatus, "pending_user_consent");
});

test("an existing administrator-issued active trial blocks campaign activation", async () => {
  const f = fixture({ activeTrial: { _id: "active-admin-trial" } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "ACTIVE_SUBSCRIPTION");
  assert.equal(f.recorded.filters.length, 0);
  assert.equal(f.recorded.grantCreated, null);
});

test("the same idempotency key replays the durable active entitlement without another write", async () => {
  const existing = {
    _id: "existing-claim",
    campaign: campaignId,
    idempotencyKey,
    status: "active",
    trialDays: 7,
    trialPlan: "plan-existing",
    conversionMode: "none",
    trialGrant: "grant-existing",
    userSubscription: "subscription-existing",
    trialEndsAt: new Date("2026-11-27T10:00:00.000Z")
  };
  const f = fixture({ priorByKey: existing });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
  assert.equal(result.claim.trialGrantId, "grant-existing");
  assert.equal(result.claim.entitlementStatus, "active");
  assert.equal(f.recorded.filters.length, 0);
  assert.equal(f.recorded.grantCreated, null);
});

test("inactive trial plans cannot consume campaign capacity or create entitlements", async () => {
  const f = fixture({ activePlan: null });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "TRIAL_PLAN_INACTIVE");
  assert.equal(f.recorded.filters.length, 0);
  assert.equal(f.recorded.grantCreated, null);
});

test("capacity races fail closed when the conditional reservation write no longer matches", async () => {
  const f = fixture();
  f.dependencies.TrialCampaignModel.findOneAndUpdate = (filter, update, options) => {
    f.recorded.filters.push(filter);
    f.recorded.updates.push(update);
    f.recorded.updateOptions = options;
    return query(null);
  };
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.status, 409);
  assert.equal(result.code, "CAMPAIGN_CAPACITY_OR_WINDOW_CHANGED");
  assert.equal(f.recorded.grantCreated, null);
});

test("a transaction failure rolls back the claim before creating subscription entitlement", async () => {
  const f = fixture();
  f.dependencies.TrialGrantModel.create = async () => { throw new Error("grant persistence failed"); };
  await assert.rejects(claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies), /grant persistence failed/);
  assert.equal(f.session.transactionCalls, 1);
  assert.equal(f.recorded.subscriptionCreated, null);
});

test("the service fails closed when MongoDB multi-document transactions are unavailable", async () => {
  const f = fixture();
  f.dependencies.mongoose.startSession = async () => ({ endSession: async () => {} });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.status, 503);
  assert.equal(result.code, "TRANSACTIONS_REQUIRED");
});

test("invalid idempotency keys are rejected before opening a database session", async () => {
  const f = fixture();
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey: "short", now }, f.dependencies);
  assert.equal(result.status, 400);
  assert.equal(result.code, "INVALID_IDEMPOTENCY_KEY");
  assert.equal(f.session.transactionCalls, 0);
});

test("claim service does not import or call a payment provider", async () => {
  const source = await readFile(new URL("../src/services/trialCampaignClaim.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /razorpay|createOrder|createSubscription|paymentOrder/i);
});

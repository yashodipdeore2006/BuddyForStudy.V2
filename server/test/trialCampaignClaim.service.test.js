import test from "node:test";
import assert from "node:assert/strict";
import { claimTrialCampaign } from "../src/services/trialCampaignClaim.service.js";
const learnerId = "507f1f77bcf86cd799439011";
const campaignId = "507f1f77bcf86cd799439012";
const now = new Date("2026-11-20T10:00:00.000Z");
const idempotencyKey = "learner-trial-claim-0001";
function query(value) {
  return {
    session(session) { this.sessionValue = session; return this; },
    select() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}
function fixture(overrides = {}) {
  const campaign = {
    _id: campaignId, status: "published", startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: null, maxClaims: 2, claimedCount: 0, trialPlan: "507f1f77bcf86cd799439013",
    trialDays: 7, conversionMode: "none", conversionPlan: null,
    eligibility: { requireActiveAccount: true, requireVerifiedEmail: true, requireNoActiveSubscription: false, requireNoPreviousTrial: true },
    ...overrides
  };
  const session = { transactionCalls: 0, ended: false,
    async withTransaction(callback) { this.transactionCalls += 1; return callback(); },
    async endSession() { this.ended = true; } };
  const recorded = { filters: [], updates: [], createOptions: null, created: null, eligibilityCampaign: null };
  const dependencies = {
    mongoose: { async startSession() { return session; } },
    TrialCampaignModel: {
      findById() { return query(campaign); },
      findOneAndUpdate(filter, update, options) {
        recorded.filters.push(filter); recorded.updates.push(update); recorded.updateOptions = options;
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
        recorded.createOptions = options; recorded.created = documents[0];
        return [{ _id: "507f1f77bcf86cd799439099", campaign: campaignId, user: learnerId, ...documents[0] }];
      }
    },
    SubscriptionPlanModel: { findOne() { return query(overrides.activePlan === undefined ? { _id: campaign.trialPlan } : overrides.activePlan); } },
    TrialGrantModel: { exists(filter) { return query(filter.status === "trialing" ? overrides.activeTrial || null : null); } },
    eligibilityLookup: async (input, options) => {
      recorded.eligibilityCampaign = input.campaign; recorded.eligibilitySession = options.session;
      return overrides.eligibility || { eligible: true, reasonCodes: [], reasons: [] };
    }
  };
  return { dependencies, session, recorded };
}
test("capacity reservation and unique claim row share one transaction and session", async () => {
  const f = fixture();
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.claim.status, "reserved");
  assert.equal(result.claim.entitlementStatus, "pending");
  assert.equal(f.session.transactionCalls, 1);
  assert.equal(f.session.ended, true);
  assert.equal(f.recorded.createOptions.session, f.session);
  assert.equal(f.recorded.updateOptions.session, f.session);
  assert.equal(f.recorded.eligibilitySession, f.session);
  assert.equal(f.recorded.eligibilityCampaign.eligibility.requireNoActiveSubscription, true);
  assert.deepEqual(f.recorded.updates, [{ $inc: { claimedCount: 1 } }]);
  assert.deepEqual(f.recorded.filters[0].$expr, { $lt: ["$claimedCount", "$maxClaims"] });
});
test("same key replays the original reservation without a second counter increment", async () => {
  const f = fixture({ priorByKey: {
    _id: "existing-claim", campaign: campaignId, user: learnerId, idempotencyKey,
    status: "reserved", claimedAt: now, trialDays: 7, trialPlan: "plan-existing", conversionMode: "none"
  } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.ok, true); assert.equal(result.replayed, true);
  assert.equal(result.claim.id, "existing-claim"); assert.equal(f.recorded.filters.length, 0);
});
test("the same key cannot be reused for another campaign", async () => {
  const f = fixture({ priorByKey: { _id: "existing-claim", campaign: "other", user: learnerId, idempotencyKey, status: "reserved" } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "IDEMPOTENCY_KEY_REUSED"); assert.equal(f.recorded.filters.length, 0);
});
test("a different key cannot bypass one claim per campaign and learner", async () => {
  const f = fixture({ priorByCampaign: { _id: "existing-claim", campaign: campaignId, user: learnerId } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey: "another-trial-claim-key-0002", now }, f.dependencies);
  assert.equal(result.code, "CAMPAIGN_ALREADY_CLAIMED"); assert.equal(f.recorded.filters.length, 0);
});
test("a learner with another reserved or active campaign claim cannot reserve a second campaign", async () => {
  const f = fixture({ activeClaim: {
    _id: "existing-live-claim", campaign: "another-campaign", user: learnerId,
    activeClaimKey: learnerId, status: "reserved"
  } });
  const result = await claimTrialCampaign({
    campaignId: "507f1f77bcf86cd799439099",
    userId: learnerId,
    idempotencyKey: "second-campaign-claim-0001",
    now
  }, f.dependencies);
  assert.equal(result.status, 409);
  assert.equal(result.code, "TRIAL_CLAIM_IN_PROGRESS");
  assert.equal(f.recorded.filters.length, 0);
  assert.equal(f.recorded.created, null);
});
test("ineligible learners are rejected before capacity reservation", async () => {
  const f = fixture({ eligibility: { eligible: false, reasonCodes: ["EMAIL_NOT_VERIFIED"], reasons: [{ message: "Verify email." }] } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.status, 403); assert.equal(result.code, "EMAIL_NOT_VERIFIED");
  assert.equal(f.recorded.filters.length, 0); assert.equal(f.recorded.created, null);
});
test("an active administrator-issued trial blocks a campaign claim", async () => {
  const f = fixture({ activeTrial: { _id: "active-trial" } });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "ACTIVE_SUBSCRIPTION"); assert.equal(f.recorded.filters.length, 0);
});
test("an inactive trial plan cannot consume campaign capacity", async () => {
  const f = fixture({ activePlan: null });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.code, "TRIAL_PLAN_INACTIVE"); assert.equal(f.recorded.filters.length, 0);
});
test("a capacity race fails closed when the conditional reservation write no longer matches", async () => {
  const f = fixture();
  f.dependencies.TrialCampaignModel.findOneAndUpdate = (filter, update, options) => {
    f.recorded.filters.push(filter); f.recorded.updates.push(update); f.recorded.updateOptions = options; return query(null);
  };
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.status, 409); assert.equal(result.code, "CAMPAIGN_CAPACITY_OR_WINDOW_CHANGED");
  assert.equal(f.recorded.created, null);
});
test("service fails closed when the database cannot provide multi-document transactions", async () => {
  const f = fixture(); f.dependencies.mongoose.startSession = async () => ({ endSession: async () => {} });
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey, now }, f.dependencies);
  assert.equal(result.status, 503); assert.equal(result.code, "TRANSACTIONS_REQUIRED");
});
test("invalid idempotency keys are rejected before opening a session", async () => {
  const f = fixture();
  const result = await claimTrialCampaign({ campaignId, userId: learnerId, idempotencyKey: "short", now }, f.dependencies);
  assert.equal(result.status, 400); assert.equal(result.code, "INVALID_IDEMPOTENCY_KEY");
  assert.equal(f.session.transactionCalls, 0);
});

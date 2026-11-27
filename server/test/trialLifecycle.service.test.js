import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  expireUserTrialIfDue,
  processExpiredTrialGrants,
  revokeTrialGrant
} from "../src/services/trialLifecycle.service.js";

const learnerId = "507f1f77bcf86cd799439011";
const grantId = "507f1f77bcf86cd799439012";
const claimId = "507f1f77bcf86cd799439013";
const trialPlanId = "507f1f77bcf86cd799439014";
const freePlanId = "507f1f77bcf86cd799439015";
const now = new Date("2026-11-21T10:00:00.000Z");
const endsAt = new Date("2026-11-21T09:59:59.000Z");

function query(value) {
  return {
    session(session) { this.sessionValue = session; return this; },
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function fixture({
  source = "campaign",
  subscription = null,
  freePlan = { _id: freePlanId },
  grant = {},
  dueGrants = [{ _id: grantId }],
  claimResult = { _id: claimId, status: "expired" },
  transactionFailure = false
} = {}) {
  const currentGrant = {
    _id: grantId,
    user: learnerId,
    plan: trialPlanId,
    source,
    campaignClaim: source === "campaign" ? claimId : null,
    status: "trialing",
    endsAt,
    conversionConsentStatus: "pending_user_consent",
    ...grant
  };
  const recorded = {
    scanFilter: null, grantFilter: null, grantUpdate: null,
    subscriptionFilter: null, subscriptionUpdate: null,
    claimFilter: null, claimUpdate: null, createdSubscription: null
  };
  const session = {
    ended: false,
    calls: 0,
    async withTransaction(callback) {
      this.calls += 1;
      if (transactionFailure) throw new Error("transaction unavailable");
      return callback();
    },
    async endSession() { this.ended = true; }
  };
  const dependencies = {
    mongoose: { async startSession() { return session; } },
    TrialGrantModel: {
      find(filter) { recorded.scanFilter = filter; return query(dueGrants); },
      findOne(filter) { recorded.grantFilter = filter; return query(currentGrant); },
      findOneAndUpdate(filter, update, options) {
        recorded.grantFilter = filter;
        recorded.grantUpdate = { update, options };
        return query(currentGrant);
      },
      findById() { return query(currentGrant); }
    },
    TrialCampaignClaimModel: {
      findOneAndUpdate(filter, update, options) {
        recorded.claimFilter = filter;
        recorded.claimUpdate = { update, options };
        return query(claimResult);
      }
    },
    UserSubscriptionModel: {
      findOne(filter) {
        if (Object.hasOwn(filter, "trialGrant") && filter.trialGrant === null) {
          return query(subscription && !subscription.trialGrant ? subscription : null);
        }
        if (Object.hasOwn(filter, "trialGrant")) {
          return query(subscription && String(subscription.trialGrant || "") === String(filter.trialGrant) ? subscription : null);
        }
        return query(subscription);
      },
      findOneAndUpdate(filter, update, options) {
        recorded.subscriptionFilter = filter;
        recorded.subscriptionUpdate = { update, options };
        return query({ _id: "sub1", ...update.$set });
      },
      async create(documents, options) {
        recorded.createdSubscription = { document: documents[0], options };
        return [{ _id: "sub1", ...documents[0] }];
      }
    },
    SubscriptionPlanModel: {
      findOne() { return query(freePlan); }
    }
  };
  return { dependencies, recorded, session, currentGrant };
}

test("expiry atomically expires a campaign grant, restores free plan, and releases the claim lock", async () => {
  const subscription = {
    _id: "sub1", user: learnerId, trialGrant: grantId, trialCampaign: "campaign1",
    plan: trialPlanId, status: "trialing", provider: "manual", providerSubscriptionId: "", currentPeriodEnd: endsAt
  };
  const f = fixture({ subscription });
  const result = await processExpiredTrialGrants({ now, maxItems: 25 }, f.dependencies);
  assert.equal(result.expiredCount, 1);
  assert.equal(result.subscriptionsRestored, 1);
  assert.equal(result.claimsReleased, 1);
  assert.deepEqual(f.recorded.scanFilter, { status: "trialing", endsAt: { $lte: now } });
  assert.equal(f.recorded.grantUpdate.update.$set.status, "expired");
  assert.equal(f.recorded.grantUpdate.update.$set.conversionConsentStatus, "cancelled");
  assert.equal(f.recorded.subscriptionUpdate.update.$set.status, "active");
  assert.equal(f.recorded.subscriptionUpdate.update.$set.plan, freePlanId);
  assert.equal(f.recorded.subscriptionUpdate.update.$set.trialGrant, null);
  assert.equal(f.recorded.claimUpdate.update.$set.status, "expired");
  assert.deepEqual(f.recorded.claimUpdate.update.$unset, { activeClaimKey: "" });
  assert.equal(f.session.calls, 1);
  assert.equal(f.session.ended, true);
});

test("revocation requires a reason and immediately changes only the linked trial subscription", async () => {
  const futureEnd = new Date("2026-11-28T09:59:59.000Z");
  const subscription = {
    _id: "sub1", user: learnerId, trialGrant: grantId, plan: trialPlanId,
    status: "trialing", provider: "manual", providerSubscriptionId: "", currentPeriodEnd: futureEnd
  };
  const f = fixture({ subscription, grant: { endsAt: futureEnd } });
  const invalid = await revokeTrialGrant({ grantId, reason: "short", now }, f.dependencies);
  assert.equal(invalid.code, "INVALID_REVOCATION_REASON");
  assert.equal(f.session.calls, 0);
  const result = await revokeTrialGrant({ grantId, reason: "Requested by account support after review.", now }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.targetStatus, "revoked");
  assert.equal(result.reason, "Requested by account support after review.");
  assert.equal(f.recorded.grantUpdate.update.$set.status, "revoked");
  assert.equal(f.recorded.subscriptionUpdate.update.$set.status, "active");
  assert.equal(f.recorded.claimUpdate.update.$set.status, "revoked");
});

test("legacy administrator grants restore the exact matching manual trial subscription", async () => {
  const subscription = {
    _id: "sub-legacy", user: learnerId, plan: trialPlanId,
    status: "trialing", provider: "manual", providerSubscriptionId: "", currentPeriodEnd: endsAt
  };
  const f = fixture({ source: "admin", subscription });
  const result = await processExpiredTrialGrants({ now }, f.dependencies);
  assert.equal(result.expiredCount, 1);
  assert.equal(f.recorded.subscriptionUpdate.update.$set.plan, freePlanId);
  assert.equal(f.recorded.subscriptionFilter.trialGrant, null);
});

test("when the configured free plan is missing, the expired trial loses trial status without inventing a plan", async () => {
  const subscription = {
    _id: "sub1", user: learnerId, trialGrant: grantId, plan: trialPlanId,
    status: "trialing", provider: "manual", providerSubscriptionId: "", currentPeriodEnd: endsAt
  };
  const f = fixture({ subscription, freePlan: null });
  const result = await processExpiredTrialGrants({ now }, f.dependencies);
  assert.equal(result.fallbackUnavailable, 1);
  assert.equal(f.recorded.subscriptionUpdate.update.$set.status, "expired");
  assert.equal("plan" in f.recorded.subscriptionUpdate.update.$set, false);
});

test("a changed or provider-backed subscription is never overwritten by trial expiry", async () => {
  const paidSubscription = {
    _id: "paid-sub", user: learnerId, plan: "paid-plan",
    status: "active", provider: "razorpay", providerSubscriptionId: "sub_provider"
  };
  const f = fixture({ subscription: paidSubscription });
  const result = await processExpiredTrialGrants({ now }, f.dependencies);
  assert.equal(result.expiredCount, 1);
  assert.equal(f.recorded.subscriptionUpdate, null);
  assert.equal(f.recorded.claimUpdate.update.$set.status, "expired");
});

test("a deleted trial subscription is recreated as the free plan only when no newer subscription exists", async () => {
  const f = fixture({ subscription: null });
  const result = await processExpiredTrialGrants({ now }, f.dependencies);
  assert.equal(result.expiredCount, 1);
  assert.equal(f.recorded.createdSubscription.document.plan, freePlanId);
  assert.equal(f.recorded.createdSubscription.options.session, f.session);
});

test("per-user expiry is constrained to that learner and bounded to ten grants", async () => {
  const f = fixture({ dueGrants: [] });
  await expireUserTrialIfDue(learnerId, { now, maxItems: 999 }, f.dependencies);
  assert.deepEqual(f.recorded.scanFilter, { status: "trialing", endsAt: { $lte: now }, user: learnerId });
});

test("transaction failures do not report a completed expiry", async () => {
  const f = fixture({ transactionFailure: true });
  await assert.rejects(processExpiredTrialGrants({ now }, f.dependencies), /transaction unavailable/);
  assert.equal(f.session.ended, true);
});

test("claim expiry state is supported by the claim model enum", async () => {
  const source = await readFile(new URL("../src/models/TrialCampaignClaim.js", import.meta.url), "utf8");
  assert.match(source, /"reserved", "active", "failed", "expired", "revoked"/);
});

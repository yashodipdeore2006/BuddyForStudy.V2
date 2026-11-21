import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTrialCampaignEligibility,
  evaluateTrialCampaignAudience,
  getTrialCampaignEligibilityForUser,
  isTrialCampaignSubscriptionActive
} from "../src/services/trialCampaignEligibility.service.js";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const campaign = {
  status: "published",
  startsAt: new Date("2026-11-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-01T00:00:00.000Z"),
  maxClaims: 100,
  claimedCount: 2,
  trialPlan: { isActive: true },
  eligibility: {
    requireActiveAccount: true,
    requireVerifiedEmail: true,
    requireNoActiveSubscription: true,
    requireNoPreviousTrial: true
  }
};
const learner = {
  _id: "learner-1",
  role: "user",
  isActive: true,
  emailVerified: true
};

test("a learner meeting every campaign rule is eligible", () => {
  const result = evaluateTrialCampaignEligibility({
    campaign,
    learner,
    activeSubscription: null,
    hasPreviousTrial: false,
    now: NOW
  });
  assert.deepEqual(result, { eligible: true, reasonCodes: [], reasons: [] });
});

test("eligibility returns stable reason codes and messages in a deterministic order", () => {
  const result = evaluateTrialCampaignEligibility({
    campaign: { ...campaign, status: "draft" },
    learner: { ...learner, isActive: false, emailVerified: false },
    activeSubscription: { status: "active", currentPeriodEnd: null },
    hasPreviousTrial: true,
    now: NOW
  });
  assert.deepEqual(result.reasonCodes, [
    "CAMPAIGN_NOT_PUBLISHED",
    "ACCOUNT_INACTIVE",
    "EMAIL_NOT_VERIFIED",
    "ACTIVE_SUBSCRIPTION",
    "PREVIOUS_TRIAL"
  ]);
  assert.equal(result.reasons.length, result.reasonCodes.length);
  assert.ok(result.reasons.every(reason => reason.message.length > 0));
});

test("administrator and unknown-role accounts are never treated as learners", () => {
  for (const role of ["admin", "moderator", undefined]) {
    const result = evaluateTrialCampaignEligibility({
      campaign: { ...campaign, eligibility: { requireActiveAccount: false, requireVerifiedEmail: false, requireNoActiveSubscription: false, requireNoPreviousTrial: false } },
      learner: { ...learner, role },
      activeSubscription: null,
      hasPreviousTrial: false,
      now: NOW
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasonCodes.includes("NOT_A_LEARNER_ACCOUNT"));
  }
});

test("campaign eligibility settings are applied while account role isolation stays mandatory", () => {
  const result = evaluateTrialCampaignEligibility({
    campaign: {
      ...campaign,
      eligibility: {
        requireActiveAccount: false,
        requireVerifiedEmail: false,
        requireNoActiveSubscription: false,
        requireNoPreviousTrial: false
      }
    },
    learner: { ...learner, isActive: false, emailVerified: false },
    activeSubscription: { status: "active", currentPeriodEnd: null },
    hasPreviousTrial: true,
    now: NOW
  });
  assert.equal(result.eligible, true);
});

test("missing authoritative subscription or trial-history facts fail closed when required", () => {
  const result = evaluateTrialCampaignEligibility({
    campaign,
    learner,
    now: NOW
  });
  assert.deepEqual(result.reasonCodes, ["ELIGIBILITY_CONTEXT_UNAVAILABLE"]);
});

test("current subscription statuses and period boundaries are checked consistently", () => {
  for (const status of ["trialing", "active", "past_due"]) {
    assert.equal(isTrialCampaignSubscriptionActive({ status, currentPeriodEnd: null }, NOW), true);
    assert.equal(isTrialCampaignSubscriptionActive({ status, currentPeriodEnd: "2026-11-20T10:00:01.000Z" }, NOW), true);
    assert.equal(isTrialCampaignSubscriptionActive({ status, currentPeriodEnd: NOW }, NOW), false);
  }
  for (const status of ["cancelled", "expired"]) {
    assert.equal(isTrialCampaignSubscriptionActive({ status, currentPeriodEnd: null }, NOW), false);
  }
  assert.equal(isTrialCampaignSubscriptionActive({ status: "active", currentPeriodEnd: "invalid" }, NOW), true);
});

test("a configured free/default plan is not treated as an active paid subscription", () => {
  for (const plan of [
    { slug: "free", price: 0 },
    { slug: "starter-free", price: 0 }
  ]) {
    assert.equal(isTrialCampaignSubscriptionActive({
      status: "active",
      currentPeriodEnd: null,
      plan
    }, NOW), false);
  }
  assert.equal(isTrialCampaignSubscriptionActive({
    status: "trialing",
    currentPeriodEnd: "2026-11-20T10:00:01.000Z",
    plan: { slug: "free", price: 0 }
  }, NOW), true);
  assert.equal(isTrialCampaignSubscriptionActive({
    status: "active",
    currentPeriodEnd: null,
    plan: { slug: "premium", price: 299 }
  }, NOW), true);
});

test("campaign dates, publication state and capacity block unavailable offers", () => {
  const cases = [
    [{ ...campaign, startsAt: "2026-11-21T00:00:00.000Z" }, "CAMPAIGN_NOT_STARTED"],
    [{ ...campaign, endsAt: "2026-11-20T10:00:00.000Z" }, "CAMPAIGN_ENDED"],
    [{ ...campaign, claimedCount: 100 }, "CAMPAIGN_CLAIM_LIMIT_REACHED"],
    [{ ...campaign, status: "ended" }, "CAMPAIGN_ENDED"],
    [{ ...campaign, trialPlan: { isActive: false } }, "TRIAL_PLAN_INACTIVE"]
  ];
  for (const [input, code] of cases) {
    const result = evaluateTrialCampaignEligibility({
      campaign: input,
      learner,
      activeSubscription: null,
      hasPreviousTrial: false,
      now: NOW
    });
    assert.ok(result.reasonCodes.includes(code), code);
  }
});

test("malformed campaign windows and counters fail closed", () => {
  for (const input of [
    { ...campaign, startsAt: "invalid" },
    { ...campaign, endsAt: "invalid" },
    { ...campaign, endsAt: "2026-10-01T00:00:00.000Z" },
    { ...campaign, maxClaims: 0 },
    { ...campaign, claimedCount: -1 }
  ]) {
    const result = evaluateTrialCampaignEligibility({
      campaign: input,
      learner,
      activeSubscription: null,
      hasPreviousTrial: false,
      now: NOW
    });
    assert.ok(result.reasonCodes.includes("CAMPAIGN_CONFIGURATION_INVALID"));
  }
});

test("a learner who already claimed the same campaign is always rejected", () => {
  const result = evaluateTrialCampaignEligibility({
    campaign: { ...campaign, eligibility: { ...campaign.eligibility, requireNoPreviousTrial: false } },
    learner,
    activeSubscription: null,
    hasPreviousTrial: false,
    hasExistingCampaignClaim: true,
    now: NOW
  });
  assert.deepEqual(result.reasonCodes, ["CAMPAIGN_ALREADY_CLAIMED"]);
});

test("audience evaluation preserves order and returns useful skipped reasons and counts", () => {
  const learners = [
    learner,
    { ...learner, _id: "learner-2", emailVerified: false },
    { ...learner, _id: "learner-3", role: "admin" }
  ];
  const result = evaluateTrialCampaignAudience({
    campaign,
    learners,
    factsByLearnerId: new Map([
      ["learner-1", { activeSubscription: null, hasPreviousTrial: false }],
      ["learner-2", { activeSubscription: null, hasPreviousTrial: false }],
      ["learner-3", { activeSubscription: null, hasPreviousTrial: false }]
    ]),
    now: NOW
  });
  assert.equal(result.eligibleCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.deepEqual(result.skipped[0].reasonCodes, ["EMAIL_NOT_VERIFIED"]);
  assert.deepEqual(result.skipped[1].reasonCodes, ["NOT_A_LEARNER_ACCOUNT"]);
  assert.equal(result.skippedReasonCounts.EMAIL_NOT_VERIFIED, 1);
  assert.equal(result.skippedReasonCounts.NOT_A_LEARNER_ACCOUNT, 1);
});

test("database-backed evaluation uses current user, subscription and trial history reads", async () => {
  const makeQuery = value => ({
    select() { return this; },
    populate() { return this; },
    session() { return this; },
    lean: async () => value
  });
  const calls = [];
  const dependencies = {
    UserModel: {
      findById(id) { calls.push(["user", id]); return makeQuery(learner); }
    },
    UserSubscriptionModel: {
      findOne(filter) { calls.push(["subscription", filter.user]); return makeQuery(null); }
    },
    TrialGrantModel: {
      async exists(filter) { calls.push(["trialHistory", filter.user]); return null; }
    }
  };
  const result = await getTrialCampaignEligibilityForUser({ campaign, userId: "learner-1", now: NOW }, dependencies);
  assert.equal(result.eligible, true);
  assert.deepEqual(calls, [
    ["user", "learner-1"],
    ["subscription", "learner-1"],
    ["trialHistory", "learner-1"]
  ]);
});

test("database-backed evaluation rejects a learner whose prior admin trial remains in history", async () => {
  const makeQuery = value => ({
    select() { return this; },
    populate() { return this; },
    session() { return this; },
    lean: async () => value
  });
  const result = await getTrialCampaignEligibilityForUser(
    { campaign, userId: "learner-1", now: NOW },
    {
      UserModel: { findById: () => makeQuery(learner) },
      UserSubscriptionModel: { findOne: () => makeQuery(null) },
      TrialGrantModel: { exists: async () => ({ _id: "grant-1" }) }
    }
  );
  assert.deepEqual(result.reasonCodes, ["PREVIOUS_TRIAL"]);
});


test("database-backed evaluation also blocks an explicitly supplied prior campaign claim", async () => {
  const makeQuery = value => ({
    select() { return this; },
    populate() { return this; },
    session() { return this; },
    lean: async () => value
  });
  const result = await getTrialCampaignEligibilityForUser(
    { campaign, userId: "learner-1", now: NOW, hasExistingCampaignClaim: true },
    {
      UserModel: { findById: () => makeQuery(learner) },
      UserSubscriptionModel: { findOne: () => makeQuery(null) },
      TrialGrantModel: { exists: async () => null }
    }
  );
  assert.deepEqual(result.reasonCodes, ["CAMPAIGN_ALREADY_CLAIMED"]);
});

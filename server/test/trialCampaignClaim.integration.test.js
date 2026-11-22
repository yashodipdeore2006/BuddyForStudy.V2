import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

import { User } from "../src/models/User.js";
import { SubscriptionPlan } from "../src/models/SubscriptionPlan.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { TrialCampaign } from "../src/models/TrialCampaign.js";
import { TrialCampaignClaim } from "../src/models/TrialCampaignClaim.js";
import { TrialGrant } from "../src/models/TrialGrant.js";
import { claimTrialCampaign } from "../src/services/trialCampaignClaim.service.js";
import { processExpiredTrialGrants } from "../src/services/trialLifecycle.service.js";

const canRun = Boolean(process.env.MONGO_URI);
const dbName = `buddyforstudy_trial_campaign_claim_${process.pid}_${Date.now()}`;
const NOW = new Date("2026-11-20T10:00:00.000Z");

let admin;
let defaultFreePlan;

before(async () => {
  if (!canRun) return;
  await mongoose.connect(process.env.MONGO_URI, { dbName });
  await Promise.all([
    User.init(),
    SubscriptionPlan.init(),
    UserSubscription.init(),
    TrialCampaign.init(),
    TrialCampaignClaim.init(),
    TrialGrant.init()
  ]);
  admin = await User.create({
    name: "Campaign Test Administrator",
    email: `campaign-admin-${crypto.randomUUID()}@example.test`,
    role: "admin",
    isActive: true,
    emailVerified: true
  });
  defaultFreePlan = await SubscriptionPlan.create({
    name: "Integration Default Free",
    slug: `integration-default-free-${crypto.randomUUID()}`,
    price: 0,
    currency: "INR",
    isActive: true,
    isDefaultFree: true
  });
}, { timeout: 30_000 });

after(async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createLearner({ role = "user", emailVerified = true } = {}) {
  return User.create({
    name: "Campaign Test Learner",
    email: `campaign-learner-${crypto.randomUUID()}@example.test`,
    role,
    isActive: true,
    emailVerified
  });
}

async function createCampaign({ maxClaims = 10, trialDays = 7 } = {}) {
  const token = crypto.randomUUID();
  const trialPlan = await SubscriptionPlan.create({
    name: "Campaign Trial " + token.slice(0, 8),
    slug: "campaign-trial-" + token,
    price: 0,
    currency: "INR",
    isActive: true,
    isDefaultFree: false
  });
  const startsAt = new Date(NOW.getTime() - 60_000);
  const campaign = await TrialCampaign.create({
    internalName: "Regression Campaign " + token.slice(0, 8),
    internalReason: "Created for trial campaign regression coverage.",
    offerTitle: "Explore the trial experience",
    offerDescription: "A regression test offer with no payment or recurring authorization.",
    trialPlan: trialPlan._id,
    trialDays,
    status: "published",
    startsAt,
    endsAt: null,
    maxClaims,
    claimedCount: 0,
    eligibility: {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: true,
      requireNoPreviousTrial: true
    },
    conversionMode: "none",
    conversionPlan: null,
    createdBy: admin._id,
    publishedBy: admin._id,
    publishedAt: startsAt
  });
  return { campaign, trialPlan };
}

function claimKey(prefix = "campaign-claim") {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function claim(campaign, learner, key = claimKey()) {
  return claimTrialCampaign({
    campaignId: String(campaign._id),
    userId: String(learner._id),
    idempotencyKey: key,
    now: NOW
  });
}

test("persisted role and learner eligibility are checked before campaign capacity is consumed", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const { campaign } = await createCampaign({ maxClaims: 5 });
  const administrator = await createLearner({ role: "admin" });
  const unverifiedLearner = await createLearner({ emailVerified: false });

  const adminResult = await claim(campaign, administrator);
  const unverifiedResult = await claim(campaign, unverifiedLearner);

  assert.equal(adminResult.ok, false);
  assert.equal(adminResult.code, "NOT_A_LEARNER_ACCOUNT");
  assert.equal(unverifiedResult.ok, false);
  assert.equal(unverifiedResult.code, "EMAIL_NOT_VERIFIED");
  assert.equal(await TrialCampaignClaim.countDocuments({ campaign: campaign._id }), 0);
  assert.equal(await TrialGrant.countDocuments({ campaign: campaign._id }), 0);
  const unchanged = await TrialCampaign.findById(campaign._id).lean();
  assert.equal(unchanged.claimedCount, 0);
});

test("concurrent learners cannot exceed the final campaign claim slot", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const { campaign } = await createCampaign({ maxClaims: 1 });
  const [firstLearner, secondLearner] = await Promise.all([
    createLearner(),
    createLearner()
  ]);

  const results = await Promise.all([
    claim(campaign, firstLearner, claimKey("capacity-one")),
    claim(campaign, secondLearner, claimKey("capacity-two"))
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  const rejected = results.find((result) => !result.ok);
  assert.equal(rejected.status, 409);
  assert.equal(await TrialCampaignClaim.countDocuments({ campaign: campaign._id }), 1);
  assert.equal(await TrialGrant.countDocuments({ campaign: campaign._id }), 1);
  const updatedCampaign = await TrialCampaign.findById(campaign._id).lean();
  assert.equal(updatedCampaign.claimedCount, 1);
});

test("concurrent retries with one idempotency key converge on one active claim and entitlement", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const { campaign } = await createCampaign({ maxClaims: 3 });
  const learner = await createLearner();
  const key = claimKey("same-request");

  const results = await Promise.all([
    claim(campaign, learner, key),
    claim(campaign, learner, key)
  ]);

  assert.ok(results.every((result) => result.ok));
  assert.equal(results.filter((result) => result.replayed === false).length, 1);
  assert.equal(results.filter((result) => result.replayed === true).length, 1);
  assert.equal(await TrialCampaignClaim.countDocuments({ campaign: campaign._id, user: learner._id }), 1);
  assert.equal(await TrialGrant.countDocuments({ campaign: campaign._id, claimedBy: learner._id }), 1);
  assert.equal(await UserSubscription.countDocuments({ user: learner._id }), 1);
  const updatedCampaign = await TrialCampaign.findById(campaign._id).lean();
  assert.equal(updatedCampaign.claimedCount, 1);
});

test("idempotency keys cannot be reused across campaigns and learners cannot claim one campaign twice", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const first = await createCampaign({ maxClaims: 3 });
  const second = await createCampaign({ maxClaims: 3 });
  const learner = await createLearner();
  const key = claimKey("cross-campaign-key");

  const initial = await claim(first.campaign, learner, key);
  assert.equal(initial.ok, true);

  const reusedKey = await claim(second.campaign, learner, key);
  assert.equal(reusedKey.ok, false);
  assert.equal(reusedKey.status, 409);
  assert.equal(reusedKey.code, "IDEMPOTENCY_KEY_REUSED");

  const differentKey = await claim(first.campaign, learner, claimKey("second-key"));
  assert.equal(differentKey.ok, false);
  assert.equal(differentKey.status, 409);
  assert.equal(differentKey.code, "CAMPAIGN_ALREADY_CLAIMED");
  assert.equal(await TrialCampaignClaim.countDocuments({ user: learner._id }), 1);
  assert.equal(await TrialGrant.countDocuments({ user: learner._id }), 1);
});

test("a learner cannot win concurrent claims for two campaigns", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const first = await createCampaign({ maxClaims: 2 });
  const second = await createCampaign({ maxClaims: 2 });
  const learner = await createLearner();

  const results = await Promise.all([
    claim(first.campaign, learner, claimKey("parallel-campaign-a")),
    claim(second.campaign, learner, claimKey("parallel-campaign-b"))
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  const rejected = results.find((result) => !result.ok);
  assert.equal(rejected.status, 409);
  assert.ok(["TRIAL_CLAIM_IN_PROGRESS", "TRIAL_CLAIM_CONFLICT"].includes(rejected.code));
  assert.equal(await TrialCampaignClaim.countDocuments({ user: learner._id }), 1);
  assert.equal(await TrialGrant.countDocuments({ user: learner._id }), 1);
  assert.equal(await UserSubscription.countDocuments({ user: learner._id }), 1);
});

test("real campaign-claim expiry restores Free access and releases the learner lock transactionally", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const { campaign } = await createCampaign({ maxClaims: 2, trialDays: 7 });
  const learner = await createLearner();
  const activated = await claim(campaign, learner, claimKey("expiry-claim"));
  assert.equal(activated.ok, true);

  const grantId = activated.claim.trialGrantId;
  const expiredAt = new Date(NOW.getTime() - 1_000);
  await TrialGrant.updateOne({ _id: grantId }, { $set: { endsAt: expiredAt } });
  await UserSubscription.updateOne(
    { user: learner._id, trialGrant: grantId },
    { $set: { currentPeriodEnd: expiredAt } }
  );

  const processed = await processExpiredTrialGrants({ now: NOW, maxItems: 10 });
  assert.equal(processed.expiredCount, 1);
  assert.equal(processed.subscriptionsRestored, 1);
  assert.equal(processed.claimsReleased, 1);

  const grant = await TrialGrant.findById(grantId).lean();
  const subscription = await UserSubscription.findOne({ user: learner._id }).lean();
  const claimRecord = await TrialCampaignClaim.findOne({ user: learner._id, campaign: campaign._id }).lean();

  assert.equal(grant.status, "expired");
  assert.equal(subscription.status, "active");
  assert.equal(String(subscription.plan), String(defaultFreePlan._id));
  assert.equal(subscription.trialGrant, null);
  assert.equal(subscription.trialCampaign, null);
  assert.equal(claimRecord.status, "expired");
  assert.equal(claimRecord.activeClaimKey, undefined);
});

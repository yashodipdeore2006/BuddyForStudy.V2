import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/controllers/adminTrialCampaigns.controller.js", import.meta.url), "utf8");

test("campaign management uses server-owned plan references and strict campaign validation", () => {
  assert.match(source, /trialCampaignCreateSchema\.parse/);
  assert.match(source, /trialCampaignUpdateSchema\.parse/);
  assert.match(source, /SubscriptionPlan\.findOne\(\{ _id: trialPlanId, isActive: true \}\)/);
  assert.match(source, /price: \{ \$gt: 0 \}/);
  assert.match(source, /billingInterval: \{ \$in: \["monthly", "quarterly", "yearly"\] \}/);
});

test("campaign updates cannot mutate published or claimed campaign terms", () => {
  assert.match(source, /!\["draft", "paused"\]\.includes\(campaign\.status\)/);
  assert.match(source, /campaign\.claimedCount > 0/);
  assert.match(source, /claimedCount: 0/);
  assert.match(source, /Only draft or paused campaigns can be edited/);
});

test("publishing, pausing and disabling use conditional state transitions and audit events", () => {
  assert.match(source, /status: campaign\.status/);
  assert.match(source, /status: "published"/);
  assert.match(source, /status: "paused"/);
  assert.match(source, /status: \{ \$in: \["draft", "published", "paused"\] \}/);
  assert.match(source, /trial_campaign\.published/);
  assert.match(source, /trial_campaign\.paused/);
  assert.match(source, /trial_campaign\.disabled/);
});

test("disabling a campaign does not remove or rewrite claimed learner entitlements", () => {
  assert.match(source, /it does not revoke or rewrite existing learner entitlements/);
  assert.doesNotMatch(source, /UserSubscription\.(delete|findOneAndDelete|deleteMany)/);
  assert.doesNotMatch(source, /TrialGrant\.(delete|findOneAndDelete|deleteMany)/);
});

test("list filtering accepts only named status values and escapes free-text search", () => {
  assert.match(source, /TRIAL_CAMPAIGN_STATUSES\.includes\(status\)/);
  assert.match(source, /escapeRegex\(query\)/);
  assert.doesNotMatch(source, /TrialCampaign\.find\(req\.query/);
});


test("campaign claim ledger validates status and campaign filters and bounds pagination", () => {
  assert.match(source, /\["reserved", "active", "failed", "expired", "revoked"\]\.includes\(status\)/);
  assert.match(source, /isValidObjectId\(campaignId\)/);
  assert.match(source, /Math\.min\(100, Math\.max\(1, Number\(req\.query\.limit\) \|\| 25\)\)/);
  assert.match(source, /TrialCampaignClaim\.find\(filter\)/);
  assert.match(source, /TrialCampaignClaim\.countDocuments\(filter\)/);
});

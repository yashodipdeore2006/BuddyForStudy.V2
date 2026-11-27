import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/pages/admin/AdminTrialCampaigns.tsx"), "utf8");

test("admin campaign workspace loads editable quick-trial presets and creates a draft", () => {
  assert.match(source, /\/api\/admin\/trials\/campaigns\/presets/);
  assert.match(source, /presetData\.valuesEditable !== true/);
  assert.match(source, /applyCampaignPreset/);
  assert.match(source, /preset\.trialDays/);
  assert.match(source, /preset\.maxClaims/);
  assert.match(source, /preset\.eligibility/);
  assert.match(source, /requireActiveAccount/);
  assert.match(source, /requireVerifiedEmail/);
  assert.match(source, /requireNoActiveSubscription/);
  assert.match(source, /requireNoPreviousTrial/);
  assert.match(source, /offerTitle:/);
  assert.match(source, /offerDescription:/);
  assert.match(source, /trialPlanId:/);
  assert.match(source, /maxClaims:/);
  assert.match(source, /conversionMode:/);
  assert.match(source, /conversionPlanId:/);

  const creation = source.slice(source.indexOf("async function createSelfServeCampaign"), source.indexOf("async function runCampaignLifecycleAction"));
  assert.match(creation, /const endpoint = editing/);
  assert.match(creation, /adminFetch\(endpoint,/);
  assert.match(creation, /method: editing \? "PUT" : "POST"/);
  assert.match(creation, /draft/i);
  assert.doesNotMatch(creation, /\/publish/);
});

test("the configured default Free assignment is not offered as a trial entitlement", () => {
  assert.match(source, /isDefaultFree\?: boolean/);
  assert.match(source, /trialEligiblePlans = activePlans\.filter\(\(plan: Plan\) => !plan\.isDefaultFree\)/);
  assert.match(source, /plans\.filter\(plan => !plan\.isDefaultFree\)\.map/);
  assert.match(source, /plans\.filter\(p=>!p\.isDefaultFree\)\.map/);
  assert.match(source, /plan\.isActive && !plan\.isDefaultFree/);
});

test("campaign lifecycle actions use the separate publish, pause and disable endpoints", () => {
  assert.match(source, /"publish" \| "pause" \| "disable"/);
  assert.match(source, /campaigns\/" \+ encodeURIComponent\(campaignId\) \+ "\/" \+ action/);
  assert.match(source, /setPublishTarget\(campaign\)/);
  assert.match(source, /runCampaignLifecycleAction\(publishTarget\._id, "publish"\)/);
  assert.match(source, /runCampaignLifecycleAction\(campaign\._id, "pause"\)/);
  assert.match(source, /runCampaignLifecycleAction\(campaign\._id, "disable"\)/);
});

test("self-serve campaigns remain separate from the existing manual grant flow", () => {
  assert.match(source, /\/api\/admin\/trials\/grants\?limit=50/);
  assert.match(source, /\/api\/admin\/trials\/preview/);
  assert.match(source, /\/api\/admin\/trials\/grant/);
  assert.match(source, /Trial grant history/);
});


test("trial dashboard separates claims from grant history and exposes operations sections", () => {
  assert.match(source, /trial-overview/);
  assert.match(source, /trial-campaigns/);
  assert.match(source, /trial-claims/);
  assert.match(source, /trial-grants/);
  assert.match(source, /trial-issue/);
  assert.match(source, /trial-history/);
  assert.match(source, /Campaign claims/);
  assert.match(source, /Trial grant history/);
});

test("active trial grants and terminal trial history are separate dashboard workspaces", () => {
  assert.match(source, /id="trial-grants"/);
  assert.match(source, /Active trial grants/);
  assert.match(source, /activeGrants\.map/);
  assert.match(source, /id="trial-issue"/);
  assert.match(source, /Issue a trial grant/);
  assert.match(source, /id="trial-history"/);
  assert.match(source, /historicalGrants\.map/);
  assert.match(source, /No expired, revoked or converted trials yet/);
  assert.match(source, /\["expired", "revoked", "converted"\]/);
});


test("self-serve campaign creation uses a validated three-step wizard", () => {
  assert.match(source, /aria-label="Campaign creation steps"/);
  assert.match(source, /title: "Trial setup"/);
  assert.match(source, /title: "Campaign details"/);
  assert.match(source, /title: "Review and save"/);
  assert.match(source, /function campaignStepError\(step: number\)/);
  assert.match(source, /function continueCampaignStep\(\)/);
  assert.match(source, /function goBackCampaignStep\(\)/);
  assert.match(source, /campaignStepError\(0\)/);
  assert.match(source, /campaignStepError\(1\)/);
  assert.match(source, /setCampaignStep\(current => Math\.min\(current \+ 1, 2\)\)/);
  assert.match(source, /Advanced configuration/);
});

test("campaign review exposes settings, eligibility and no-autopay disclosure before draft creation", () => {
  const review = source.slice(source.indexOf('aria-labelledby="campaign-review-title"'), source.indexOf('className="mt-6 flex flex-col-reverse'));
  for (const content of [
    "Internal campaign",
    "Learner-facing offer",
    "Trial entitlement plan",
    "Trial duration",
    "Maximum claims",
    "Campaign schedule",
    "Eligibility rules",
    "Paid conversion",
    "No autopay or payment authorization",
    "does not create a payment, recurring subscription or payment mandate",
    "saves a draft only"
  ]) assert.ok(review.includes(content), "review is missing " + content);
  assert.match(source, /Save campaign as draft/);
  assert.match(source, /method: "POST"/);
});

test("publishing a trial campaign requires explicit confirmation and preserves payment safety", () => {
  assert.match(source, /<AdminConfirmDialog/);
  assert.match(source, /title="Publish trial campaign\?"/);
  assert.match(source, /setPublishTarget\(campaign\)/);
  assert.match(source, /runCampaignLifecycleAction\(publishTarget\._id, "publish"\)/);
  assert.match(source, /makes this offer available to eligible learners during its configured campaign window/);
  assert.match(source, /Saving or publishing this campaign does not create a payment/);
});


test("admins can edit unclaimed draft or paused campaigns with a required audited change reason", () => {
  assert.match(source, /function startEditingCampaign\(campaign: TrialCampaign\)/);
  assert.match(source, /!\["draft", "paused"\]\.includes\(campaign\.status\) \|\| campaign\.claimedCount > 0/);
  assert.match(source, /const endpoint = editing/);
  assert.match(source, /method: editing \? "PUT" : "POST"/);
  assert.match(source, /body\.reason = editReason\.trim\(\)/);
  assert.match(source, /Administrator change reason \(required for audit\)/);
  assert.match(source, /Save campaign changes/);
  assert.match(source, /Cancel edit/);
  assert.match(source, /campaign\.claimedCount === 0/);
});

test("the self-serve campaign audience cannot disable active paid/trial exclusion", () => {
  assert.match(source, /checked=\{true\} disabled aria-describedby="campaign-active-subscription-policy"/);
  assert.match(source, /mandatory safety rule/);
  assert.match(source, /requireNoActiveSubscription: true/);
});

test("trial dashboard overview exposes campaign, recent-claim, grant and claim-status counts", () => {
  assert.match(source, /const claimCounts = claims\.reduce\(/);
  assert.match(source, /\["Campaigns", campaigns\.length\]/);
  assert.match(source, /\["Published", campaigns\.filter\(c => c\.status === "published"\)\.length\]/);
  assert.match(source, /\["Recent claims", claims\.length\]/);
  assert.match(source, /\["Active grants", activeGrantCount\]/);
  assert.match(source, /\["Trial history", historyGrantCount\]/);
  assert.match(source, /\["reserved","active","failed","expired","revoked"\]\.map\(status/);
  assert.match(source, /claimStatusFilter === "all" \? claims : claims\.filter\(claim => claim\.status === claimStatusFilter\)/);
});

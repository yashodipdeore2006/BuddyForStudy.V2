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
  assert.match(creation, /adminFetch\("\/api\/admin\/trials\/campaigns"/);
  assert.match(creation, /method: "POST"/);
  assert.match(creation, /draft/i);
  assert.doesNotMatch(creation, /\/publish/);
});

test("campaign lifecycle actions use the separate publish, pause and disable endpoints", () => {
  assert.match(source, /"publish" \| "pause" \| "disable"/);
  assert.match(source, /campaigns\/" \+ encodeURIComponent\(campaignId\) \+ "\/" \+ action/);
  assert.match(source, /runCampaignLifecycleAction\(campaign\._id, "publish"\)/);
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

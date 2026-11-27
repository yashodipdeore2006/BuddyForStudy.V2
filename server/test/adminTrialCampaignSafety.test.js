import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/controllers/adminTrials.controller.js", import.meta.url), "utf8");
const campaignSource = await readFile(new URL("../src/controllers/adminTrialCampaigns.controller.js", import.meta.url), "utf8");
const grantStart = source.indexOf("export async function grant");
const grantEnd = source.indexOf("\nexport async function ", grantStart + 1);
const grant = source.slice(grantStart, grantEnd);

test("trial grant requires explicit confirmation and a bounded idempotency key", () => {
  assert.match(grant, /confirm: z\.literal\(true\)/);
  assert.match(grant, /idempotencyKey: z\.string\(\)\.trim\(\)\.min\(12\)\.max\(120\)/);
  assert.match(grant, /TrialGrant\.exists\(\{ idempotencyKey: key \}\)/);
});

test("trial grant rechecks active subscriptions and prior trial state before creating entitlements", () => {
  assert.match(grant, /UserSubscription\.findOne\(\{ user: user\.id, status: \{ \$in: \["trialing", "active", "past_due"\] \}/);
  assert.match(grant, /TrialGrant\.exists\(\{ user: user\.id, status: \{ \$in: \["trialing", "converted"\] \} \}\)/);
  assert.match(grant, /TrialGrant\.create\(/);
  assert.match(grant, /UserSubscription\.findOneAndUpdate\(/);
  assert.match(grant, /replaceableFilter/);
});

test("paid conversion remains pending explicit learner consent and trial grant is audited", () => {
  assert.match(grant, /conversionConsentStatus: input\.conversionPlanId \? "pending_user_consent" : "not_requested"/);
  assert.match(grant, /"trial\.granted"/);
  assert.match(grant, /No recurring payment was initiated/);
  assert.match(grant, /paid conversion requires the learner's explicit authorization/);
});


test("manual trial grant revalidates the recurring paid conversion plan at grant time", () => {
  assert.match(grant, /if \(input\.conversionPlanId\) \{[\s\S]*?price: \{ \$gt: 0 \}[\s\S]*?billingInterval: \{ \$in: \["monthly", "quarterly", "yearly"\] \}/);
  assert.match(grant, /Choose a different active recurring paid conversion plan/);
});


test("manual trial preview and grant both reject the configured default Free plan as a trial target", () => {
  const previewStart = source.indexOf("export async function preview");
  const previewEnd = source.indexOf("export async function grant", previewStart);
  const preview = source.slice(previewStart, previewEnd);
  assert.match(preview, /const defaultFreePlan = await getDefaultFreePlan\(\)/);
  assert.match(preview, /defaultFreePlan && String\(defaultFreePlan\._id\) === String\(plan\._id\)/);
  assert.match(grant, /defaultFreePlan && String\(defaultFreePlan\._id\) === String\(plan\._id\)/);
});

test("self-serve campaigns cannot use the configured default Free plan as their trial entitlement", () => {
  assert.match(campaignSource, /const defaultFreePlan = await getDefaultFreePlan\(\)/);
  assert.match(campaignSource, /String\(defaultFreePlan\._id\) === String\(trialPlan\._id\)/);
});

test("manual trial conversion preview and grant use only supported recurring billing intervals", () => {
  const previewStart = source.indexOf("export async function preview");
  const previewEnd = source.indexOf("export async function grant", previewStart);
  const preview = source.slice(previewStart, previewEnd);
  for (const section of [preview, grant]) {
    assert.match(section, /billingInterval: \{ \$in: \["monthly", "quarterly", "yearly"\] \}/);
  }
});

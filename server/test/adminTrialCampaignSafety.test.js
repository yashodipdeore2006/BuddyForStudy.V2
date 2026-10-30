import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/controllers/adminTrials.controller.js", import.meta.url), "utf8");
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

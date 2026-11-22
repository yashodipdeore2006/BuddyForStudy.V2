import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/controllers/adminTrials.controller.js", import.meta.url), "utf8");
const grantStart = controller.indexOf("export async function grant");
const grantEnd = controller.indexOf("export async function listGrants", grantStart);
const grantHandler = controller.slice(grantStart, grantEnd);

test("trial campaign cannot overwrite a subscription that became active after initial eligibility checks", () => {
  assert.match(grantHandler, /const replaceableFilter = \{[\s\S]*?status: \{ \$nin: \["trialing", "active", "past_due"\] \}[\s\S]*?currentPeriodEnd: \{ \$lte: now \}/);
  assert.match(grantHandler, /UserSubscription\.findOneAndUpdate\(\s*replaceableFilter/);
  assert.doesNotMatch(grantHandler, /UserSubscription\.findOneAndUpdate\(\s*\{ user: user\.id \}/);
  assert.doesNotMatch(grantHandler, /UserSubscription\.findOneAndUpdate\([\s\S]*?\{ upsert: true/);
});

test("a concurrent active-subscription conflict removes the unfulfilled trial grant and skips the learner", () => {
  assert.match(grantHandler, /UserSubscription\.create\(\{ user: user\.id, \.\.\.subscriptionValues \}\)/);
  assert.match(grantHandler, /await grant\.deleteOne\(\)/);
  assert.match(grantHandler, /if \(subscriptionError\?\.code === 11000\) \{\s*skipped\+\+;\s*continue;/);
});


test("manual trial grants allow replacement only of the configured default Free assignment", () => {
  assert.match(grantHandler, /const defaultFreePlan = await getDefaultFreePlan\(\)/);
  assert.match(grantHandler, /isDefaultFreeAssignment/);
  assert.match(grantHandler, /provider: "manual",[\s\S]*?plan: defaultFreePlan\._id/);
  assert.match(grantHandler, /hasActivePaidOrTrial/);
});

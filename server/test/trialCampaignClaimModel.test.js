import test from "node:test";
import assert from "node:assert/strict";
import { TrialCampaignClaim } from "../src/models/TrialCampaignClaim.js";
test("campaign claim indexes enforce unique learner claims and learner-scoped idempotency", () => {
  const indexes = TrialCampaignClaim.schema.indexes();
  const uniqueClaim = indexes.find(([keys]) => keys.campaign === 1 && keys.user === 1);
  const uniqueKey = indexes.find(([keys]) => keys.user === 1 && keys.idempotencyKey === 1);
  assert.equal(uniqueClaim?.[1]?.unique, true);
  assert.equal(uniqueClaim?.[1]?.name, "trial_campaign_claim_unique_learner");
  assert.equal(uniqueKey?.[1]?.unique, true);
  assert.equal(uniqueKey?.[1]?.name, "trial_campaign_claim_idempotency");
});
test("claim ledger keeps bounded trial snapshots and later activation references", () => {
  assert.equal(TrialCampaignClaim.schema.path("status").enumValues.join(","), "reserved,active,failed,revoked");
  assert.equal(TrialCampaignClaim.schema.path("status").defaultValue, "reserved");
  assert.equal(TrialCampaignClaim.schema.path("trialDays").options.min, 1);
  assert.equal(TrialCampaignClaim.schema.path("trialDays").options.max, 30);
  assert.equal(TrialCampaignClaim.schema.path("trialGrant").options.default, null);
  assert.equal(TrialCampaignClaim.schema.path("userSubscription").options.default, null);
});

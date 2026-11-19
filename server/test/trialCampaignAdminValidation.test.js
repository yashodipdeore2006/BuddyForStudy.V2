import test from "node:test";
import assert from "node:assert/strict";
import {
  trialCampaignCreateSchema,
  trialCampaignUpdateSchema
} from "../src/utils/trialCampaignAdminValidation.js";

const trialPlanId = "64b000000000000000000001";
const conversionPlanId = "64b000000000000000000002";

function validCampaign(overrides = {}) {
  return {
    internalName: "New learner launch",
    internalReason: "Introduce premium learning to eligible new learners.",
    offerTitle: "Try premium learning free",
    offerDescription: "Explore premium learning tools for seven days at no charge.",
    trialPlanId,
    trialDays: 7,
    startsAt: "2026-12-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    maxClaims: 500,
    ...overrides
  };
}

test("campaign create validation accepts bounded fields and applies safe defaults", () => {
  const result = trialCampaignCreateSchema.parse(validCampaign());
  assert.equal(result.status, undefined, "publication status is not accepted from create input");
  assert.equal(result.maxClaims, 500);
  assert.equal(result.conversionMode, "none");
  assert.equal(result.conversionPlanId, null);
  assert.deepEqual(result.eligibility, {
    requireActiveAccount: true,
    requireVerifiedEmail: true,
    requireNoActiveSubscription: true,
    requireNoPreviousTrial: true
  });
  assert.ok(result.startsAt instanceof Date);
  assert.ok(result.endsAt instanceof Date);
});

test("campaign create rejects unknown fields and unknown eligibility options", () => {
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({ arbitraryMongoFilter: { role: "admin" } })).success, false);
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    eligibility: { requireVerifiedEmail: true, allowAdminAccounts: true }
  })).success, false);
});

test("campaign create enforces trial duration, capacity and identifier bounds", () => {
  for (const patch of [
    { trialDays: 0 },
    { trialDays: 31 },
    { trialDays: 1.5 },
    { maxClaims: 0 },
    { maxClaims: 1_000_001 },
    { maxClaims: 1.5 },
    { trialPlanId: "not-an-object-id" }
  ]) {
    assert.equal(trialCampaignCreateSchema.safeParse(validCampaign(patch)).success, false, JSON.stringify(patch));
  }
});

test("campaign create enforces a valid date window", () => {
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    startsAt: "2026-12-10T00:00:00.000Z",
    endsAt: "2026-12-10T00:00:00.000Z"
  })).success, false);
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    endsAt: "not-a-date"
  })).success, false);
});

test("conversion settings require a distinct paid-plan reference", () => {
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    conversionMode: "consent_required"
  })).success, false);
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    conversionMode: "consent_required",
    conversionPlanId
  })).success, true);
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    conversionMode: "consent_required",
    conversionPlanId: trialPlanId
  })).success, false);
  assert.equal(trialCampaignCreateSchema.safeParse(validCampaign({
    conversionMode: "none",
    conversionPlanId
  })).success, false);
});

test("campaign update requires a reason and at least one safe mutable field", () => {
  assert.equal(trialCampaignUpdateSchema.safeParse({ reason: "Correct an offer description after review." }).success, false);
  assert.equal(trialCampaignUpdateSchema.safeParse({
    reason: "Correct an offer description after review.",
    offerTitle: "Updated offer title"
  }).success, true);
  assert.equal(trialCampaignUpdateSchema.safeParse({
    reason: "This is valid but contains an unknown operator.",
    $set: { status: "published" }
  }).success, false);
});

test("campaign update accepts partial fields but preserves strict date and conversion validation", () => {
  assert.equal(trialCampaignUpdateSchema.safeParse({
    reason: "Increase the cap before the campaign begins.",
    maxClaims: 750
  }).success, true);
  assert.equal(trialCampaignUpdateSchema.safeParse({
    reason: "Correct the campaign date window.",
    startsAt: "2026-12-20T00:00:00.000Z",
    endsAt: "2026-12-10T00:00:00.000Z"
  }).success, false);
  assert.equal(trialCampaignUpdateSchema.safeParse({
    reason: "Disable the optional paid conversion offer.",
    conversionMode: "none",
    conversionPlanId
  }).success, false);
});


test("a selected quick-trial preset can be edited before normal campaign creation", () => {
  const trialDays = 10;
  const maxClaims = 240;
  const result = trialCampaignCreateSchema.safeParse(validCampaign({ trialDays, maxClaims }));
  assert.equal(result.success, true);
  assert.equal(result.data.trialDays, trialDays);
  assert.equal(result.data.maxClaims, maxClaims);
});

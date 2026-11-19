import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { TrialCampaign } from "../src/models/TrialCampaign.js";

const objectId = () => new mongoose.Types.ObjectId();

function validCampaign(overrides = {}) {
  return new TrialCampaign({
    internalName: "New learner launch",
    internalReason: "Introduce the premium learning experience to eligible new learners.",
    offerTitle: "Try premium learning free",
    offerDescription: "Explore premium learning tools for seven days at no charge.",
    trialPlan: objectId(),
    trialDays: 7,
    startsAt: new Date("2026-12-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-31T23:59:59.000Z"),
    maxClaims: 500,
    createdBy: objectId(),
    ...overrides
  });
}

test("trial campaign accepts a valid draft with safe eligibility defaults", async () => {
  const campaign = validCampaign();

  await assert.doesNotReject(campaign.validate());
  assert.equal(campaign.status, "draft");
  assert.equal(campaign.claimedCount, 0);
  assert.deepEqual(campaign.eligibility.toObject(), {
    requireActiveAccount: true,
    requireVerifiedEmail: true,
    requireNoActiveSubscription: true,
    requireNoPreviousTrial: true
  });
  assert.equal(campaign.conversionMode, "none");
  assert.equal(campaign.conversionPlan, null);
});

test("trial campaign rejects unsafe or unknown top-level and eligibility properties", () => {
  assert.throws(() => new TrialCampaign({
    ...validCampaign().toObject(),
    arbitraryMongoFilter: { role: "admin" }
  }), /strict mode/i);

  const campaign = validCampaign({
    eligibility: { requireVerifiedEmail: true, allowAdminAccounts: true }
  });
  assert.ok(campaign.validateSync()?.errors?.eligibility);
});

test("trial duration, claim cap, and claim count are bounded integers", async () => {
  for (const [field, value] of [
    ["trialDays", 0],
    ["trialDays", 31],
    ["trialDays", 2.5],
    ["maxClaims", 0],
    ["maxClaims", 10.5],
    ["maxClaims", 1_000_001],
    ["claimedCount", -1],
    ["claimedCount", 1.5]
  ]) {
    const campaign = validCampaign({ [field]: value });
    await assert.rejects(campaign.validate(), (error) => Boolean(error.errors[field]));
  }
});

test("campaign end date must be later than its start date", async () => {
  const campaign = validCampaign({
    startsAt: new Date("2026-12-10T00:00:00.000Z"),
    endsAt: new Date("2026-12-10T00:00:00.000Z")
  });

  await assert.rejects(campaign.validate(), (error) => Boolean(error.errors.endsAt));
});

test("conversion plan is mandatory only when conversion requires learner consent", async () => {
  const missingPlan = validCampaign({ conversionMode: "consent_required" });
  await assert.rejects(missingPlan.validate(), (error) => Boolean(error.errors.conversionPlan));

  const unexpectedPlan = validCampaign({
    conversionMode: "none",
    conversionPlan: objectId()
  });
  await assert.rejects(unexpectedPlan.validate(), (error) => Boolean(error.errors.conversionPlan));

  const consentBased = validCampaign({
    conversionMode: "consent_required",
    conversionPlan: objectId()
  });
  await assert.doesNotReject(consentBased.validate());
});

test("published, paused, and ended campaigns require lifecycle audit timestamps", async () => {
  const published = validCampaign({ status: "published" });
  await assert.rejects(published.validate(), (error) => Boolean(error.errors.publishedAt));

  const publishedWithAudit = validCampaign({
    status: "published",
    publishedAt: new Date(),
    publishedBy: objectId()
  });
  await assert.doesNotReject(publishedWithAudit.validate());

  const paused = validCampaign({ status: "paused" });
  await assert.rejects(paused.validate(), (error) => Boolean(error.errors.pausedAt));

  const ended = validCampaign({ status: "ended" });
  await assert.rejects(ended.validate(), (error) => Boolean(error.errors.endedAt));
});

test("campaign declares learner-discovery and admin-list compound indexes", () => {
  const indexes = TrialCampaign.schema.indexes().map(([keys, options]) => ({
    keys,
    name: options.name
  }));

  assert.ok(indexes.some((index) =>
    index.name === "trial_campaign_learner_offer_lookup" &&
    index.keys.status === 1 &&
    index.keys.startsAt === 1 &&
    index.keys.endsAt === 1
  ));
  assert.ok(indexes.some((index) =>
    index.name === "trial_campaign_admin_list" &&
    index.keys.status === 1 &&
    index.keys.updatedAt === -1
  ));
});

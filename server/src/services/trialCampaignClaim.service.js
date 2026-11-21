import mongoose from "mongoose";
import { TrialCampaign } from "../models/TrialCampaign.js";
import { TrialCampaignClaim } from "../models/TrialCampaignClaim.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { User } from "../models/User.js";
import { UserSubscription } from "../models/UserSubscription.js";
import {
  getTrialCampaignEligibilityForUser,
  isTrialCampaignSubscriptionActive,
  TRIAL_CAMPAIGN_ELIGIBILITY_REASONS
} from "./trialCampaignEligibility.service.js";

const CAMPAIGN_BLOCK_CODES = new Set([
  "CAMPAIGN_NOT_PUBLISHED", "CAMPAIGN_NOT_STARTED", "CAMPAIGN_ENDED",
  "CAMPAIGN_CLAIM_LIMIT_REACHED", "CAMPAIGN_CONFIGURATION_INVALID", "TRIAL_PLAN_INACTIVE"
]);

function failure(status, code, message, reasons = []) {
  return { ok: false, status, code, message, reasons };
}
function readQuery(query, session, lean = true) {
  let pending = query;
  if (session && pending && typeof pending.session === "function") pending = pending.session(session);
  if (lean && pending && typeof pending.lean === "function") pending = pending.lean();
  return pending;
}
function isFreePlan(plan) {
  if (!plan || typeof plan !== "object") return false;
  return String(plan.slug || "").trim().toLowerCase() === "free"
    || (Number.isFinite(Number(plan.price)) && Number(plan.price) === 0);
}
function publicClaim(claim) {
  return {
    id: String(claim._id),
    campaignId: String(claim.campaign?._id || claim.campaign),
    status: claim.status,
    claimedAt: claim.claimedAt,
    trialDays: claim.trialDays,
    trialPlanId: String(claim.trialPlan?._id || claim.trialPlan),
    conversionMode: claim.conversionMode,
    trialGrantId: claim.trialGrant ? String(claim.trialGrant?._id || claim.trialGrant) : null,
    userSubscriptionId: claim.userSubscription ? String(claim.userSubscription?._id || claim.userSubscription) : null,
    trialEndsAt: claim.trialEndsAt || null,
    entitlementStatus: claim.status === "active" ? "active" : "pending"
  };
}
function replayOrConflict(claim, campaignId, idempotencyKey) {
  if (claim && String(claim.campaign?._id || claim.campaign) === String(campaignId)
    && claim.idempotencyKey === idempotencyKey) {
    return { ok: true, replayed: true, claim: publicClaim(claim) };
  }
  if (claim && claim.idempotencyKey === idempotencyKey) {
    return failure(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different trial campaign.");
  }
  if (claim) return failure(409, "CAMPAIGN_ALREADY_CLAIMED", "This learner has already claimed this trial campaign.");
  return null;
}
function eligibilityFailure(result) {
  const reasonCodes = Array.isArray(result?.reasonCodes) ? result.reasonCodes : [];
  const reasons = Array.isArray(result?.reasons) ? result.reasons : [];
  const blockedByCampaign = reasonCodes.some((code) => CAMPAIGN_BLOCK_CODES.has(code));
  return failure(
    blockedByCampaign ? 409 : 403,
    reasonCodes[0] || "TRIAL_NOT_ELIGIBLE",
    reasons.map((item) => item.message).filter(Boolean).join(" ")
      || "This learner is not eligible for the trial campaign.",
    reasons
  );
}
function operationalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Claim and activate a self-serve trial in one MongoDB transaction. Campaign
 * capacity, unique claim, TrialGrant history, and UserSubscription entitlement
 * commit or roll back together.
 */
export async function claimTrialCampaign({
  campaignId,
  userId,
  idempotencyKey,
  now = new Date()
} = {}, dependencies = {}) {
  const key = String(idempotencyKey || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/.test(key)) {
    return failure(400, "INVALID_IDEMPOTENCY_KEY", "Send a valid 16–120 character Idempotency-Key.");
  }
  if (!campaignId || !userId) {
    return failure(400, "INVALID_CLAIM_CONTEXT", "A campaign and authenticated learner are required.");
  }

  const db = dependencies.mongoose || mongoose;
  const Campaign = dependencies.TrialCampaignModel || TrialCampaign;
  const Claim = dependencies.TrialCampaignClaimModel || TrialCampaignClaim;
  const Plan = dependencies.SubscriptionPlanModel || SubscriptionPlan;
  const Grants = dependencies.TrialGrantModel || TrialGrant;
  const Subscription = dependencies.UserSubscriptionModel || UserSubscription;
  const lookupEligibility = dependencies.eligibilityLookup || getTrialCampaignEligibilityForUser;
  const session = await db.startSession();
  if (typeof session.withTransaction !== "function") {
    await session.endSession?.();
    return failure(503, "TRANSACTIONS_REQUIRED", "Trial claims require a MongoDB deployment that supports multi-document transactions.");
  }

  let outcome = null;
  let transactionError = null;
  try {
    await session.withTransaction(async () => {
      outcome = null;
      const existingKey = await readQuery(Claim.findOne({ user: userId, idempotencyKey: key }), session);
      const replay = replayOrConflict(existingKey, campaignId, key);
      if (replay) { outcome = replay; return; }

      const existingCampaignClaim = await readQuery(Claim.findOne({ campaign: campaignId, user: userId }), session);
      if (existingCampaignClaim) {
        outcome = failure(409, "CAMPAIGN_ALREADY_CLAIMED", "This learner has already claimed this trial campaign.");
        return;
      }
      const existingLiveClaim = await readQuery(
        Claim.findOne({ user: userId, activeClaimKey: String(userId) }),
        session
      );
      if (existingLiveClaim) {
        outcome = failure(409, "TRIAL_CLAIM_IN_PROGRESS", "This learner already has a reserved or active self-serve trial. It must finish or expire before another campaign can be claimed.");
        return;
      }

      const campaign = await readQuery(Campaign.findById(campaignId), session);
      if (!campaign) {
        outcome = failure(404, "TRIAL_CAMPAIGN_NOT_FOUND", "The trial campaign could not be found.");
        return;
      }

      const eligibilityCampaign = {
        ...campaign,
        eligibility: { ...(campaign.eligibility || {}), requireNoActiveSubscription: true }
      };
      const eligibility = await lookupEligibility({
        campaign: eligibilityCampaign,
        userId,
        now,
        hasExistingCampaignClaim: false
      }, {
        UserModel: dependencies.UserModel || User,
        UserSubscriptionModel: Subscription,
        TrialGrantModel: Grants,
        session
      });
      if (!eligibility?.eligible) {
        outcome = eligibilityFailure(eligibility);
        return;
      }

      const activeTrial = await readQuery(Grants.exists({
        user: userId,
        status: "trialing",
        endsAt: { $gt: now }
      }), session, false);
      if (activeTrial) {
        outcome = failure(403, "ACTIVE_SUBSCRIPTION", TRIAL_CAMPAIGN_ELIGIBILITY_REASONS.ACTIVE_SUBSCRIPTION);
        return;
      }

      const currentSubscriptionQuery = Subscription.findOne({ user: userId })
        .populate("plan", "slug price");
      const currentSubscription = await readQuery(currentSubscriptionQuery, session);
      if (isTrialCampaignSubscriptionActive(currentSubscription, now)) {
        outcome = failure(403, "ACTIVE_SUBSCRIPTION", TRIAL_CAMPAIGN_ELIGIBILITY_REASONS.ACTIVE_SUBSCRIPTION);
        return;
      }
      if (currentSubscription
        && !isFreePlan(currentSubscription.plan)
        && !["cancelled", "expired"].includes(currentSubscription.status)
        && !(
          currentSubscription.currentPeriodEnd
          && Number.isFinite(new Date(currentSubscription.currentPeriodEnd).getTime())
          && new Date(currentSubscription.currentPeriodEnd).getTime() <= now.getTime()
        )) {
        outcome = failure(403, "ACTIVE_SUBSCRIPTION", TRIAL_CAMPAIGN_ELIGIBILITY_REASONS.ACTIVE_SUBSCRIPTION);
        return;
      }

      const usablePlan = await readQuery(Plan.findOne({
        _id: campaign.trialPlan,
        isActive: true
      }).select("_id"), session);
      if (!usablePlan) {
        outcome = failure(409, "TRIAL_PLAN_INACTIVE", TRIAL_CAMPAIGN_ELIGIBILITY_REASONS.TRIAL_PLAN_INACTIVE);
        return;
      }

      const reservedCampaign = await readQuery(Campaign.findOneAndUpdate({
        _id: campaignId,
        status: "published",
        startsAt: { $lte: now },
        $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
        $expr: { $lt: ["$claimedCount", "$maxClaims"] }
      }, { $inc: { claimedCount: 1 } }, {
        new: true,
        session,
        runValidators: true
      }), session);
      if (!reservedCampaign) {
        outcome = failure(409, "CAMPAIGN_CAPACITY_OR_WINDOW_CHANGED", "The campaign is no longer claimable or its remaining capacity was taken. Refresh the available offers.");
        return;
      }

      const [claim] = await Claim.create([{
        campaign: campaignId,
        user: userId,
        activeClaimKey: String(userId),
        idempotencyKey: key,
        status: "reserved",
        claimedAt: now,
        trialPlan: campaign.trialPlan?._id || campaign.trialPlan,
        trialDays: campaign.trialDays,
        conversionMode: campaign.conversionMode || "none",
        conversionPlan: campaign.conversionPlan?._id || campaign.conversionPlan || null
      }], { session });

      const endsAt = new Date(now.getTime() + campaign.trialDays * 24 * 60 * 60 * 1000);
      const internalName = String(campaign.internalName || "Self-serve trial").trim();
      const grantCampaignName = (internalName.slice(0, 80) + " [" + String(campaign._id) + "]").slice(0, 120);
      const [grant] = await Grants.create([{
        user: userId,
        plan: campaign.trialPlan?._id || campaign.trialPlan,
        campaignName: grantCampaignName,
        reason: String(campaign.internalReason || "Learner claimed a published trial campaign.").slice(0, 500),
        source: "campaign",
        grantedBy: null,
        campaign: campaign._id,
        campaignClaim: claim._id,
        claimedBy: userId,
        startsAt: now,
        endsAt,
        status: "trialing",
        conversionPlan: campaign.conversionPlan?._id || campaign.conversionPlan || null,
        conversionConsentStatus: campaign.conversionMode === "consent_required" ? "pending_user_consent" : "not_requested",
        idempotencyKey: "campaign-claim:" + String(claim._id)
      }], { session });

      const subscriptionValues = {
        plan: campaign.trialPlan?._id || campaign.trialPlan,
        status: "trialing",
        provider: "manual",
        providerSubscriptionId: "",
        trialGrant: grant._id,
        trialCampaign: campaign._id,
        currentPeriodStart: now,
        currentPeriodEnd: endsAt,
        cancelAtPeriodEnd: false,
        cancelledAt: null
      };

      let subscription;
      if (currentSubscription) {
        const previousPlanId = currentSubscription.plan?._id || currentSubscription.plan;
        const replaceFilter = {
          _id: currentSubscription._id,
          user: userId,
          plan: previousPlanId,
          status: currentSubscription.status,
          currentPeriodEnd: currentSubscription.currentPeriodEnd ?? null
        };
        subscription = await readQuery(Subscription.findOneAndUpdate(
          replaceFilter,
          { $set: subscriptionValues },
          { new: true, session, runValidators: true }
        ), session);
        if (!subscription) {
          throw operationalError("SUBSCRIPTION_CHANGED", "Subscription changed during trial activation.");
        }
      } else {
        const [createdSubscription] = await Subscription.create([{
          user: userId,
          ...subscriptionValues
        }], { session });
        subscription = createdSubscription;
      }

      const activatedClaim = await readQuery(Claim.findOneAndUpdate({
        _id: claim._id,
        user: userId,
        status: "reserved"
      }, {
        $set: {
          status: "active",
          trialGrant: grant._id,
          userSubscription: subscription._id,
          activatedAt: now,
          trialEndsAt: endsAt
        }
      }, {
        new: true,
        session,
        runValidators: true
      }), session);
      if (!activatedClaim) {
        throw operationalError("CLAIM_ACTIVATION_FAILED", "The claim could not be marked active.");
      }

      outcome = { ok: true, replayed: false, claim: publicClaim(activatedClaim) };
    });
  } catch (error) {
    transactionError = error;
  } finally {
    await session.endSession?.();
  }

  if (transactionError) {
    if (transactionError.code === "SUBSCRIPTION_CHANGED") {
      return failure(409, "SUBSCRIPTION_CHANGED", "Your subscription changed while this trial was being activated. Refresh your account and try again.");
    }
    if (transactionError.code === "CLAIM_ACTIVATION_FAILED") {
      return failure(409, "CLAIM_ACTIVATION_FAILED", "The trial could not be activated. No subscription or campaign capacity change was committed.");
    }
    if (transactionError.code === 11000 || transactionError.codeName === "DuplicateKey") {
      const [sameKey, sameCampaign, liveClaim, latestSubscription] = await Promise.all([
        readQuery(Claim.findOne({ user: userId, idempotencyKey: key }), null),
        readQuery(Claim.findOne({ campaign: campaignId, user: userId }), null),
        readQuery(Claim.findOne({ user: userId, activeClaimKey: String(userId) }), null),
        readQuery(Subscription.findOne({ user: userId }).populate("plan", "slug price"), null)
      ]);
      const duplicateOutcome = replayOrConflict(sameKey, campaignId, key)
        || (sameCampaign ? failure(409, "CAMPAIGN_ALREADY_CLAIMED", "This learner has already claimed this trial campaign.") : null)
        || (liveClaim ? failure(409, "TRIAL_CLAIM_IN_PROGRESS", "This learner already has a reserved or active self-serve trial.") : null)
        || (isTrialCampaignSubscriptionActive(latestSubscription, now)
          ? failure(403, "ACTIVE_SUBSCRIPTION", TRIAL_CAMPAIGN_ELIGIBILITY_REASONS.ACTIVE_SUBSCRIPTION)
          : null);
      if (duplicateOutcome) return duplicateOutcome;
      return failure(409, "TRIAL_CLAIM_CONFLICT", "A concurrent trial claim conflicted with this request. Refresh the offer and try again.");
    }
    throw transactionError;
  }

  return outcome || failure(503, "TRIAL_CLAIM_NOT_COMMITTED", "The trial claim could not be committed. Retry with the same idempotency key.");
}

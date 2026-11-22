import { TrialCampaign } from "../models/TrialCampaign.js";
import { TrialCampaignClaim } from "../models/TrialCampaignClaim.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { User } from "../models/User.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { evaluateTrialCampaignEligibility } from "./trialCampaignEligibility.service.js";
import { getDefaultFreePlan } from "./defaultFreePlan.service.js";

const OFFER_CANDIDATE_LIMIT = 50;

const NO_OFFER_REASONS = Object.freeze({
  NO_AVAILABLE_CAMPAIGN: "No trial offer is currently available.",
  TRIAL_CLAIM_IN_PROGRESS: "An existing trial claim must finish or expire before another offer can be claimed.",
  ACTIVE_SUBSCRIPTION: "An active subscription or trial already exists for this account.",
  LEARNER_NOT_FOUND: "The learner account could not be found.",
  NOT_A_LEARNER_ACCOUNT: "Only learner accounts can receive trial offers."
});

function noOffer(code, message = NO_OFFER_REASONS[code]) {
  return {
    available: false,
    offer: null,
    eligibility: {
      eligible: false,
      reasonCodes: [code],
      reasons: [{ code, message: message || "No eligible trial offer is currently available." }]
    }
  };
}

function plainLimits(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === "function") return plainLimits(value.toObject());
  if (typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, amount]) =>
      /^[A-Za-z0-9_.-]{1,80}$/.test(key) && Number.isFinite(Number(amount))
    )
  );
}

function publicTrialPlan(plan) {
  if (!plan || plan.isActive !== true) return null;
  return {
    id: String(plan._id),
    name: String(plan.name || "Trial plan"),
    description: String(plan.description || ""),
    features: Array.isArray(plan.features) ? plan.features.filter((item) => typeof item === "string") : [],
    limits: plainLimits(plan.limits)
  };
}

function publicConversionPlan(plan) {
  if (!plan || plan.isActive !== true) return null;
  return {
    id: String(plan._id),
    name: String(plan.name || "Paid plan"),
    description: String(plan.description || ""),
    price: Number(plan.price),
    currency: String(plan.currency || "INR"),
    billingInterval: String(plan.billingInterval || "monthly"),
    features: Array.isArray(plan.features) ? plan.features.filter((item) => typeof item === "string") : [],
    limits: plainLimits(plan.limits)
  };
}

function toPublicOffer(campaign) {
  const conversionRequired = campaign.conversionMode === "consent_required";
  return {
    campaignId: String(campaign._id),
    title: String(campaign.offerTitle),
    description: String(campaign.offerDescription),
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt || null,
    durationDays: Number(campaign.trialDays),
    trialPlan: publicTrialPlan(campaign.trialPlan),
    conversion: conversionRequired ? {
      requiresSeparateConsent: true,
      plan: publicConversionPlan(campaign.conversionPlan)
    } : null,
    payment: {
      paymentMethodRequired: false,
      paymentOrderCreated: false,
      autopayAuthorized: false
    }
  };
}

/**
 * Return one currently published campaign only when the authenticated learner
 * is eligible according to fresh database facts. This endpoint is read-only:
 * it never reserves capacity or creates a claim/entitlement. The claim service
 * must recheck every condition atomically when the learner accepts the offer.
 */
export async function getLearnerTrialOffer({
  userId,
  now = new Date()
} = {}, dependencies = {}) {
  if (!userId) return noOffer("LEARNER_NOT_FOUND");

  const Campaign = dependencies.TrialCampaignModel || TrialCampaign;
  const Claim = dependencies.TrialCampaignClaimModel || TrialCampaignClaim;
  const Grants = dependencies.TrialGrantModel || TrialGrant;
  const UserModel = dependencies.UserModel || User;
  const SubscriptionModel = dependencies.UserSubscriptionModel || UserSubscription;
  await getDefaultFreePlan();

  const candidates = await Campaign.find({
    status: "published",
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    $expr: { $lt: ["$claimedCount", "$maxClaims"] }
  })
    .sort({ publishedAt: -1, createdAt: -1, _id: 1 })
    .limit(OFFER_CANDIDATE_LIMIT)
    .populate("trialPlan", "name slug description price currency billingInterval features limits isActive")
    .populate("conversionPlan", "name slug description price currency billingInterval features limits isActive")
    .lean();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return noOffer("NO_AVAILABLE_CAMPAIGN");
  }

  const campaignIds = candidates.map((campaign) => campaign._id);
  const [learner, subscription, previousTrial, claimedCampaigns, liveClaim, activeTrial] = await Promise.all([
    UserModel.findById(userId).select("role isActive emailVerified").lean(),
    SubscriptionModel.findOne({ user: userId })
      .select("status currentPeriodEnd plan")
      .populate("plan", "slug price isDefaultFree")
      .lean(),
    Grants.exists({ user: userId }),
    Claim.find({ user: userId, campaign: { $in: campaignIds } }).select("campaign").lean(),
    Claim.exists({ user: userId, activeClaimKey: String(userId) }),
    Grants.exists({ user: userId, status: "trialing", endsAt: { $gt: now } })
  ]);

  if (!learner) return noOffer("LEARNER_NOT_FOUND");
  if (learner.role !== "user") return noOffer("NOT_A_LEARNER_ACCOUNT");
  if (liveClaim) return noOffer("TRIAL_CLAIM_IN_PROGRESS");
  if (activeTrial) return noOffer("ACTIVE_SUBSCRIPTION");

  const claimedCampaignIds = new Set(
    (Array.isArray(claimedCampaigns) ? claimedCampaigns : [])
      .map((claim) => String(claim.campaign?._id || claim.campaign))
  );

  let firstIneligibleResult = null;
  for (const campaign of candidates) {
    const trialPlanIsActive = campaign.trialPlan?.isActive === true;
    const eligibilityCampaign = {
      ...campaign,
      trialPlan: trialPlanIsActive ? campaign.trialPlan : { isActive: false },
      // Active paid subscriptions and trials are a global product invariant,
      // even if a campaign's configurable audience flag was relaxed.
      eligibility: {
        ...(campaign.eligibility || {}),
        requireNoActiveSubscription: true
      }
    };

    const eligibility = evaluateTrialCampaignEligibility({
      campaign: eligibilityCampaign,
      learner,
      activeSubscription: subscription,
      hasPreviousTrial: Boolean(previousTrial),
      hasExistingCampaignClaim: claimedCampaignIds.has(String(campaign._id)),
      now
    });

    if (eligibility.eligible) {
      const trialPlan = publicTrialPlan(campaign.trialPlan);
      // A populated, active plan is required before an offer can be shown.
      if (!trialPlan) {
        firstIneligibleResult ||= {
          eligible: false,
          reasonCodes: ["TRIAL_PLAN_INACTIVE"],
          reasons: [{ code: "TRIAL_PLAN_INACTIVE", message: "The trial entitlement plan is no longer active." }]
        };
        continue;
      }

      return {
        available: true,
        offer: toPublicOffer(campaign),
        eligibility: {
          eligible: true,
          reasonCodes: [],
          reasons: []
        }
      };
    }

    firstIneligibleResult ||= eligibility;
  }

  if (firstIneligibleResult) {
    return {
      available: false,
      offer: null,
      eligibility: firstIneligibleResult
    };
  }
  return noOffer("NO_AVAILABLE_CAMPAIGN");
}

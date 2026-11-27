import { User } from "../models/User.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { getDefaultFreePlan } from "./defaultFreePlan.service.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due"]);

export const TRIAL_CAMPAIGN_ELIGIBILITY_REASONS = Object.freeze({
  CAMPAIGN_UNAVAILABLE: "The trial campaign is unavailable.",
  CAMPAIGN_NOT_PUBLISHED: "The trial campaign is not published.",
  CAMPAIGN_NOT_STARTED: "The trial campaign has not started yet.",
  CAMPAIGN_ENDED: "The trial campaign has ended.",
  CAMPAIGN_CLAIM_LIMIT_REACHED: "The trial campaign has reached its claim limit.",
  CAMPAIGN_CONFIGURATION_INVALID: "The trial campaign configuration is incomplete or invalid.",
  TRIAL_PLAN_INACTIVE: "The trial entitlement plan is no longer active.",
  LEARNER_NOT_FOUND: "The learner account could not be found.",
  NOT_A_LEARNER_ACCOUNT: "Only learner accounts can claim a trial.",
  ACCOUNT_INACTIVE: "The learner account is not active.",
  EMAIL_NOT_VERIFIED: "The learner email address is not verified.",
  ACTIVE_SUBSCRIPTION: "The learner already has an active subscription or trial.",
  PREVIOUS_TRIAL: "The learner has already received a trial.",
  CAMPAIGN_ALREADY_CLAIMED: "The learner has already claimed this campaign.",
  ELIGIBILITY_CONTEXT_UNAVAILABLE: "Eligibility could not be verified. Refresh the learner state and try again."
});

const REASON_ORDER = Object.freeze(Object.keys(TRIAL_CAMPAIGN_ELIGIBILITY_REASONS));

function asDate(value) {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function resolveNow(value) {
  const parsed = asDate(value);
  return parsed || new Date();
}

/**
 * A subscription is current only when its status is entitlement-bearing and
 * its billing period has not ended. A malformed period fails closed so a bad
 * timestamp cannot accidentally make an active paid/trial entitlement eligible.
 */
function isFreePlan(plan) {
  if (!plan || typeof plan !== "object") return false;
  return plan.isDefaultFree === true;
}

export function isTrialCampaignSubscriptionActive(subscription, now = new Date()) {
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) return false;
  if (subscription.status !== "trialing" && isFreePlan(subscription.plan)) return false;
  if (subscription.currentPeriodEnd == null || subscription.currentPeriodEnd === "") return true;
  const end = asDate(subscription.currentPeriodEnd);
  if (!end) return true;
  return end.getTime() > resolveNow(now).getTime();
}

function addReason(reasons, code) {
  if (!reasons.some((reason) => reason.code === code)) {
    reasons.push({ code, message: TRIAL_CAMPAIGN_ELIGIBILITY_REASONS[code] });
  }
}

function campaignReasons(campaign, now, requirePublished) {
  const reasons = [];
  if (!campaign) {
    addReason(reasons, "CAMPAIGN_UNAVAILABLE");
    return reasons;
  }

  const startsAt = asDate(campaign.startsAt);
  const endsAt = campaign.endsAt == null ? null : asDate(campaign.endsAt);
  const maxClaims = Number(campaign.maxClaims);
  const claimedCount = Number(campaign.claimedCount);

  if (!startsAt || (campaign.endsAt != null && !endsAt)
    || !Number.isInteger(maxClaims) || maxClaims < 1
    || !Number.isInteger(claimedCount) || claimedCount < 0
    || (endsAt && endsAt.getTime() <= startsAt.getTime())) {
    addReason(reasons, "CAMPAIGN_CONFIGURATION_INVALID");
    return reasons;
  }

  if (campaign.status === "ended") addReason(reasons, "CAMPAIGN_ENDED");
  else if (requirePublished && campaign.status !== "published") addReason(reasons, "CAMPAIGN_NOT_PUBLISHED");

  const nowTime = resolveNow(now).getTime();
  if (nowTime < startsAt.getTime()) addReason(reasons, "CAMPAIGN_NOT_STARTED");
  if (endsAt && nowTime >= endsAt.getTime()) addReason(reasons, "CAMPAIGN_ENDED");
  if (claimedCount >= maxClaims) addReason(reasons, "CAMPAIGN_CLAIM_LIMIT_REACHED");

  if (campaign.trialPlan && typeof campaign.trialPlan === "object" && campaign.trialPlan.isActive === false) {
    addReason(reasons, "TRIAL_PLAN_INACTIVE");
  }
  return reasons;
}

/**
 * Pure, deterministic rule evaluation. The caller supplies freshly loaded
 * learner facts; browser-provided flags must never be used as those facts.
 *
 * hasPreviousTrial refers to durable administrator grant history. The separate
 * campaign claim ledger is introduced in Task 14 and is supplied independently
 * as hasExistingCampaignClaim when available.
 */
export function evaluateTrialCampaignEligibility({
  campaign,
  learner,
  activeSubscription,
  hasPreviousTrial,
  hasExistingCampaignClaim = false,
  now = new Date(),
  requirePublished = true
} = {}) {
  const reasons = campaignReasons(campaign, now, requirePublished);

  if (!learner) {
    addReason(reasons, "LEARNER_NOT_FOUND");
  } else {
    if (learner.role !== "user") addReason(reasons, "NOT_A_LEARNER_ACCOUNT");

    const rules = campaign?.eligibility || {};
    const requireActiveAccount = rules.requireActiveAccount !== false;
    const requireVerifiedEmail = rules.requireVerifiedEmail !== false;
    const requireNoActiveSubscription = rules.requireNoActiveSubscription !== false;
    const requireNoPreviousTrial = rules.requireNoPreviousTrial !== false;

    if (requireActiveAccount && learner.isActive !== true) {
      addReason(reasons, "ACCOUNT_INACTIVE");
    }
    if (requireVerifiedEmail && learner.emailVerified !== true) {
      addReason(reasons, "EMAIL_NOT_VERIFIED");
    }

    if (requireNoActiveSubscription) {
      if (activeSubscription === undefined) {
        addReason(reasons, "ELIGIBILITY_CONTEXT_UNAVAILABLE");
      } else if (isTrialCampaignSubscriptionActive(activeSubscription, now)) {
        addReason(reasons, "ACTIVE_SUBSCRIPTION");
      }
    }

    if (requireNoPreviousTrial) {
      if (typeof hasPreviousTrial !== "boolean") {
        addReason(reasons, "ELIGIBILITY_CONTEXT_UNAVAILABLE");
      } else if (hasPreviousTrial) {
        addReason(reasons, "PREVIOUS_TRIAL");
      }
    }

    if (hasExistingCampaignClaim === true) {
      addReason(reasons, "CAMPAIGN_ALREADY_CLAIMED");
    }
  }

  const rank = new Map(REASON_ORDER.map((code, index) => [code, index]));
  reasons.sort((left, right) => (rank.get(left.code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.code) ?? Number.MAX_SAFE_INTEGER));

  return {
    eligible: reasons.length === 0,
    reasonCodes: reasons.map((reason) => reason.code),
    reasons
  };
}

/**
 * Evaluate a batch in input order and return stable, learner-readable skipped
 * reasons plus reason-code counts for admin previews and operational reporting.
 */
export function evaluateTrialCampaignAudience({
  campaign,
  learners = [],
  factsByLearnerId,
  now = new Date(),
  requirePublished = true
} = {}) {
  const eligible = [];
  const skipped = [];
  const skippedReasonCounts = Object.fromEntries(REASON_ORDER.map((code) => [code, 0]));

  const getFacts = (id) => {
    if (factsByLearnerId instanceof Map) return factsByLearnerId.get(id);
    return factsByLearnerId && typeof factsByLearnerId === "object" ? factsByLearnerId[id] : undefined;
  };

  for (const learner of learners) {
    const id = String(learner?._id || learner?.id || "");
    const facts = getFacts(id);
    const result = evaluateTrialCampaignEligibility({
      campaign,
      learner,
      activeSubscription: facts?.activeSubscription,
      hasPreviousTrial: facts?.hasPreviousTrial,
      hasExistingCampaignClaim: facts?.hasExistingCampaignClaim === true,
      now,
      requirePublished
    });

    if (result.eligible) {
      eligible.push({ learner, reasonCodes: [] });
    } else {
      for (const code of result.reasonCodes) skippedReasonCounts[code] += 1;
      skipped.push({
        learner,
        reasonCodes: result.reasonCodes,
        reasons: result.reasons,
        reason: result.reasons.map((item) => item.message).join(" ")
      });
    }
  }

  return {
    eligible,
    skipped,
    eligibleCount: eligible.length,
    skippedCount: skipped.length,
    skippedReasonCounts
  };
}

/**
 * Load authoritative learner facts from persistence, then run the pure engine.
 * This is deliberately a read-only operation; claim-time writes and concurrency
 * control are handled by Task 14.
 */
export async function getTrialCampaignEligibilityForUser({ campaign, userId, now = new Date(), hasExistingCampaignClaim = false } = {}, dependencies = {}) {
  if (!userId) {
    return evaluateTrialCampaignEligibility({
      campaign,
      learner: null,
      now
    });
  }

  const UserModel = dependencies.UserModel || User;
  const UserSubscriptionModel = dependencies.UserSubscriptionModel || UserSubscription;
  const TrialGrantModel = dependencies.TrialGrantModel || TrialGrant;
  const PlanModel = dependencies.SubscriptionPlanModel || SubscriptionPlan;
  if ((dependencies.SubscriptionPlanModel || !dependencies.UserSubscriptionModel)
    && typeof PlanModel.updateMany === "function") {
    await getDefaultFreePlan({ PlanModel, session: dependencies.session });
  }

  const learnerQuery = UserModel.findById(userId).select("role isActive emailVerified");
  const subscriptionQuery = UserSubscriptionModel.findOne({ user: userId })
    .select("status currentPeriodEnd plan provider")
    .populate("plan", "slug price isDefaultFree");
  const previousTrialQuery = TrialGrantModel.exists({ user: userId });
  if (dependencies.session) {
    learnerQuery.session(dependencies.session);
    subscriptionQuery.session(dependencies.session);
    previousTrialQuery.session(dependencies.session);
  }
  const [learner, subscription, previousTrial] = await Promise.all([
    learnerQuery.lean(),
    subscriptionQuery.lean(),
    previousTrialQuery
  ]);

  return evaluateTrialCampaignEligibility({
    campaign,
    learner,
    activeSubscription: subscription,
    hasPreviousTrial: Boolean(previousTrial),
    hasExistingCampaignClaim,
    now
  });
}

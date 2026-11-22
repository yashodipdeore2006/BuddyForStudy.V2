import mongoose from "mongoose";
import { TrialGrant } from "../models/TrialGrant.js";
import { TrialCampaignClaim } from "../models/TrialCampaignClaim.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { getDefaultFreePlan } from "./defaultFreePlan.service.js";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 250;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function resolveQuery(query, session, lean = true) {
  let pending = query;
  if (session && pending && typeof pending.session === "function") pending = pending.session(session);
  if (lean && pending && typeof pending.lean === "function") pending = pending.lean();
  return pending;
}

/**
 * Apply a terminal trial state and entitlement changes in one transaction.
 * Only the manual subscription linked to this exact grant can be replaced.
 */
async function transitionTrialGrant({ grantId, targetStatus, now, onlyIfExpired }, dependencies = {}) {
  const db = dependencies.mongoose || mongoose;
  const Grant = dependencies.TrialGrantModel || TrialGrant;
  const Claim = dependencies.TrialCampaignClaimModel || TrialCampaignClaim;
  const Subscription = dependencies.UserSubscriptionModel || UserSubscription;
  const Plan = dependencies.SubscriptionPlanModel || SubscriptionPlan;
  const session = await db.startSession();

  if (!session || typeof session.withTransaction !== "function") {
    await session?.endSession?.();
    throw Object.assign(
      new Error("Trial lifecycle transitions require MongoDB multi-document transaction support."),
      { code: "TRIAL_LIFECYCLE_TRANSACTIONS_REQUIRED" }
    );
  }

  let outcome = null;
  try {
    await session.withTransaction(async () => {
      outcome = null;
      const grantFilter = {
        _id: grantId,
        status: "trialing",
        ...(onlyIfExpired ? { endsAt: { $lte: now } } : { endsAt: { $gt: now } })
      };
      const grant = await resolveQuery(Grant.findOne(grantFilter), session);
      if (!grant) {
        const current = await resolveQuery(Grant.findById(grantId), session);
        outcome = current
          ? failure(409, "TRIAL_NOT_ACTIVE", "Only a currently active trial can be transitioned.")
          : failure(404, "TRIAL_GRANT_NOT_FOUND", "The trial grant could not be found.");
        return;
      }

      const grantUpdate = {
        status: targetStatus,
        ...(grant.conversionConsentStatus === "pending_user_consent"
          ? { conversionConsentStatus: "cancelled" }
          : {})
      };
      const updatedGrant = await resolveQuery(Grant.findOneAndUpdate(
        grantFilter,
        { $set: grantUpdate },
        { new: false, session, runValidators: true }
      ), session);
      if (!updatedGrant) {
        outcome = failure(409, "TRIAL_STATE_CHANGED", "The trial changed while this transition was being applied. Refresh and retry.");
        return;
      }

      const linkedSubscription = await resolveQuery(Subscription.findOne({
        user: grant.user,
        trialGrant: grant._id,
        status: "trialing",
        plan: grant.plan,
        provider: "manual",
        providerSubscriptionId: { $in: ["", null] }
      }), session);

      // Legacy administrator grants did not persist trialGrant on the
      // subscription. Recover only exact manual trial rows with matching plan
      // and end time; never replace a paid/provider subscription.
      const legacyAdminSubscription = !linkedSubscription && grant.source !== "campaign"
        ? await resolveQuery(Subscription.findOne({
            user: grant.user,
            trialGrant: null,
            plan: grant.plan,
            status: "trialing",
            provider: "manual",
            providerSubscriptionId: { $in: ["", null] },
            currentPeriodEnd: grant.endsAt
          }), session)
        : null;
      const trialSubscription = linkedSubscription || legacyAdminSubscription;

      const freePlan = await getDefaultFreePlan({ PlanModel: Plan, session });

      let subscriptionUpdated = false;
      if (trialSubscription) {
        const subscriptionFilter = {
          _id: trialSubscription._id,
          user: grant.user,
          plan: grant.plan,
          status: "trialing",
          provider: "manual",
          providerSubscriptionId: { $in: ["", null] },
          currentPeriodEnd: trialSubscription.currentPeriodEnd
        };
        subscriptionFilter.trialGrant = linkedSubscription ? grant._id : null;

        const subscriptionValues = {
          status: freePlan ? "active" : "expired",
          ...(freePlan ? { plan: freePlan._id } : {}),
          provider: "manual",
          providerSubscriptionId: "",
          trialGrant: null,
          trialCampaign: null,
          currentPeriodStart: now,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null
        };
        const restored = await resolveQuery(Subscription.findOneAndUpdate(
          subscriptionFilter,
          { $set: subscriptionValues },
          { new: true, session, runValidators: true }
        ), session);
        subscriptionUpdated = Boolean(restored);
      } else {
        // If the trial subscription row was deleted, recreate free access only
        // when no newer subscription exists for the learner.
        const currentSubscription = await resolveQuery(Subscription.findOne({ user: grant.user }), session);
        if (!currentSubscription && freePlan) {
          await Subscription.create([{
            user: grant.user,
            plan: freePlan._id,
            status: "active",
            provider: "manual",
            providerSubscriptionId: "",
            trialGrant: null,
            trialCampaign: null,
            currentPeriodStart: now,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null
          }], { session });
          subscriptionUpdated = true;
        }
      }

      let claimUpdated = false;
      if (grant.campaignClaim) {
        const claim = await resolveQuery(Claim.findOneAndUpdate(
          {
            _id: grant.campaignClaim,
            user: grant.user,
            trialGrant: grant._id,
            status: "active",
            activeClaimKey: String(grant.user)
          },
          {
            $set: {
              status: targetStatus === "expired" ? "expired" : "revoked",
              failureCode: targetStatus === "expired" ? "TRIAL_EXPIRED" : "TRIAL_REVOKED"
            },
            $unset: { activeClaimKey: "" }
          },
          { new: true, session, runValidators: true }
        ), session);
        claimUpdated = Boolean(claim);
      }

      outcome = {
        ok: true,
        transitioned: true,
        targetStatus,
        grant: {
          id: String(grant._id),
          userId: String(grant.user),
          planId: String(grant.plan),
          campaignClaimId: grant.campaignClaim ? String(grant.campaignClaim) : null,
          previousEndsAt: grant.endsAt
        },
        subscriptionUpdated,
        fallbackPlanId: freePlan ? String(freePlan._id) : null,
        fallbackAvailable: Boolean(freePlan),
        claimUpdated
      };
    });
  } finally {
    await session.endSession?.();
  }

  return outcome || failure(503, "TRIAL_TRANSITION_NOT_COMMITTED", "The trial lifecycle transition could not be committed.");
}

export async function revokeTrialGrant({ grantId, reason, now = new Date() } = {}, dependencies = {}) {
  const id = String(grantId || "").trim();
  const normalizedReason = String(reason || "").trim();
  if (!id) return failure(400, "TRIAL_GRANT_ID_REQUIRED", "A trial grant ID is required.");
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    return failure(400, "INVALID_REVOCATION_REASON", "Enter a revocation reason between 10 and 500 characters.");
  }

  const result = await transitionTrialGrant({
    grantId: id,
    targetStatus: "revoked",
    now,
    onlyIfExpired: false
  }, dependencies);
  if (result.ok) result.reason = normalizedReason;
  return result;
}

export async function processExpiredTrialGrants({
  now = new Date(),
  maxItems = DEFAULT_BATCH_SIZE,
  userId,
  shouldContinue = async () => true
} = {}, dependencies = {}) {
  const Grant = dependencies.TrialGrantModel || TrialGrant;
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(Number(maxItems) || DEFAULT_BATCH_SIZE)));
  const filter = { status: "trialing", endsAt: { $lte: now } };
  if (userId) filter.user = userId;

  const dueGrants = await Grant.find(filter)
    .sort({ endsAt: 1, _id: 1 })
    .limit(batchSize)
    .select("_id")
    .lean();

  let expiredCount = 0;
  let subscriptionsRestored = 0;
  let claimsReleased = 0;
  let fallbackUnavailable = 0;
  let skipped = 0;
  for (const item of dueGrants || []) {
    if (await shouldContinue() === false) break;
    const result = await transitionTrialGrant({
      grantId: item._id,
      targetStatus: "expired",
      now,
      onlyIfExpired: true
    }, dependencies);
    if (result.ok && result.transitioned) {
      expiredCount += 1;
      if (result.subscriptionUpdated) subscriptionsRestored += 1;
      if (result.claimUpdated) claimsReleased += 1;
      if (!result.fallbackAvailable) fallbackUnavailable += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    scanned: Array.isArray(dueGrants) ? dueGrants.length : 0,
    expiredCount,
    subscriptionsRestored,
    claimsReleased,
    fallbackUnavailable,
    skipped
  };
}

export async function expireUserTrialIfDue(userId, options = {}, dependencies = {}) {
  if (!userId) return { scanned: 0, expiredCount: 0, skipped: 0 };
  return processExpiredTrialGrants({
    ...options,
    userId,
    maxItems: Math.min(10, Number(options.maxItems) || 10)
  }, dependencies);
}

import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { getDefaultFreePlan } from "./defaultFreePlan.service.js";

function idOf(value) {
  const id = value && typeof value === "object" ? (value._id ?? value.id) : value;
  return id == null ? "" : String(id);
}

function isFreePlanCandidate(plan) {
  return Boolean(plan) && (
    plan.isDefaultFree === true ||
    plan.slug === "free" ||
    Number(plan.price) === 0
  );
}

/**
 * Only an active, manual, non-trial, non-expiring zero-price assignment can be
 * migrated to the canonical Free plan. Provider-backed, trialing, cancelled,
 * expired, and otherwise time-bounded subscriptions must remain untouched.
 */
function canMigrateLegacyFreeSubscription(subscription) {
  return subscription?.status === "active" &&
    subscription?.provider === "manual" &&
    !String(subscription?.providerSubscriptionId || "").trim() &&
    !subscription?.trialGrant &&
    !subscription?.trialCampaign &&
    !subscription?.currentPeriodEnd &&
    subscription?.cancelAtPeriodEnd !== true &&
    isFreePlanCandidate(subscription?.plan);
}

/**
 * Return the user's stored subscription or create the canonical Free
 * assignment once. A unique-user race is recovered by reading the winner.
 * This path never calls a payment provider and is unaffected by
 * PAYMENTS_ENABLED.
 */
export async function getOrCreateFreePlanSubscription(userId, dependencies = {}) {
  const SubscriptionPlanModel = dependencies.SubscriptionPlan || SubscriptionPlan;
  const UserSubscriptionModel = dependencies.UserSubscription || UserSubscription;
  const now = typeof dependencies.now === "function" ? dependencies.now() : new Date();

  const findForUser = () => UserSubscriptionModel.findOne({ user: userId }).populate("plan").lean();
  const existing = await findForUser();

  if (existing) {
    if (!canMigrateLegacyFreeSubscription(existing) ||
        typeof UserSubscriptionModel.findOneAndUpdate !== "function") {
      return existing;
    }

    const freePlan = await getDefaultFreePlan({ PlanModel: SubscriptionPlanModel });
    if (!freePlan) return existing;

    const currentPlanId = idOf(existing.plan);
    const canonicalPlanId = idOf(freePlan);
    if (!currentPlanId || !canonicalPlanId || currentPlanId === canonicalPlanId) return existing;

    // Compare-and-set the exact legacy assignment. A concurrent paid/trial
    // transition wins; on a miss, read and return the newer subscription.
    const migratedQuery = UserSubscriptionModel.findOneAndUpdate(
      {
        _id: existing._id,
        user: userId,
        plan: existing.plan?._id ?? existing.plan,
        status: "active",
        provider: "manual",
        providerSubscriptionId: { $in: ["", null] },
        trialGrant: null,
        trialCampaign: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: { $ne: true }
      },
      { $set: { plan: freePlan._id } },
      { new: true, runValidators: true }
    );
    const migrated = await migratedQuery.populate("plan").lean();
    return migrated || findForUser();
  }

  const freePlan = await getDefaultFreePlan({ PlanModel: SubscriptionPlanModel });
  if (!freePlan) return null;

  try {
    const created = await UserSubscriptionModel.create({
      user: userId,
      plan: freePlan._id,
      status: "active",
      provider: "manual",
      currentPeriodStart: now,
      currentPeriodEnd: null
    });
    const record = typeof created?.toObject === "function" ? created.toObject() : created;
    return { ...record, plan: freePlan };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // A concurrent request created the unique user subscription first.
    return findForUser();
  }
}

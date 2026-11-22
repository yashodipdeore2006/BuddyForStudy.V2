import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { getDefaultFreePlan } from "./defaultFreePlan.service.js";

/**
 * Return the user's current stored subscription or create the configured free
 * plan assignment once. A unique-user race is recovered by reading the winner.
 * This path deliberately does not call the payment provider and is unaffected
 * by the PAYMENTS_ENABLED switch.
 */
export async function getOrCreateFreePlanSubscription(userId, dependencies = {}) {
  const SubscriptionPlanModel = dependencies.SubscriptionPlan || SubscriptionPlan;
  const UserSubscriptionModel = dependencies.UserSubscription || UserSubscription;
  const now = typeof dependencies.now === "function" ? dependencies.now() : new Date();

  const findForUser = () => UserSubscriptionModel.findOne({ user: userId }).populate("plan").lean();
  const existing = await findForUser();
  if (existing) {
    // Migrate only when the stored subscription could be a legacy Free
    // assignment. Paid subscribers do not need a Free-plan lookup.
    if (existing.plan?.slug === "free" || Number(existing.plan?.price) === 0) {
      await getDefaultFreePlan({ PlanModel: SubscriptionPlanModel });
    }
    return existing;
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

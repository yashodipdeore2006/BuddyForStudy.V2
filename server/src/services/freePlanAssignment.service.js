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

  // Resolve the configured Free plan first so legacy zero-price plans are
  // migrated to the explicit default marker before they are used elsewhere.
  const freePlan = await getDefaultFreePlan({ PlanModel: SubscriptionPlanModel });
  const findForUser = () => UserSubscriptionModel.findOne({ user: userId }).populate("plan").lean();
  const existing = await findForUser();
  if (existing) return existing;

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

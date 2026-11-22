import { SubscriptionPlan } from "../models/SubscriptionPlan.js";

function withSession(query, session) {
  return session && query && typeof query.session === "function"
    ? query.session(session)
    : query;
}

async function findPlan(PlanModel, filter, session) {
  let query = PlanModel.findOne(filter);
  if (query && typeof query.sort === "function") {
    query = query.sort({ sortOrder: 1, createdAt: 1 });
  }
  query = withSession(query, session);
  return query && typeof query.lean === "function" ? query.lean() : query;
}

/**
 * Resolve the single canonical Free plan.
 *
 * Existing installations are migrated deterministically: an active, zero-priced
 * plan with slug "free" wins; otherwise the first active zero-priced plan is
 * adopted. Positive-priced plans are never eligible, even when their slug is
 * "free". Once selected, the explicit isDefaultFree flag is authoritative.
 */
export async function getDefaultFreePlan({ PlanModel = SubscriptionPlan, session } = {}) {
  const configured = await findPlan(PlanModel, {
    isDefaultFree: true,
    isActive: true,
    price: 0
  }, session);
  if (configured) return configured;

  const legacySlugPlan = await findPlan(PlanModel, {
    slug: "free",
    isActive: true,
    price: 0
  }, session);
  const candidate = legacySlugPlan || await findPlan(PlanModel, {
    isActive: true,
    price: 0
  }, session);
  if (!candidate) return null;

  // Test doubles and legacy model adapters may be read-only. In that case the
  // selected candidate is still constrained to a real, active zero-price plan.
  if (typeof PlanModel.updateMany !== "function" || typeof PlanModel.updateOne !== "function") {
    return { ...candidate, isDefaultFree: true };
  }

  await PlanModel.updateMany(
    { isDefaultFree: true },
    { $set: { isDefaultFree: false } },
    session ? { session } : {}
  );
  await PlanModel.updateOne(
    { _id: candidate._id, isActive: true, price: 0 },
    { $set: { isDefaultFree: true } },
    session ? { session } : {}
  );

  return await findPlan(PlanModel, {
    isDefaultFree: true,
    isActive: true,
    price: 0
  }, session) || null;
}

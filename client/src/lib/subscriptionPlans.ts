export type CheckoutPlanCandidate = {
  isActive?: boolean;
  billingInterval?: string;
};

/**
 * Returns the same subscription plans shown on /pricing, in the backend's
 * admin-configured sortOrder. One-time plans are excluded because subscription
 * checkout intentionally rejects them; inactive plans are never displayed.
 */
export function getCheckoutSubscriptionPlans<T extends CheckoutPlanCandidate>(plans: unknown): T[] {
  if (!Array.isArray(plans)) return [];
  return plans.filter((plan): plan is T =>
    Boolean(
      plan &&
      typeof plan === "object" &&
      plan.isActive !== false &&
      plan.billingInterval !== "one_time"
    )
  );
}

export const PLAN_LIMIT_DEFINITIONS = [
  ["ai_course_builds_per_month", "AI course builds"],
  ["advanced_ai_questions_per_month", "Advanced AI questions"],
  ["advanced_ai_insights_per_month", "Advanced AI summaries"],
  ["ai_quiz_generations_per_month", "AI quiz generations"],
  ["youtube_discovery_courses_per_month", "YouTube discovery courses"],
  ["ai_curated_courses_per_month", "AI-curated courses"],
] as const;

export function formatPlanLimit(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not configured";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not configured";
  if (numeric === -1) return "Unlimited";
  if (numeric === 0) return "Not included";
  return `${numeric.toLocaleString("en-IN")} / month`;
}

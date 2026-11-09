/**
 * Maps AI monthly-allowance API failures to the subscription feature that the
 * shared upgrade modal can resolve. Provider-wide 429s and unrelated limits
 * must not be mistaken for a learner plan allowance.
 */
export function resolveAiQuotaUpgradeFeature(status: number, details: Record<string, unknown> | null | undefined): string {
  if (status !== 429 || !details) return "";

  const feature = typeof details.feature === "string" ? details.feature : "";
  const period = typeof details.period === "string" ? details.period : "";
  const limitKey = typeof details.limitKey === "string" ? details.limitKey : "";

  if (feature === "ai_course_builder" && period === "month") {
    return "ai_course_builder";
  }

  if (
    feature === "advanced_ai_paths" &&
    ["advanced_ai_insights_per_month", "advanced_ai_questions_per_month"].includes(limitKey)
  ) {
    return "advanced_ai_paths";
  }

  return "";
}

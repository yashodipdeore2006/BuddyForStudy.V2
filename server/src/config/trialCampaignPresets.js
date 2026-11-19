const DEFAULT_ELIGIBILITY = Object.freeze({
  requireActiveAccount: true,
  requireVerifiedEmail: true,
  requireNoActiveSubscription: true,
  requireNoPreviousTrial: true
});

const PRESET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "7_days",
    label: "7 days",
    description: "Short introductory access for a focused first experience.",
    trialDays: 7
  }),
  Object.freeze({
    id: "14_days",
    label: "14 days",
    description: "Two weeks to explore the premium learning experience.",
    trialDays: 14
  }),
  Object.freeze({
    id: "30_days",
    label: "30 days",
    description: "A full month to build a consistent learning habit.",
    trialDays: 30
  })
]);

/**
 * Return fresh editable values. The preset catalogue itself remains immutable,
 * so callers cannot change defaults for other administrators or requests.
 */
export function getTrialCampaignPresets() {
  return PRESET_DEFINITIONS.map((preset) => ({
    ...preset,
    maxClaims: 100,
    eligibility: { ...DEFAULT_ELIGIBILITY },
    conversionMode: "none",
    conversionPlanId: null
  }));
}

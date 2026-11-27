/**
 * Return a narrow learner-safe representation of the most recent trial.
 * Internal grant identifiers, administrator actors, reasons, and idempotency
 * keys remain server-side.
 */
export function toLearnerTrialBillingSummary(trial) {
  if (!trial) return null;
  const conversionWasSeparatelyAuthorized =
    trial.status === "converted" ||
    trial.conversionConsentStatus === "authorized" ||
    Boolean(String(trial.providerSubscriptionId || "").trim());
  return {
    status: String(trial.status || "unknown"),
    startsAt: trial.startsAt || null,
    endsAt: trial.endsAt || null,
    conversionConsentStatus: String(trial.conversionConsentStatus || "not_requested"),
    plan: trial.plan ? { name: String(trial.plan.name || "Trial plan") } : null,
    conversionPlan: trial.conversionPlan ? {
      name: String(trial.conversionPlan.name || "Paid plan"),
      price: Number(trial.conversionPlan.price || 0),
      currency: String(trial.conversionPlan.currency || "INR"),
      billingInterval: String(trial.conversionPlan.billingInterval || "monthly")
    } : null,
    payment: {
      paymentMethodRequired: false,
      paymentOrderCreated: false,
      autopayAuthorized: conversionWasSeparatelyAuthorized
    }
  };
}

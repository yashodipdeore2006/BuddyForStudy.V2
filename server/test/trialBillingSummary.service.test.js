import test from "node:test";
import assert from "node:assert/strict";
import { toLearnerTrialBillingSummary } from "../src/services/trialBillingSummary.service.js";

test("learner trial summary exposes dates and plan details without internal grant fields", () => {
  const summary = toLearnerTrialBillingSummary({
    _id: "grant-id", user: "learner-id", grantedBy: "admin-id",
    reason: "internal admin reason", idempotencyKey: "internal-idempotency-key",
    providerSubscriptionId: "",
    startsAt: new Date("2026-11-01T10:00:00.000Z"),
    endsAt: new Date("2026-11-15T10:00:00.000Z"),
    status: "expired", conversionConsentStatus: "cancelled",
    plan: { name: "Premium Trial", features: ["premium"] },
    conversionPlan: { name: "Premium Monthly", price: 299, currency: "INR", billingInterval: "monthly" }
  });
  assert.deepEqual(summary, {
    status: "expired",
    startsAt: new Date("2026-11-01T10:00:00.000Z"),
    endsAt: new Date("2026-11-15T10:00:00.000Z"),
    conversionConsentStatus: "cancelled",
    plan: { name: "Premium Trial" },
    conversionPlan: { name: "Premium Monthly", price: 299, currency: "INR", billingInterval: "monthly" },
    payment: { paymentMethodRequired: false, paymentOrderCreated: false, autopayAuthorized: false }
  });
  for (const field of ["user","grantedBy","reason","idempotencyKey"]) assert.equal(field in summary, false);
});

test("autopay is reported as authorized only after separate conversion authorization", () => {
  const trialing = toLearnerTrialBillingSummary({
    status: "trialing", conversionConsentStatus: "pending_user_consent",
    providerSubscriptionId: "", startsAt: new Date("2026-11-21T10:00:00.000Z"),
    endsAt: new Date("2026-12-05T10:00:00.000Z")
  });
  const converted = toLearnerTrialBillingSummary({
    status: "converted", conversionConsentStatus: "authorized",
    providerSubscriptionId: "provider-subscription-id",
    startsAt: new Date("2026-11-01T10:00:00.000Z"),
    endsAt: new Date("2026-11-15T10:00:00.000Z")
  });
  assert.deepEqual(trialing.payment, { paymentMethodRequired: false, paymentOrderCreated: false, autopayAuthorized: false });
  assert.equal(converted.payment.autopayAuthorized, true);
});

test("null trial grants remain a null learner summary", () => {
  assert.equal(toLearnerTrialBillingSummary(null), null);
});

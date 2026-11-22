import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSubscriptionPlanAdminInput, hasProviderBillingTermsChanged } from "../src/utils/subscriptionPlanAdminValidation.js";

test("subscription plan validation accepts valid plan metadata", () => {
  assert.deepEqual(validateSubscriptionPlanAdminInput({
    name: "Pro", slug: "pro", price: 199, currency: "INR",
    billingInterval: "monthly", trialDays: 7, sortOrder: 2, isActive: true,
    features: ["Build with AI"], limits: { ai_course_builds_per_month: 5 }
  }), { valid: true, errors: [] });
});

test("subscription plan validation rejects negative price and invalid interval", () => {
  const result = validateSubscriptionPlanAdminInput({
    name: "Pro", slug: "Pro Plan", price: -1, currency: "IN", billingInterval: "weekly"
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "slug"));
  assert.ok(result.errors.some((error) => error.field === "price"));
  assert.ok(result.errors.some((error) => error.field === "currency"));
  assert.ok(result.errors.some((error) => error.field === "billingInterval"));
});

test("subscription plan validation enforces trial, sort, feature and limit types", () => {
  const result = validateSubscriptionPlanAdminInput({
    name: "Premium", slug: "premium", price: 399, trialDays: 366, sortOrder: 1.5,
    features: ["Good", 4], limits: { monthly: "unlimited" }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "trialDays"));
  assert.ok(result.errors.some((error) => error.field === "sortOrder"));
  assert.ok(result.errors.some((error) => error.field === "features"));
  assert.ok(result.errors.some((error) => error.field === "limits.monthly"));
});

test("default Free assignment requires an active zero-priced plan", () => {
  const base = { name: "Free", slug: "free", price: 0, currency: "INR", billingInterval: "monthly", isActive: true };
  assert.equal(validateSubscriptionPlanAdminInput({ isDefaultFree: true }, base).valid, true);
  assert.equal(validateSubscriptionPlanAdminInput({ isDefaultFree: true }, { ...base, price: 99 }).valid, false);
  assert.equal(validateSubscriptionPlanAdminInput({ isDefaultFree: true }, { ...base, isActive: false }).valid, false);
  assert.equal(validateSubscriptionPlanAdminInput({ isDefaultFree: "true" }, base).valid, false);
});

test("subscription plan partial updates validate against existing plan values", () => {
  assert.deepEqual(validateSubscriptionPlanAdminInput({ isActive: false }, {
    name: "Pro", slug: "pro", price: 199, currency: "INR",
    billingInterval: "monthly", trialDays: 0, sortOrder: 2, isActive: true, isPopular: false
  }), { valid: true, errors: [] });
});


test("provider billing term change detection ignores metadata edits and detects price, currency, and interval changes", () => {
  const current = { price: 199, currency: "INR", billingInterval: "monthly" };
  assert.equal(hasProviderBillingTermsChanged(current, { name: "Pro" }), false);
  assert.equal(hasProviderBillingTermsChanged(current, { price: "199", currency: "inr", billingInterval: "monthly" }), false);
  assert.equal(hasProviderBillingTermsChanged(current, { price: 299 }), true);
  assert.equal(hasProviderBillingTermsChanged(current, { currency: "USD" }), true);
  assert.equal(hasProviderBillingTermsChanged(current, { billingInterval: "yearly" }), true);
});

test("admin plan updates block billing term edits for plans with provider billing history", () => {
  const controller = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const start = controller.indexOf("export async function updatePlan");
  const end = controller.indexOf("export async function retryNotificationDeliveryAdmin", start);
  assert.ok(start >= 0 && end > start, "Expected the admin plan update handler");
  const handler = controller.slice(start, end);
  assert.match(handler, /hasProviderBillingTermsChanged\(plan, req\.body\)/);
  assert.match(handler, /Boolean\(plan\.providerPlanId\)/);
  assert.match(handler, /Payment\.exists\([\s\S]*?provider: "razorpay",[\s\S]*?"metadata\.checkoutType": "subscription"/);
  assert.match(handler, /Create a new subscription plan to change its price, currency, or billing interval/);
});


test("new subscription plans reject one-time billing because one-time purchases belong to course checkout", () => {
  const result = validateSubscriptionPlanAdminInput({
    name: "Lifetime",
    slug: "lifetime",
    price: 999,
    currency: "INR",
    billingInterval: "one_time"
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "billingInterval"));
});

test("legacy one-time subscription records remain editable without changing their historical interval", () => {
  const result = validateSubscriptionPlanAdminInput({
    description: "Legacy plan; existing members are not migrated by this edit.",
    isPopular: false
  }, {
    name: "Legacy",
    slug: "legacy",
    price: 999,
    currency: "INR",
    billingInterval: "one_time",
    isActive: true,
    isPopular: false,
    trialDays: 0,
    sortOrder: 0
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});


test("subscription plan validation rejects overlong or non-text descriptions", () => {
  const base = { name: "Pro", slug: "pro", price: 199, currency: "INR", billingInterval: "monthly" };
  assert.ok(validateSubscriptionPlanAdminInput({ ...base, description: "x".repeat(501) }).errors.some((error) => error.field === "description"));
  assert.ok(validateSubscriptionPlanAdminInput({ ...base, description: { html: "unsafe" } }).errors.some((error) => error.field === "description"));
  assert.deepEqual(validateSubscriptionPlanAdminInput({ ...base, description: "A clear learner-facing description." }), { valid: true, errors: [] });
});

test("subscription plan validation accepts only configured feature labels and rejects duplicates", () => {
  const base = { name: "Pro", slug: "pro", price: 199, currency: "INR", billingInterval: "monthly" };
  assert.deepEqual(validateSubscriptionPlanAdminInput({ ...base, features: ["Build with AI", "Access published courses"] }), { valid: true, errors: [] });
  assert.ok(validateSubscriptionPlanAdminInput({ ...base, features: ["Unconfigured premium feature"] }).errors.some((error) => error.field === "features"));
  assert.ok(validateSubscriptionPlanAdminInput({ ...base, features: ["Build with AI", "Build with AI"] }).errors.some((error) => error.field === "features"));
});

test("subscription plan usage limits must be integers of at least -1 with safe keys", () => {
  const base = { name: "Pro", slug: "pro", price: 199, currency: "INR", billingInterval: "monthly" };
  assert.deepEqual(validateSubscriptionPlanAdminInput({
    ...base,
    limits: { ai_course_builds_per_month: -1, ai_quiz_generations_per_month: 0, youtube_discovery_courses_per_month: 25 }
  }), { valid: true, errors: [] });
  for (const value of [1.5, -1.1, -2, "", null, "unlimited"]) {
    const result = validateSubscriptionPlanAdminInput({ ...base, limits: { ai_course_builds_per_month: value } });
    assert.ok(result.errors.some((error) => error.field === "limits.ai_course_builds_per_month"), `expected invalid limit: ${String(value)}`);
  }
  assert.ok(validateSubscriptionPlanAdminInput({ ...base, limits: { "$where": 1 } }).errors.some((error) => error.field === "limits.$where"));
});

test("deactivating a plan removes it from public selection but does not revoke existing subscription entitlements", () => {
  const adminController = readFileSync(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const entitlementService = readFileSync(new URL("../src/services/subscriptionEntitlement.service.js", import.meta.url), "utf8");
  const billingRoutes = readFileSync(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");

  assert.match(adminController, /SubscriptionPlan\.find\(\)\.sort\(\{ sortOrder: 1, createdAt: 1 \}\)/);
  assert.match(billingRoutes, /PlanModel\.find\(\{ isActive: true \}\)\s*\.sort\(\{ sortOrder: 1, createdAt: 1 \}\)/);
  assert.match(entitlementService, /UserSubscription\.findOne\(\{[\s\S]*?status: \{ \$in: \["trialing", "active", "past_due"\] \}[\s\S]*?\}\)\.populate\("plan"\)/);
  const activeSubscriptionQuery = entitlementService.slice(
    entitlementService.indexOf("export async function getActiveSubscriptionForUser"),
    entitlementService.indexOf("async function getFreePlan")
  );
  assert.doesNotMatch(activeSubscriptionQuery, /plan\.isActive|isActive: true/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSubscriptionPlanAdminInput, hasProviderBillingTermsChanged } from "../src/utils/subscriptionPlanAdminValidation.js";

test("subscription plan validation accepts valid plan metadata", () => {
  assert.deepEqual(validateSubscriptionPlanAdminInput({
    name: "Pro", slug: "pro", price: 199, currency: "INR",
    billingInterval: "monthly", trialDays: 7, sortOrder: 2, isActive: true,
    features: ["AI roadmaps"], limits: { ai_course_builds_per_month: 5 }
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

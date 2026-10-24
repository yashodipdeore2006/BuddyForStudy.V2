import test from "node:test";
import assert from "node:assert/strict";
import { validateSubscriptionPlanAdminInput } from "../src/utils/subscriptionPlanAdminValidation.js";

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

import test from "node:test";
import assert from "node:assert/strict";
import { resolveAiQuotaUpgradeFeature } from "../src/lib/aiQuotaGate.ts";

test("monthly AI course-builder allowance opens the Build with AI upgrade flow", () => {
  assert.equal(resolveAiQuotaUpgradeFeature(429, {
    code: "AI_USAGE_LIMIT",
    feature: "ai_course_builder",
    period: "month",
    limit: 10,
    used: 10
  }), "ai_course_builder");
});

test("async and synchronous monthly allowance responses use the same feature gate", () => {
  const details = {
    code: "AI_USAGE_LIMIT",
    feature: "ai_course_builder",
    period: "month",
    limit: 10,
    used: 10
  };
  assert.equal(resolveAiQuotaUpgradeFeature(429, details), "ai_course_builder");
  assert.equal(resolveAiQuotaUpgradeFeature(429, { ...details, used: 0 }), "ai_course_builder");
});

test("advanced AI monthly limits retain their existing upgrade flow", () => {
  assert.equal(resolveAiQuotaUpgradeFeature(429, {
    feature: "advanced_ai_paths",
    limitKey: "advanced_ai_questions_per_month",
    limit: 20,
    used: 20
  }), "advanced_ai_paths");
  assert.equal(resolveAiQuotaUpgradeFeature(429, {
    feature: "advanced_ai_paths",
    limitKey: "advanced_ai_insights_per_month",
    limit: 10,
    used: 10
  }), "advanced_ai_paths");
});

test("provider throttling and unrelated quota denials do not open the plan upgrade modal", () => {
  assert.equal(resolveAiQuotaUpgradeFeature(429, { feature: "ai_course_builder", period: "day" }), "");
  assert.equal(resolveAiQuotaUpgradeFeature(429, { feature: "ai_course_builder" }), "");
  assert.equal(resolveAiQuotaUpgradeFeature(429, { feature: "gemini_provider" }), "");
  assert.equal(resolveAiQuotaUpgradeFeature(503, { feature: "ai_course_builder", period: "month" }), "");
  assert.equal(resolveAiQuotaUpgradeFeature(429, null), "");
});

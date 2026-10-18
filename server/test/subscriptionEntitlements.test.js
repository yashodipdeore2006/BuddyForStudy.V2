import test from "node:test";
import assert from "node:assert/strict";
import { SUBSCRIPTION_FEATURES, normalizeSubscriptionFeatures } from "../src/config/subscriptionFeatures.js";
import { resolveFeature } from "../src/services/subscriptionEntitlement.service.js";

test("feature registry exposes unique stable feature keys and labels", () => {
  const keys = SUBSCRIPTION_FEATURES.map((feature) => feature.key);
  const labels = SUBSCRIPTION_FEATURES.map((feature) => feature.label);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(labels).size, labels.length);
  for (const feature of SUBSCRIPTION_FEATURES) {
    assert.ok(resolveFeature(feature.key));
    assert.equal(resolveFeature(feature.label).key, feature.key);
  }
});

test("feature resolution rejects unknown feature keys", () => {
  assert.equal(resolveFeature("not_a_real_feature"), null);
});

test("subscription feature normalization supports legacy tier aliases and removes duplicates", () => {
  assert.deepEqual(
    normalizeSubscriptionFeatures(["Everything in Pro", "Build with AI", "Build with AI", "unknown"]),
    [
      "Access published courses",
      "Normal course search",
      "Basic learning progress tracking",
      "Build with AI",
      "Personalized learning roadmaps",
      "Project-based learning"
    ]
  );
});

test("subscription feature normalization ignores malformed values", () => {
  assert.deepEqual(normalizeSubscriptionFeatures(null), []);
  assert.deepEqual(normalizeSubscriptionFeatures(["", null, 12, "Normal course search"]), ["Normal course search"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { PricingRule } from "../src/models/PricingRule.js";
import { getDiscoveryPricingPreview } from "../src/services/course.service.js";

async function withPricingStore({ policy = null, rules = [] } = {}, run) {
  const originalFindSetting = PlatformSetting.findOne;
  const originalFindRules = PricingRule.find;

  PlatformSetting.findOne = (filter) => ({
    select() { return this; },
    lean: async () => filter?.key === "generated_course_pricing_policy" && policy !== null
      ? { key: "generated_course_pricing_policy", value: policy }
      : null
  });
  PricingRule.find = () => ({
    sort() { return this; },
    lean: async () => rules
  });

  try {
    return await run();
  } finally {
    PlatformSetting.findOne = originalFindSetting;
    PricingRule.find = originalFindRules;
  }
}

test("YouTube discovery search preview uses the Course model's default level-band pricing", async () => {
  await withPricingStore({}, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "paid", price: 31, currency: "INR"
    });
    assert.deepEqual(await getDiscoveryPricingPreview("Intermediate"), {
      mode: "paid", price: 41, currency: "INR"
    });
    assert.deepEqual(await getDiscoveryPricingPreview("Advanced"), {
      mode: "paid", price: 51, currency: "INR"
    });
  });
});

test("YouTube discovery search preview follows the configured fixed-price policy", async () => {
  await withPricingStore({
    policy: {
      enabled: true,
      mode: "fixed",
      fixedPrice: 49,
      currency: "INR",
      applyTo: ["discovery"]
    }
  }, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "paid", price: 49, currency: "INR"
    });
  });
});

test("YouTube discovery search preview applies the same level-band bounds as course creation", async () => {
  await withPricingStore({
    policy: {
      enabled: true,
      mode: "level_bands",
      currency: "INR",
      levelBands: {
        Beginner: { min: 20, max: 40 },
        Intermediate: { min: 30, max: 49 },
        Advanced: { min: 40, max: 59 }
      },
      applyTo: ["discovery"]
    }
  }, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "paid", price: 31, currency: "INR"
    });
  });
});

test("YouTube discovery search preview follows the first matching enabled admin pricing rule", async () => {
  await withPricingStore({
    policy: {
      enabled: true,
      mode: "rule_based",
      currency: "INR",
      applyTo: ["discovery"]
    },
    rules: [{
      _id: "rule-youtube-beginner",
      name: "YouTube beginner price",
      enabled: true,
      autoApply: true,
      priority: 1,
      filters: { category: "YouTube Discovery", level: "Beginner", mode: "free" },
      operation: { type: "fixed", amount: 49, saleHandling: "clear" }
    }]
  }, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "paid", price: 49, currency: "INR"
    });
  });
});

test("YouTube discovery search preview remains free when policy is disabled or excludes discovery courses", async () => {
  await withPricingStore({
    policy: {
      enabled: false,
      mode: "fixed",
      fixedPrice: 49,
      currency: "INR",
      applyTo: ["discovery"]
    }
  }, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "free", price: 0, currency: "INR"
    });
  });

  await withPricingStore({
    policy: {
      enabled: true,
      mode: "fixed",
      fixedPrice: 49,
      currency: "INR",
      applyTo: ["ai"]
    }
  }, async () => {
    assert.deepEqual(await getDiscoveryPricingPreview("Beginner"), {
      mode: "free", price: 0, currency: "INR"
    });
  });
});

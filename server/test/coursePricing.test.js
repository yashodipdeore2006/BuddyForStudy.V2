import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoursePricingFilter,
  calculateNextPricing,
  parsePricingFilters,
  recommendBandPrice,
  validatePricingOperation
} from "../src/utils/coursePricing.js";

test("pricing filters reject arbitrary Mongo operators and inverted price ranges", () => {
  assert.throws(() => parsePricingFilters({ "$where": "true" }), /Unsupported filter/);
  assert.throws(() => parsePricingFilters({ minPrice: "900", maxPrice: "100" }), /Minimum price cannot exceed maximum/);
  assert.deepEqual(parsePricingFilters({ category: "Web", mode: "paid", minPrice: "100" }).mode, "paid");
});

test("bulk pricing math respects floors, ceilings and sale-price safeguards", () => {
  assert.equal(calculateNextPricing({ mode: "paid", price: 500 }, validatePricingOperation({ type: "percent_decrease", amount: 10, minPrice: 450 })).price, 450);
  assert.throws(() => calculateNextPricing({ mode: "paid", price: 500, saleEnabled: true, salePrice: 450 }, validatePricingOperation({ type: "fixed", amount: 400 })), /invalidate an active sale/);
  assert.equal(calculateNextPricing({ mode: "paid", price: 500, saleEnabled: true, salePrice: 450 }, validatePricingOperation({ type: "fixed", amount: 400, saleHandling: "clear" })).saleEnabled, false);
});

test("pricing operation validation rejects percentages above 100 and unknown keys", () => {
  assert.throws(() => validatePricingOperation({ type: "percent_decrease", amount: 101 }), /between 0 and 100/);
  assert.throws(() => validatePricingOperation({ type: "fixed", amount: 99, "$set": {} }), /Unsupported pricing operation field/);
});

test("recommendations use category-level bands and adjust for modules and project lessons within bounds", () => {
  const course = {
    category: "Web Development", level: "Beginner",
    pricing: { mode: "paid", price: 200, currency: "INR" },
    modules: [
      { lessons: [{ type: "project" }, { type: "tutorial" }] },
      { lessons: [{ type: "project" }] }
    ]
  };
  const result = recommendBandPrice(course, {
    levels: { Beginner: { min: 100, max: 400 } },
    categories: [{ category: "Web Development", levels: { Beginner: { min: 150, max: 250 } } }],
    depthAdjustmentPerModule: 5,
    projectAdjustment: 10
  });
  assert.equal(result.eligible, true);
  assert.equal(result.pricing.price, 250);
  assert.match(result.explanation, /Web Development/);
  assert.equal(result.factors.moduleCount, 2);
  assert.equal(result.factors.projectCount, 2);
});

test("recommendations safely skip courses without a configured level or category band", () => {
  const result = recommendBandPrice({ category: "Unknown", level: "Advanced", pricing: { price: 300 } }, { levels: { Beginner: { min: 100, max: 200 } }, categories: [] });
  assert.equal(result.eligible, false);
});

test("pricing preview model keeps per-course before/after snapshots and expiration", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, "../src/models/PricingBatch.js"), "utf8");
  assert.match(source, /expiresAt/);
  assert.match(source, /before: \{ type: mongoose.Schema.Types.Mixed, required: true \}/);
  assert.match(source, /after: \{ type: mongoose.Schema.Types.Mixed, default: null \}/);
});

test("converting a free course to paid requires and uses a positive configured amount", () => {
  const operation = validatePricingOperation({ type: "set_paid", amount: 299 });
  assert.equal(calculateNextPricing({ mode: "free", price: 0 }, operation).price, 299);
  assert.throws(() => validatePricingOperation({ type: "set_paid" }), /Amount must be between/);
});

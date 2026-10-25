import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoursePricingFilter,
  calculateNextPricing,
  getCoursePricingValidationError,
  getEffectiveCoursePrice,
  hasValidActiveCourseSale,
  parsePricingFilters,
  recommendBandPrice,
  validatePricingOperation
} from "../src/utils/coursePricing.js";
import { DEFAULT_GENERATED_PRICING_POLICY, resolveGeneratedCoursePricingPolicy } from "../src/utils/generatedCoursePricingPolicy.js";

test("effective course price ignores invalid active sale values and aligns with checkout", () => {
  assert.equal(getEffectiveCoursePrice({ mode: "free", price: 0 }), 0);
  assert.equal(getEffectiveCoursePrice({ mode: "paid", price: 35, saleEnabled: true, salePrice: 20 }), 20);
  assert.equal(getEffectiveCoursePrice({ mode: "paid", price: 35, saleEnabled: true, salePrice: 0 }), 35);
  assert.equal(getEffectiveCoursePrice({ mode: "paid", price: 35, saleEnabled: true, salePrice: 40 }), 35);
  assert.equal(getEffectiveCoursePrice({ mode: "paid", price: 0, saleEnabled: false }), null);
  assert.equal(getEffectiveCoursePrice(undefined), null);
  assert.equal(hasValidActiveCourseSale({ mode: "paid", price: 35, saleEnabled: true, salePrice: 20 }), true);
  assert.equal(hasValidActiveCourseSale({ mode: "paid", price: 35, saleEnabled: true, salePrice: 0 }), false);
  assert.match(getCoursePricingValidationError({ mode: "paid", price: 35, saleEnabled: true, salePrice: 0 }), /greater than zero/);
  assert.equal(getCoursePricingValidationError({ mode: "paid", price: 35, saleEnabled: true, salePrice: 20 }), null);
});

test("pricing operations will not preserve an active zero or invalid sale price", () => {
  assert.throws(() => calculateNextPricing({ mode: "paid", price: 35, saleEnabled: true, salePrice: 0 }, validatePricingOperation({ type: "fixed", amount: 30 })), /invalidate an active sale/);
});


test("default generated pricing is consistent with the admin studio even before its first save", async () => {
  const policy = resolveGeneratedCoursePricingPolicy(undefined);
  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, "level_bands");
  assert.deepEqual(policy.applyTo, ["discovery"]);
  assert.deepEqual(policy.levelBands, {
    Beginner: { min: 20, max: 39 },
    Intermediate: { min: 30, max: 49 },
    Advanced: { min: 40, max: 59 }
  });
  assert.deepEqual([...DEFAULT_GENERATED_PRICING_POLICY.applyTo], ["discovery"]);

  const disabled = resolveGeneratedCoursePricingPolicy({ enabled: false, applyTo: ["discovery"] });
  assert.equal(disabled.enabled, false);
  const emptyApplyTo = resolveGeneratedCoursePricingPolicy({ enabled: true, applyTo: [] });
  assert.deepEqual(emptyApplyTo.applyTo, []);

  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const courseModel = fs.readFileSync(path.join(here, "../src/models/Course.js"), "utf8");
  const pricingController = fs.readFileSync(path.join(here, "../src/controllers/adminPricing.controller.js"), "utf8");
  const discoveryController = fs.readFileSync(path.join(here, "../src/controllers/discovery.controller.js"), "utf8");
  const discoveryService = fs.readFileSync(path.join(here, "../src/services/discovery.service.js"), "utf8");
  const courseService = fs.readFileSync(path.join(here, "../src/services/course.service.js"), "utf8");
  const youtubeFallback = fs.readFileSync(path.join(here, "../../src/components/YouTubeSearchFallback.tsx"), "utf8");
  assert.match(courseModel, /resolveGeneratedCoursePricingPolicy\(setting\?\.value\)/);
  assert.match(pricingController, /resolveGeneratedCoursePricingPolicy\(setting\?\.value\)/);
  assert.match(discoveryController, /level: z\.enum\(\["Beginner", "Intermediate", "Advanced"\]\)\.optional\(\)/);
  assert.match(discoveryService, /const normalizedLevel = \["Beginner", "Intermediate", "Advanced"\]\.includes\(level\) \? level : "Beginner"/);
  assert.match(courseModel, /const band = policy\.levelBands\?\.\[course\.level\]/);
  assert.match(discoveryService, /pricing: \{ mode: "free", price: 0, currency: "INR" \}/);
  assert.match(youtubeFallback, /level: normalizeDiscoveryLevel\(curationMeta\?\.intent\?\.level\)/);
  assert.match(courseService, /function effectiveDiscoveryPricingPreview\(pricing = \{\}\)/);
  assert.match(courseService, /Saved prices win/);
  assert.match(courseService, /pricingPreview: existing \? effectiveDiscoveryPricingPreview\(existing\.pricing\) : configuredPreview/);
  assert.match(courseService, /saleEnabled === true[\s\S]*salePrice < basePrice/);
  assert.match(youtubeFallback, /formatResourcePrice\(resource\)/);
});

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

test("pricing write routes are protected by authentication, admin role and pricing permission", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const routes = fs.readFileSync(path.join(here, "../src/routes/adminPricing.routes.js"), "utf8");
  const rbac = fs.readFileSync(path.join(here, "../src/utils/adminRbac.js"), "utf8");
  assert.match(routes, /router\.use\(authMiddleware, adminMiddleware\)/);
  assert.match(routes, /adminPermissionMiddleware\("pricing\.manage"\)/);
  assert.match(routes, /router\.post\("\/apply"/);
  assert.match(routes, /router\.post\("\/rules\/run"/);
  assert.match(rbac, /"pricing\.manage"/);
});

test("pricing batch rollback and automatic rules retain audit and revision safeguards", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const controller = fs.readFileSync(path.join(here, "../src/controllers/adminPricing.controller.js"), "utf8");
  assert.match(controller, /course\.\$locals\.revisionContext/);
  assert.match(controller, /Course pricing batch/i);
  assert.match(controller, /recordAuditEvent/);
  assert.match(controller, /enabled: true, autoApply: true/);
  assert.match(controller, /Rollback skipped because the course price has changed/);
});

test("comparison-price updates do not change the base price and must remain above it", () => {
  const changed = calculateNextPricing({ mode: "paid", price: 499, compareAtPrice: 0 }, validatePricingOperation({ type: "set_compare_at", amount: 799 }));
  assert.equal(changed.price, 499);
  assert.equal(changed.compareAtPrice, 799);
  assert.throws(() => calculateNextPricing({ mode: "paid", price: 499 }, validatePricingOperation({ type: "set_compare_at", amount: 450 })), /greater than the base price/);
  assert.equal(calculateNextPricing({ mode: "paid", price: 499, compareAtPrice: 799 }, validatePricingOperation({ type: "set_compare_at", amount: 0 })).compareAtPrice, 0);
});


test("enrollment fails closed when course pricing is missing or invalid", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const enrollmentService = fs.readFileSync(path.join(here, "../src/services/enrollment.service.js"), "utf8");
  assert.match(enrollmentService, /!\["free", "paid"\]\.includes\(course\.pricing\?\.mode\)/);
  assert.match(enrollmentService, /getEffectiveCoursePrice\(course\.pricing\) === null/);
  assert.match(enrollmentService, /error\.status = 409/);
});


test("My Learning omits cancelled enrollments after an unenroll or access revocation", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const enrollmentService = fs.readFileSync(path.join(here, "../src/services/enrollment.service.js"), "utf8");
  assert.match(enrollmentService, /Enrollment\.find\(\{ user: userId, status: \{ \$ne: "cancelled" \} \}\)/);
});
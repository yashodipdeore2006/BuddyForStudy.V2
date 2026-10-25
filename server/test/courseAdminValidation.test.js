import test from "node:test";
import assert from "node:assert/strict";
import { validateCourseAdminPatch } from "../src/utils/courseAdminValidation.js";

test("course admin patch accepts a valid partial metadata update", () => {
  assert.deepEqual(validateCourseAdminPatch({ title: "  Updated title ", learningOutcomes: ["Build an API"] }), {
    valid: true,
    errors: []
  });
});

test("course admin patch rejects blank required metadata and invalid levels", () => {
  const result = validateCourseAdminPatch({ title: " ", category: "", duration: "  ", level: "Expert" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.field), ["title", "category", "duration", "level"]);
});

test("course admin patch rejects malformed outcomes and unsafe thumbnail URLs", () => {
  const result = validateCourseAdminPatch({ learningOutcomes: ["Valid", 4], thumbnail: "javascript:alert(1)" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "learningOutcomes"));
  assert.ok(result.errors.some((error) => error.field === "thumbnail"));
});

test("course admin patch rejects negative, non-finite and malformed pricing values", () => {
  const result = validateCourseAdminPatch({
    pricing: { mode: "paid", price: -1, salePrice: "NaN", currency: "US", saleEnabled: "yes" }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "pricing.price"));
  assert.ok(result.errors.some((error) => error.field === "pricing.salePrice"));
  assert.ok(result.errors.some((error) => error.field === "pricing.currency"));
  assert.ok(result.errors.some((error) => error.field === "pricing.saleEnabled"));
});

test("course admin patch allows empty thumbnail to clear an existing image", () => {
  assert.deepEqual(validateCourseAdminPatch({ thumbnail: "" }), { valid: true, errors: [] });
});

test("course admin patch rejects inconsistent compare-at and sale prices", () => {
  const result = validateCourseAdminPatch({
    pricing: { price: 100, compareAtPrice: 80, salePrice: 120 }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "pricing.compareAtPrice"));
  assert.ok(result.errors.some((error) => error.field === "pricing.salePrice"));
});


test("course admin patch rejects a zero-priced active sale", () => {
  const result = validateCourseAdminPatch({
    pricing: { mode: "paid", price: 35, saleEnabled: true, salePrice: 0 }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) =>
    error.field === "pricing.salePrice" && /greater than zero/i.test(error.message)
  ));
});

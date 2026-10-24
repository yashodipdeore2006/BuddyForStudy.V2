import test from "node:test";
import assert from "node:assert/strict";
import { validateCouponAdminInput } from "../src/utils/couponAdminValidation.js";

test("coupon validation accepts a valid percentage coupon", () => {
  assert.deepEqual(validateCouponAdminInput({
    code: "SAVE20", type: "percentage", value: 20, maxDiscount: 500,
    minOrderAmount: 100, usageLimit: 25, expiresAt: "2030-01-01T00:00:00.000Z", isActive: true
  }), { valid: true, errors: [] });
});

test("coupon validation rejects malformed code and percentage over 100", () => {
  const result = validateCouponAdminInput({ code: "SAVE 20", type: "percentage", value: 101 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "code"));
  assert.ok(result.errors.some((error) => error.field === "value"));
});

test("coupon validation rejects negative amounts and non-integer usage limits", () => {
  const result = validateCouponAdminInput({
    code: "SAVE10", type: "fixed", value: 10, maxDiscount: -1, minOrderAmount: -5, usageLimit: 1.5
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "maxDiscount"));
  assert.ok(result.errors.some((error) => error.field === "minOrderAmount"));
  assert.ok(result.errors.some((error) => error.field === "usageLimit"));
});

test("coupon update validates merged state without requiring omitted fields", () => {
  const result = validateCouponAdminInput({ isActive: false }, {
    code: "OLD10", type: "fixed", value: 10, maxDiscount: null,
    minOrderAmount: 0, usageLimit: null, expiresAt: null, isActive: true
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("coupon validation rejects invalid expiry values and non-boolean active flags", () => {
  const result = validateCouponAdminInput({ code: "ABC", type: "fixed", value: 10, expiresAt: "not-a-date", isActive: "false" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === "expiresAt"));
  assert.ok(result.errors.some((error) => error.field === "isActive"));
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function validateCouponAdminInput(body = {}, current = {}) {
  const value = { ...current, ...body };
  const errors = [];
  if (hasOwn(body, "code") || !current.code) {
    if (typeof value.code !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(value.code.trim())) {
      errors.push({ field: "code", message: "Coupon code must be 3–64 letters, numbers, underscores, or hyphens" });
    }
  }
  if (!["percentage", "fixed"].includes(value.type)) {
    errors.push({ field: "type", message: "Coupon type must be percentage or fixed" });
  }
  const amount = Number(value.value);
  if (value.value === "" || !Number.isFinite(amount) || amount <= 0) {
    errors.push({ field: "value", message: "Coupon value must be a positive number" });
  } else if (value.type === "percentage" && amount > 100) {
    errors.push({ field: "value", message: "Percentage coupons cannot exceed 100" });
  }
  for (const key of ["maxDiscount", "minOrderAmount"]) {
    const raw = value[key];
    if (raw !== undefined && raw !== null) {
      const parsed = Number(raw);
      if (raw === "" || !Number.isFinite(parsed) || parsed < 0) {
        errors.push({ field: key, message: `${key} must be a non-negative number` });
      }
    }
  }
  if (value.usageLimit !== undefined && value.usageLimit !== null) {
    const limit = Number(value.usageLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.push({ field: "usageLimit", message: "Usage limit must be a positive integer or null" });
    }
  }
  if (value.expiresAt !== undefined && value.expiresAt !== null && value.expiresAt !== "") {
    const expiry = new Date(value.expiresAt);
    if (Number.isNaN(expiry.getTime())) errors.push({ field: "expiresAt", message: "Expiry date is invalid" });
  }
  if (hasOwn(body, "isActive") && typeof body.isActive !== "boolean") {
    errors.push({ field: "isActive", message: "isActive must be a boolean" });
  }
  return { valid: errors.length === 0, errors };
}

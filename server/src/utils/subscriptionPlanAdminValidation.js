const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const intervals = new Set(["monthly", "quarterly", "yearly", "one_time"]);

export function validateSubscriptionPlanAdminInput(body = {}, current = {}) {
  const value = { ...current, ...body };
  const errors = [];
  for (const [key, label] of [["name", "Plan name"], ["slug", "Plan slug"]]) {
    if (hasOwn(body, key) || !current[key]) {
      if (typeof value[key] !== "string" || !value[key].trim()) errors.push({ field: key, message: `${label} is required` });
    }
  }
  if (typeof value.name === "string" && value.name.trim().length > 100) {
    errors.push({ field: "name", message: "Plan name must be 100 characters or fewer" });
  }
  if (typeof value.slug === "string" && value.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug.trim().toLowerCase())) {
    errors.push({ field: "slug", message: "Plan slug must use lowercase letters, numbers, and single hyphens" });
  }
  const price = Number(value.price);
  if (value.price === "" || !Number.isFinite(price) || price < 0) errors.push({ field: "price", message: "Plan price must be a non-negative number" });
  if (value.currency !== undefined && (typeof value.currency !== "string" || !/^[A-Za-z]{3}$/.test(value.currency.trim()))) {
    errors.push({ field: "currency", message: "Currency must be a three-letter code" });
  }
  if (!intervals.has(value.billingInterval || "monthly")) {
    errors.push({ field: "billingInterval", message: "Billing interval is invalid" });
  }
  for (const key of ["isActive", "isPopular"]) {
    if (hasOwn(body, key) && typeof body[key] !== "boolean") errors.push({ field: key, message: `${key} must be a boolean` });
  }
  if (value.trialDays !== undefined) {
    const days = Number(value.trialDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) errors.push({ field: "trialDays", message: "Trial days must be an integer from 0 to 365" });
  }
  if (value.sortOrder !== undefined && !Number.isInteger(Number(value.sortOrder))) {
    errors.push({ field: "sortOrder", message: "Sort order must be an integer" });
  }
  if (hasOwn(body, "features") && (!Array.isArray(body.features) || body.features.some((feature) => typeof feature !== "string"))) {
    errors.push({ field: "features", message: "Features must be an array of text values" });
  }
  if (hasOwn(body, "limits") && (!body.limits || typeof body.limits !== "object" || Array.isArray(body.limits))) {
    errors.push({ field: "limits", message: "Limits must be an object" });
  } else if (body.limits && typeof body.limits === "object") {
    for (const [key, raw] of Object.entries(body.limits)) {
      if (!Number.isFinite(Number(raw))) errors.push({ field: `limits.${key}`, message: "Limit values must be numeric" });
    }
  }
  return { valid: errors.length === 0, errors };
}

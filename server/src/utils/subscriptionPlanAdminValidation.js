import { SUBSCRIPTION_FEATURES } from "../config/subscriptionFeatures.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const intervals = new Set(["monthly", "quarterly", "yearly"]);
const allowedFeatures = new Set(SUBSCRIPTION_FEATURES.map((feature) => feature.label));
const limitKeyPattern = /^[a-z][a-z0-9_]{0,99}$/;

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
  const priceInputValid = typeof value.price === "number" ||
    (typeof value.price === "string" && value.price.trim().length > 0);
  const price = Number(value.price);
  if (!priceInputValid || !Number.isFinite(price) || price < 0) {
    errors.push({ field: "price", message: "Plan price must be a non-negative number" });
  }
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.length > 500)) {
    errors.push({ field: "description", message: "Plan description must be text of 500 characters or fewer" });
  }
  if (value.currency !== undefined && (typeof value.currency !== "string" || !/^[A-Za-z]{3}$/.test(value.currency.trim()))) {
    errors.push({ field: "currency", message: "Currency must be a three-letter code" });
  }
  const billingInterval = value.billingInterval || "monthly";
  const keepsLegacyOneTimeInterval = current.billingInterval === "one_time" && billingInterval === "one_time";
  if (!intervals.has(billingInterval) && !keepsLegacyOneTimeInterval) {
    errors.push({ field: "billingInterval", message: "Subscription plans must use a recurring billing interval" });
  }
  for (const key of ["isActive", "isPopular", "isDefaultFree"]) {
    if (hasOwn(body, key) && typeof body[key] !== "boolean") errors.push({ field: key, message: `${key} must be a boolean` });
  }
  if (body.isDefaultFree === true && (value.price !== 0 || value.isActive !== true)) {
    errors.push({ field: "isDefaultFree", message: "The default Free plan must be active and have a price of zero" });
  }
  if (value.trialDays !== undefined) {
    const validInput = typeof value.trialDays === "number" ||
      (typeof value.trialDays === "string" && value.trialDays.trim().length > 0);
    const days = Number(value.trialDays);
    if (!validInput || !Number.isInteger(days) || days < 0 || days > 365) {
      errors.push({ field: "trialDays", message: "Trial days must be an integer from 0 to 365" });
    }
  }
  if (value.sortOrder !== undefined) {
    const validInput = typeof value.sortOrder === "number" ||
      (typeof value.sortOrder === "string" && value.sortOrder.trim().length > 0);
    if (!validInput || !Number.isInteger(Number(value.sortOrder))) {
      errors.push({ field: "sortOrder", message: "Sort order must be an integer" });
    }
  }
  if (hasOwn(body, "features")) {
    if (!Array.isArray(body.features) || body.features.some((feature) =>
      typeof feature !== "string" || !feature.trim() || !allowedFeatures.has(feature.trim())
    )) {
      errors.push({ field: "features", message: "Features must contain only configured subscription feature labels" });
    } else if (new Set(body.features.map((feature) => feature.trim())).size !== body.features.length) {
      errors.push({ field: "features", message: "A subscription feature can only be selected once" });
    }
  }
  if (hasOwn(body, "limits") && (!body.limits || typeof body.limits !== "object" || Array.isArray(body.limits))) {
    errors.push({ field: "limits", message: "Limits must be an object" });
  } else if (body.limits && typeof body.limits === "object") {
    for (const [key, raw] of Object.entries(body.limits)) {
      const validInput = typeof raw === "number" || (typeof raw === "string" && raw.trim().length > 0);
      const limit = Number(raw);
      if (!limitKeyPattern.test(key)) {
        errors.push({ field: `limits.${key}`, message: "Limit keys must use lowercase letters, numbers, and underscores" });
      }
      if (!validInput || !Number.isInteger(limit) || limit < -1) {
        errors.push({ field: `limits.${key}`, message: "Limit values must be whole numbers greater than or equal to -1; -1 means unlimited" });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Determine whether an edit changes the immutable terms of a provider billing plan. */
export function hasProviderBillingTermsChanged(current = {}, updates = {}) {
  const priceChanged = updates.price !== undefined &&
    Number(updates.price) !== Number(current.price);
  const currencyChanged = updates.currency !== undefined &&
    String(updates.currency || "").trim().toUpperCase() !== String(current.currency || "").trim().toUpperCase();
  const intervalChanged = updates.billingInterval !== undefined &&
    String(updates.billingInterval || "") !== String(current.billingInterval || "");
  return priceChanged || currencyChanged || intervalChanged;
}

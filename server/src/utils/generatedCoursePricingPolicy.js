export const DEFAULT_GENERATED_PRICING_POLICY = Object.freeze({
  enabled: true,
  mode: "level_bands",
  fixedPrice: 39,
  currency: "INR",
  levelBands: Object.freeze({
    Beginner: Object.freeze({ min: 20, max: 39 }),
    Intermediate: Object.freeze({ min: 30, max: 49 }),
    Advanced: Object.freeze({ min: 40, max: 59 })
  }),
  // Discovery search should be monetized by default. Admins can opt other
  // generated course types into this policy explicitly.
  applyTo: Object.freeze(["discovery"])
});

/**
 * Resolve a persisted policy over platform defaults. A missing database record
 * must not silently bypass the default YouTube discovery price bands. Explicit
 * disabled policies and empty applyTo arrays remain respected.
 */
export function resolveGeneratedCoursePricingPolicy(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_GENERATED_PRICING_POLICY,
      levelBands: { ...DEFAULT_GENERATED_PRICING_POLICY.levelBands },
      applyTo: [...DEFAULT_GENERATED_PRICING_POLICY.applyTo]
    };
  }

  return {
    ...DEFAULT_GENERATED_PRICING_POLICY,
    ...value,
    levelBands: {
      ...DEFAULT_GENERATED_PRICING_POLICY.levelBands,
      ...(value.levelBands && typeof value.levelBands === "object" && !Array.isArray(value.levelBands)
        ? value.levelBands
        : {})
    },
    applyTo: Array.isArray(value.applyTo)
      ? [...value.applyTo]
      : [...DEFAULT_GENERATED_PRICING_POLICY.applyTo]
  };
}

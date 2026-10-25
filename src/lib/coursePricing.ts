import type { Course } from "@/types";

type CoursePricing = NonNullable<Course["pricing"]>;

/**
 * A sale price is active only when it is strictly positive and below the
 * course's base price. Invalid/legacy sale values fall back to the base price,
 * matching server-side checkout behavior.
 */
export function hasValidActiveCourseSale(pricing?: Partial<CoursePricing> | null): boolean {
  if (!pricing || pricing.mode !== "paid" || pricing.saleEnabled !== true) return false;
  const basePrice = Number(pricing.price);
  const salePrice = Number(pricing.salePrice);
  return Number.isFinite(basePrice) && basePrice > 0 &&
    Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice;
}

/**
 * Returns 0 for explicitly free courses, the valid sale/base price for paid
 * courses, and null when pricing is missing or invalid. Unknown pricing must
 * never be presented as "Free".
 */
export function getEffectiveCoursePrice(pricing?: Partial<CoursePricing> | null): number | null {
  if (!pricing) return null;
  if (pricing.mode === "free") return 0;
  if (pricing.mode !== "paid") return null;
  const basePrice = Number(pricing.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  return hasValidActiveCourseSale(pricing) ? Number(pricing.salePrice) : basePrice;
}

/** Price shown with a strikethrough, if and only if a valid sale is active. */
export function getCourseCrossedOutPrice(pricing?: Partial<CoursePricing> | null): number | null {
  if (!hasValidActiveCourseSale(pricing)) return null;
  const basePrice = Number(pricing?.price);
  const compareAtPrice = Number(pricing?.compareAtPrice || 0);
  return Math.max(basePrice, Number.isFinite(compareAtPrice) ? compareAtPrice : 0);
}

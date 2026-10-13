const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function validateCourseAdminPatch(body = {}) {
  const errors = [];
  const textFields = [
    ["title", "Course title"],
    ["description", "Course description"],
    ["category", "Course category"],
    ["duration", "Estimated duration"]
  ];

  for (const [key, label] of textFields) {
    if (hasOwn(body, key) && (typeof body[key] !== "string" || !body[key].trim())) {
      errors.push({ field: key, message: `${label} cannot be empty` });
    }
  }

  if (hasOwn(body, "level") && !["Beginner", "Intermediate", "Advanced"].includes(body.level)) {
    errors.push({ field: "level", message: "Course level must be Beginner, Intermediate, or Advanced" });
  }

  if (hasOwn(body, "learningOutcomes")) {
    if (!Array.isArray(body.learningOutcomes)) {
      errors.push({ field: "learningOutcomes", message: "Learning outcomes must be an array of text values" });
    } else if (body.learningOutcomes.some((item) => typeof item !== "string")) {
      errors.push({ field: "learningOutcomes", message: "Each learning outcome must be text" });
    } else if (body.learningOutcomes.length > 20) {
      errors.push({ field: "learningOutcomes", message: "A course can have at most 20 learning outcomes" });
    }
  }

  if (hasOwn(body, "thumbnail") && typeof body.thumbnail !== "string") {
    errors.push({ field: "thumbnail", message: "Thumbnail must be a URL string" });
  } else if (typeof body.thumbnail === "string" && body.thumbnail.trim()) {
    try {
      const parsed = new URL(body.thumbnail.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
    } catch {
      errors.push({ field: "thumbnail", message: "Thumbnail must be a valid HTTP or HTTPS URL" });
    }
  }

  if (hasOwn(body, "pricing")) {
    if (!body.pricing || typeof body.pricing !== "object" || Array.isArray(body.pricing)) {
      errors.push({ field: "pricing", message: "Pricing must be an object" });
    } else {
      const pricing = body.pricing;
      if (hasOwn(pricing, "mode") && !["free", "paid"].includes(pricing.mode)) {
        errors.push({ field: "pricing.mode", message: "Pricing mode must be free or paid" });
      }
      for (const key of ["price", "compareAtPrice", "salePrice"]) {
        if (!hasOwn(pricing, key)) continue;
        const amount = Number(pricing[key]);
        if (pricing[key] === "" || pricing[key] === null || !Number.isFinite(amount) || amount < 0) {
          errors.push({ field: `pricing.${key}`, message: `${key} must be a non-negative number` });
        }
      }
      if (hasOwn(pricing, "currency") && (typeof pricing.currency !== "string" || !/^[A-Za-z]{3}$/.test(pricing.currency.trim()))) {
        errors.push({ field: "pricing.currency", message: "Currency must be a three-letter code" });
      }
      const price = hasOwn(pricing, "price") ? Number(pricing.price) : undefined;
      const compareAtPrice = hasOwn(pricing, "compareAtPrice") ? Number(pricing.compareAtPrice) : undefined;
      const salePrice = hasOwn(pricing, "salePrice") ? Number(pricing.salePrice) : undefined;
      if (price !== undefined && compareAtPrice !== undefined && Number.isFinite(price) && Number.isFinite(compareAtPrice) && compareAtPrice > 0 && compareAtPrice < price) {
        errors.push({ field: "pricing.compareAtPrice", message: "Compare-at price must be greater than or equal to the base price" });
      }
      if (price !== undefined && salePrice !== undefined && Number.isFinite(price) && Number.isFinite(salePrice) && salePrice > 0 && salePrice >= price) {
        errors.push({ field: "pricing.salePrice", message: "Sale price must be lower than the base price" });
      }
      for (const key of ["saleEnabled"]) {
        if (hasOwn(pricing, key) && typeof pricing[key] !== "boolean") {
          errors.push({ field: `pricing.${key}`, message: `${key} must be a boolean` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

const PRICE_LIMIT = 1_000_000;

export function parsePricingFilters(input = {}) {
  const allowed = ["q", "category", "level", "mode", "status", "minPrice", "maxPrice", "page", "limit"];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error("Unsupported filter: " + key);
  const filters = {};
  for (const key of ["q", "category"]) {
    if (input[key] !== undefined && String(input[key]).trim()) filters[key] = String(input[key]).trim().slice(0, 100);
  }
  if (input.level !== undefined && input.level !== "") {
    if (!["Beginner", "Intermediate", "Advanced"].includes(input.level)) throw new Error("Invalid course level.");
    filters.level = input.level;
  }
  if (input.mode !== undefined && input.mode !== "") {
    if (!["free", "paid"].includes(input.mode)) throw new Error("Invalid pricing mode.");
    filters.mode = input.mode;
  }
  if (input.status !== undefined && input.status !== "") {
    if (!["published", "draft", "archived", "all"].includes(input.status)) throw new Error("Invalid course status.");
    filters.status = input.status;
  }
  for (const key of ["minPrice", "maxPrice"]) {
    if (input[key] !== undefined && input[key] !== "") {
      const n = Number(input[key]);
      if (!Number.isFinite(n) || n < 0 || n > PRICE_LIMIT) throw new Error(key + " must be between 0 and " + PRICE_LIMIT + ".");
      filters[key] = n;
    }
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    throw new Error("Minimum price cannot exceed maximum price.");
  }
  filters.page = Math.max(1, Math.trunc(Number(input.page) || 1));
  filters.limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit) || 25)));
  return filters;
}

export function buildCoursePricingFilter(filters) {
  const and = [{ deletedAt: null }];
  if (filters.q) {
    const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    and.push({ $or: [{ title: regex }, { category: regex }] });
  }
  if (filters.category) and.push({ category: filters.category });
  if (filters.level) and.push({ level: filters.level });
  if (filters.mode) and.push({ "pricing.mode": filters.mode });
  if (filters.status && filters.status !== "all") {
    if (filters.status === "published") and.push({ isPublished: true, status: "published" });
    else if (filters.status === "draft") and.push({ isPublished: false, status: { $ne: "archived" } });
    else and.push({ status: "archived" });
  }
  const price = {};
  if (filters.minPrice !== undefined) price.$gte = filters.minPrice;
  if (filters.maxPrice !== undefined) price.$lte = filters.maxPrice;
  if (Object.keys(price).length) and.push({ "pricing.price": price });
  return and.length === 1 ? and[0] : { $and: and };
}

export function validatePricingOperation(input = {}) {
  const allowed = ["type", "amount", "minPrice", "maxPrice", "saleHandling"];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error("Unsupported pricing operation field: " + key);
  const type = input.type;
  if (!["fixed", "percent_increase", "percent_decrease", "amount_increase", "amount_decrease", "set_free", "set_paid", "set_compare_at"].includes(type)) {
    throw new Error("Choose a supported pricing operation.");
  }
  const operation = { type, saleHandling: input.saleHandling || "preserve" };
  if (!["preserve", "clear", "adjust"].includes(operation.saleHandling)) throw new Error("Invalid sale-price handling.");
  if (["fixed", "percent_increase", "percent_decrease", "amount_increase", "amount_decrease", "set_paid", "set_compare_at"].includes(type)) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > PRICE_LIMIT) throw new Error("Amount must be between 0 and " + PRICE_LIMIT + ".");
    if (["percent_increase", "percent_decrease"].includes(type) && amount > 100) throw new Error("Percentage adjustments must be between 0 and 100.");
    operation.amount = amount;
  }
  for (const key of ["minPrice", "maxPrice"]) {
    if (input[key] !== undefined && input[key] !== "") {
      const n = Number(input[key]);
      if (!Number.isFinite(n) || n < 0 || n > PRICE_LIMIT) throw new Error(key + " must be between 0 and " + PRICE_LIMIT + ".");
      operation[key] = n;
    }
  }
  if (operation.minPrice !== undefined && operation.maxPrice !== undefined && operation.minPrice > operation.maxPrice) throw new Error("Minimum price cannot exceed maximum price.");
  return operation;
}

export function calculateNextPricing(pricing = {}, operation) {
  const before = {
    mode: pricing.mode === "paid" ? "paid" : "free",
    price: Math.max(0, Number(pricing.price) || 0),
    compareAtPrice: Math.max(0, Number(pricing.compareAtPrice) || 0),
    currency: String(pricing.currency || "INR").toUpperCase(),
    saleEnabled: Boolean(pricing.saleEnabled),
    salePrice: Math.max(0, Number(pricing.salePrice) || 0)
  };
  let price = before.price;
  let mode = before.mode;
  let compareAtPrice = before.compareAtPrice;
  if (operation.type === "set_free") { mode = "free"; price = 0; }
  else if (operation.type === "set_paid") { mode = "paid"; price = before.price > 0 ? before.price : (operation.amount || 0); }
  else if (operation.type === "set_compare_at") { if (operation.amount > 0 && operation.amount <= price) throw new Error("Comparison price must be greater than the base price, or zero to clear it."); compareAtPrice = operation.amount; }
  else if (operation.type === "fixed") { mode = operation.amount === 0 ? "free" : "paid"; price = operation.amount; }
  else if (operation.type === "percent_increase") { price = Math.round(price * (1 + operation.amount / 100)); mode = price === 0 ? "free" : "paid"; }
  else if (operation.type === "percent_decrease") { price = Math.round(price * (1 - operation.amount / 100)); mode = price === 0 ? "free" : "paid"; }
  else if (operation.type === "amount_increase") { price = Math.round(price + operation.amount); mode = price === 0 ? "free" : "paid"; }
  else if (operation.type === "amount_decrease") { price = Math.max(0, Math.round(price - operation.amount)); mode = price === 0 ? "free" : "paid"; }
  if (operation.minPrice !== undefined) price = Math.max(price, operation.minPrice);
  if (operation.maxPrice !== undefined) price = Math.min(price, operation.maxPrice);
  price = Math.round(price);
  if (mode === "free" || price === 0) { mode = "free"; price = 0; }
  else mode = "paid";
  let saleEnabled = before.saleEnabled;
  let salePrice = before.salePrice;
  if (operation.saleHandling === "clear") { saleEnabled = false; salePrice = 0; }
  else if (operation.saleHandling === "adjust" && saleEnabled) {
    salePrice = Math.min(salePrice, Math.max(0, price - 1));
    if (price <= 0 || salePrice <= 0) { saleEnabled = false; salePrice = 0; }
  } else if (saleEnabled && (price <= 0 || salePrice >= price)) {
    throw new Error("The resulting base price would invalidate an active sale. Choose clear/adjust sale handling or update the sale first.");
  }
  if (compareAtPrice > 0 && compareAtPrice < price) compareAtPrice = price;
  return { mode, price, compareAtPrice, currency: before.currency, saleEnabled, salePrice };
}

export function recommendBandPrice(course, profile) {
  const categoryKey = String(course.category || "").trim().toLowerCase();
  const level = String(course.level || "Beginner");
  const categoryBand = profile.categories?.find((item) => String(item.category || "").trim().toLowerCase() === categoryKey);
  const band = categoryBand?.levels?.[level] || profile.levels?.[level];
  if (!band) return { eligible: false, reason: "No price band configured for this category and level." };
  const min = Number(band.min);
  const max = Number(band.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || max > PRICE_LIMIT) {
    return { eligible: false, reason: "The configured price band is invalid." };
  }
  const current = Number(course.pricing?.price) || 0;
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const lessons = modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const projectCount = lessons.filter((lesson) => lesson?.type === "project").length;
  const depthAdjustment = modules.length * profile.depthAdjustmentPerModule;
  const projectAdjustment = projectCount * profile.projectAdjustment;
  const baseline = (min + max) / 2;
  const adjusted = Math.round(baseline * (1 + (depthAdjustment + projectAdjustment) / 100));
  const recommended = Math.round(Math.min(max, Math.max(min, adjusted)));
  const bandSource = categoryBand?.levels?.[level] ? "category " + course.category + " / " + level : level + " level";
  const adjustmentSummary = depthAdjustment + projectAdjustment > 0 ? " adjusted +" + Math.round((depthAdjustment + projectAdjustment) * 10) / 10 + "% for " + modules.length + " module(s) and " + projectCount + " project(s)" : " with no complexity adjustment";
  return {
    eligible: true,
    pricing: { mode: recommended === 0 ? "free" : "paid", price: recommended, compareAtPrice: Math.max(recommended, Number(course.pricing?.compareAtPrice) || 0), currency: String(course.pricing?.currency || "INR").toUpperCase(), saleEnabled: Boolean(course.pricing?.saleEnabled) && Number(course.pricing?.salePrice) < recommended, salePrice: Number(course.pricing?.salePrice) || 0 },
    explanation: "Uses " + bandSource + " band " + min + "–" + max + " INR; band-midpoint baseline " + Math.round(baseline) + " INR" + adjustmentSummary + "; final recommendation is clamped to the configured band.",
    factors: { moduleCount: modules.length, projectCount, depthAdjustmentPercent: depthAdjustment, projectAdjustmentPercent: projectAdjustment }
  };
}

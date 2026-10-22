import mongoose from "mongoose";
import { Course } from "../models/Course.js";
import { PricingBatch } from "../models/PricingBatch.js";
import { PricingRule } from "../models/PricingRule.js";
import { cacheDelete } from "../config/cache.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import {
  buildCoursePricingFilter, calculateNextPricing, parsePricingFilters,
  recommendBandPrice, validatePricingOperation
} from "../utils/coursePricing.js";

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_PREVIEW_COURSES = 500;

function actorId(req) {
  return req.user?.user?._id || req.user?.userId || null;
}
function pricingSnapshot(pricing = {}) {
  return {
    mode: pricing.mode === "paid" ? "paid" : "free",
    price: Math.max(0, Number(pricing.price) || 0),
    compareAtPrice: Math.max(0, Number(pricing.compareAtPrice) || 0),
    currency: String(pricing.currency || "INR").toUpperCase(),
    saleEnabled: Boolean(pricing.saleEnabled),
    salePrice: Math.max(0, Number(pricing.salePrice) || 0)
  };
}
function samePricing(a, b) {
  return JSON.stringify(pricingSnapshot(a)) === JSON.stringify(pricingSnapshot(b));
}
function safeError(error) {
  return error instanceof Error ? error.message : "Pricing operation failed.";
}
async function audit(req, action, targetId, before, after, reason = "") {
  const actor = actorId(req);
  if (!actor) return;
  await recordAuditEvent({
    actor, action, targetType: "CoursePricingBatch", targetId: String(targetId || ""),
    before, after, reason: String(reason || "").slice(0, 500),
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}
function buildProfile(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A pricing profile is required.");
  const allowed = ["levels", "categories"];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error("Unsupported profile field: " + key);
  const normalizeBand = (band) => {
    if (!band || typeof band !== "object") throw new Error("Each price band needs minimum and maximum values.");
    const min = Number(band.min);
    const max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || max > 1_000_000) throw new Error("Each price band must have valid prices between 0 and 1,000,000.");
    return { min: Math.round(min), max: Math.round(max) };
  };
  const profile = { levels: {}, categories: [] };
  for (const level of ["Beginner", "Intermediate", "Advanced"]) {
    if (input.levels?.[level] !== undefined) profile.levels[level] = normalizeBand(input.levels[level]);
  }
  if (input.levels && Object.keys(input.levels).some((key) => !["Beginner", "Intermediate", "Advanced"].includes(key))) throw new Error("Unsupported level in pricing profile.");
  if (input.categories !== undefined) {
    if (!Array.isArray(input.categories) || input.categories.length > 100) throw new Error("Category bands must be an array with at most 100 entries.");
    const seen = new Set();
    profile.categories = input.categories.map((entry) => {
      const category = String(entry?.category || "").trim().slice(0, 100);
      if (!category) throw new Error("Every category band requires a category.");
      const key = category.toLowerCase();
      if (seen.has(key)) throw new Error("Duplicate category band: " + category);
      seen.add(key);
      const levels = {};
      if (!entry.levels || typeof entry.levels !== "object" || Array.isArray(entry.levels)) throw new Error("Category bands need level-specific price bands.");
      for (const level of Object.keys(entry.levels)) {
        if (!["Beginner", "Intermediate", "Advanced"].includes(level)) throw new Error("Unsupported level in category band.");
        levels[level] = normalizeBand(entry.levels[level]);
      }
      return { category, levels };
    });
  }
  if (!Object.keys(profile.levels).length && !profile.categories.length) throw new Error("Configure at least one level or category price band.");
  return profile;
}

export async function listCourses(req, res, next) {
  try {
    const filters = parsePricingFilters(req.query);
    const filter = buildCoursePricingFilter(filters);
    const [courses, total, categories, counts] = await Promise.all([
      Course.find(filter).select("title slug category level isPublished status pricing updatedAt").sort({ category: 1, title: 1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
      Course.countDocuments(filter),
      Course.distinct("category", { deletedAt: null }),
      Promise.all([
        Course.countDocuments({ deletedAt: null }),
        Course.countDocuments({ deletedAt: null, "pricing.mode": "paid" }),
        Course.countDocuments({ deletedAt: null, "pricing.mode": "free" })
      ])
    ]);
    return success(res, { courses, total, page: filters.page, pages: Math.max(1, Math.ceil(total / filters.limit)), limit: filters.limit, categories: categories.filter(Boolean).sort(), summary: { total: counts[0], paid: counts[1], free: counts[2] } });
  } catch (error) { return failure(res, safeError(error), 400); }
}

export async function preview(req, res, next) {
  try {
    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is missing.", 401);
    const filters = parsePricingFilters(req.body?.filters || {});
    const filter = buildCoursePricingFilter(filters);
    const courses = await Course.find(filter).select("title category level status isPublished pricing updatedAt").sort({ category: 1, title: 1 }).limit(MAX_PREVIEW_COURSES + 1).lean();
    if (courses.length > MAX_PREVIEW_COURSES) return failure(res, "This operation matches more than 500 courses. Narrow the filters and preview again.", 400);
    const kind = req.body?.kind === "recommend" ? "recommend" : "bulk";
    let operation;
    let profile = {};
    if (kind === "bulk") operation = validatePricingOperation(req.body?.operation || {});
    else profile = buildProfile(req.body?.profile || {});
    const items = [];
    let skippedCount = 0;
    for (const course of courses) {
      try {
        const before = pricingSnapshot(course.pricing);
        let after;
        let explanation = "";
        if (kind === "recommend") {
          const recommendation = recommendBandPrice(course, profile);
          if (!recommendation.eligible) {
            items.push({ courseId: course._id, title: course.title, updatedAt: course.updatedAt, before, after: null, status: "skipped", note: recommendation.reason });
            skippedCount++;
            continue;
          }
          after = recommendation.pricing;
          explanation = recommendation.explanation;
        } else after = calculateNextPricing(course.pricing, operation);
        items.push({ courseId: course._id, title: course.title, updatedAt: course.updatedAt, before, after, status: "pending", note: explanation });
      } catch (error) {
        items.push({ courseId: course._id, title: course.title, updatedAt: course.updatedAt, before: pricingSnapshot(course.pricing), after: null, status: "skipped", note: safeError(error) });
        skippedCount++;
      }
    }
    const batch = await PricingBatch.create({
      kind: "preview", status: "preview", actor,
      operation: kind === "recommend" ? { type: "recommend" } : operation,
      filters: { ...filters, page: undefined, limit: undefined }, profile,
      items, matchedCount: courses.length, skippedCount,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS)
    });
    const publicItems = items.map((item) => ({
      courseId: String(item.courseId), title: item.title, updatedAt: item.updatedAt,
      before: item.before, after: item.after, status: item.status, note: item.note
    }));
    return success(res, {
      previewId: String(batch._id), kind, matchedCount: courses.length,
      eligibleCount: items.length - skippedCount, skippedCount,
      expiresAt: batch.expiresAt, items: publicItems
    }, "Pricing preview ready. No course prices have changed.");
  } catch (error) { return failure(res, safeError(error), 400); }
}

export async function applyPreview(req, res, next) {
  try {
    const actor = actorId(req);
    const previewId = String(req.body?.previewId || "");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!isValidObjectId(previewId)) return failure(res, "A valid preview ID is required.", 400);
    if (reason.length < 10 || reason.length > 500) return failure(res, "Provide a reason between 10 and 500 characters.", 400);
    const previewBatch = await PricingBatch.findOneAndUpdate(
      { _id: previewId, kind: "preview", status: "preview", actor, expiresAt: { $gt: new Date() } },
      { $set: { status: "applying", reason } }, { new: true }
    );
    if (!previewBatch) return failure(res, "This preview is expired, already used, or does not belong to your administrator account. Generate a new preview.", 409);
    let appliedCount = 0;
    let skippedCount = 0;
    for (const item of previewBatch.items) {
      if (item.status === "skipped" || !item.after) { skippedCount++; continue; }
      try {
        const course = await Course.findById(item.courseId);
        if (!course) { item.status = "skipped"; item.note = "Course no longer exists."; skippedCount++; continue; }
        if (new Date(course.updatedAt).getTime() !== new Date(item.updatedAt).getTime()) {
          item.status = "skipped"; item.note = "Course changed after preview; generate a fresh preview."; skippedCount++; continue;
        }
        const beforeNow = pricingSnapshot(course.pricing);
        if (!samePricing(beforeNow, item.before)) {
          item.status = "skipped"; item.note = "Current price differs from preview; generate a fresh preview."; skippedCount++; continue;
        }
        course.pricing = item.after;
        course.$locals.revisionContext = {
          actor, source: "admin", reason,
          summary: "Course pricing batch " + String(previewBatch._id)
        };
        await course.save();
        await cacheDelete("course:" + course._id);
        item.status = "applied";
        appliedCount++;
      } catch (error) {
        item.status = "skipped";
        item.note = safeError(error).slice(0, 500);
        skippedCount++;
      }
    }
    previewBatch.kind = "batch";
    previewBatch.status = appliedCount === 0 ? "applied" : skippedCount > 0 ? "partially_applied" : "applied";
    previewBatch.appliedCount = appliedCount;
    previewBatch.skippedCount = skippedCount;
    previewBatch.appliedAt = new Date();
    previewBatch.markModified("items");
    await previewBatch.save();
    await audit(req, "course.pricing.batch_applied", previewBatch._id,
      { matchedCount: previewBatch.matchedCount },
      { appliedCount, skippedCount, operation: previewBatch.operation, filters: previewBatch.filters }, reason);
    return success(res, { batchId: String(previewBatch._id), appliedCount, skippedCount, status: previewBatch.status }, appliedCount ? "Pricing batch processed. Review skipped courses for stale data or validation issues." : "No prices were changed because all eligible courses were skipped.");
  } catch (error) { next(error); }
}

export async function history(req, res, next) {
  try {
    const page = Math.max(1, Math.trunc(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(req.query.limit) || 20)));
    const [batches, total] = await Promise.all([
      PricingBatch.find({ kind: "batch" }).select("status actor reason operation filters profile matchedCount appliedCount skippedCount createdAt appliedAt rolledBackAt").populate("actor", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PricingBatch.countDocuments({ kind: "batch" })
    ]);
    return success(res, { batches, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) { next(error); }
}

export async function rollback(req, res, next) {
  try {
    const batchId = String(req.params.batchId || "");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!isValidObjectId(batchId)) return failure(res, "Invalid pricing batch ID.", 400);
    if (reason.length < 10 || reason.length > 500) return failure(res, "Provide a rollback reason between 10 and 500 characters.", 400);
    const batch = await PricingBatch.findOne({ _id: batchId, kind: "batch", status: { $in: ["applied", "partially_applied"] } });
    if (!batch) return failure(res, "Pricing batch cannot be rolled back.", 404);
    let rolledBackCount = 0;
    let skippedCount = 0;
    for (const item of batch.items) {
      if (item.status !== "applied" || !item.after) continue;
      try {
        const course = await Course.findById(item.courseId);
        if (!course || !samePricing(course.pricing, item.after)) {
          item.note = "Rollback skipped because the course price has changed since this batch.";
          skippedCount++;
          continue;
        }
        course.pricing = item.before;
        course.$locals.revisionContext = { actor: actorId(req), source: "rollback", reason, summary: "Rollback pricing batch " + String(batch._id) };
        await course.save();
        await cacheDelete("course:" + course._id);
        item.status = "rolled_back";
        rolledBackCount++;
      } catch (error) { item.note = safeError(error).slice(0, 500); skippedCount++; }
    }
    batch.status = "rolled_back";
    batch.rolledBackAt = new Date();
    batch.markModified("items");
    await batch.save();
    await audit(req, "course.pricing.batch_rolled_back", batch._id,
      { appliedCount: batch.appliedCount },
      { rolledBackCount, skippedCount }, reason);
    return success(res, { batchId: String(batch._id), rolledBackCount, skippedCount }, "Rollback finished. Courses changed after the original batch were left untouched.");
  } catch (error) { next(error); }
}


function validateRuleInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A pricing rule is required.");
  const allowed = ["name", "enabled", "autoApply", "priority", "filters", "operation"];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error("Unsupported pricing rule field: " + key);
  const name = String(input.name || "").trim();
  if (name.length < 3 || name.length > 120) throw new Error("Rule name must be between 3 and 120 characters.");
  const enabled = input.enabled === true;
  const autoApply = input.autoApply === true;
  if (autoApply && !enabled) throw new Error("Enable the rule before opting into automatic application.");
  const priority = Number(input.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 1 || priority > 10000) throw new Error("Priority must be an integer from 1 to 10000.");
  const rawFilters = input.filters || {};
  const filterAllowed = ["category", "level", "mode", "minPrice", "maxPrice"];
  for (const key of Object.keys(rawFilters)) if (!filterAllowed.includes(key)) throw new Error("Unsupported rule filter: " + key);
  const filters = {};
  if (rawFilters.category) filters.category = String(rawFilters.category).trim().slice(0, 100);
  if (rawFilters.level) {
    if (!["Beginner", "Intermediate", "Advanced"].includes(rawFilters.level)) throw new Error("Invalid rule level.");
    filters.level = rawFilters.level;
  }
  if (rawFilters.mode) {
    if (!["free", "paid"].includes(rawFilters.mode)) throw new Error("Invalid rule pricing mode.");
    filters.mode = rawFilters.mode;
  }
  for (const key of ["minPrice", "maxPrice"]) {
    if (rawFilters[key] !== undefined && rawFilters[key] !== null && rawFilters[key] !== "") {
      const value = Number(rawFilters[key]);
      if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error(key + " must be between 0 and 1,000,000.");
      filters[key] = value;
    }
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) throw new Error("Rule minimum price cannot exceed maximum price.");
  const operation = validatePricingOperation(input.operation || {});
  return { name, enabled, autoApply, priority, filters, operation };
}

export async function listRules(req, res, next) {
  try {
    const rules = await PricingRule.find().sort({ priority: 1, createdAt: 1 }).populate("actor", "name email").lean();
    return success(res, { rules });
  } catch (error) { next(error); }
}

export async function createRule(req, res, next) {
  try {
    const input = validateRuleInput(req.body);
    const rule = await PricingRule.create({ ...input, actor: actorId(req) });
    await audit(req, "course.pricing.rule_created", rule._id, null, { name: rule.name, enabled: rule.enabled, autoApply: rule.autoApply, priority: rule.priority, filters: rule.filters, operation: rule.operation }, "Pricing rule created");
    return success(res, { rule }, "Pricing rule created", 201);
  } catch (error) { return failure(res, safeError(error), 400); }
}

export async function updateRule(req, res, next) {
  try {
    if (!isValidObjectId(req.params.ruleId)) return failure(res, "Invalid pricing rule ID.", 400);
    const input = validateRuleInput(req.body);
    const rule = await PricingRule.findById(req.params.ruleId);
    if (!rule) return failure(res, "Pricing rule not found.", 404);
    const before = { name: rule.name, enabled: rule.enabled, autoApply: rule.autoApply, priority: rule.priority, filters: rule.filters, operation: rule.operation };
    rule.set(input);
    await rule.save();
    await audit(req, "course.pricing.rule_updated", rule._id, before, input, "Pricing rule updated");
    return success(res, { rule }, "Pricing rule updated");
  } catch (error) { return failure(res, safeError(error), 400); }
}

export async function deleteRule(req, res, next) {
  try {
    if (!isValidObjectId(req.params.ruleId)) return failure(res, "Invalid pricing rule ID.", 400);
    const rule = await PricingRule.findById(req.params.ruleId);
    if (!rule) return failure(res, "Pricing rule not found.", 404);
    const before = { name: rule.name, enabled: rule.enabled, autoApply: rule.autoApply };
    await rule.deleteOne();
    await audit(req, "course.pricing.rule_deleted", rule._id, before, null, "Pricing rule deleted");
    return success(res, { deleted: true }, "Pricing rule deleted");
  } catch (error) { next(error); }
}

export async function runEnabledRules(req, res, next) {
  try {
    const actor = actorId(req);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!actor) return failure(res, "Administrator identity is missing.", 401);
    if (reason.length < 10 || reason.length > 500) return failure(res, "Provide a reason between 10 and 500 characters.", 400);
    const rules = await PricingRule.find({ enabled: true, autoApply: true }).sort({ priority: 1, createdAt: 1 }).lean();
    if (!rules.length) return success(res, { appliedCount: 0, skippedCount: 0 }, "No enabled auto-apply rules are configured.");
    const courses = await Course.find({ deletedAt: null }).select("title category level status isPublished pricing updatedAt").sort({ _id: 1 }).limit(MAX_PREVIEW_COURSES + 1);
    if (courses.length > MAX_PREVIEW_COURSES) return failure(res, "Automatic rule execution is limited to 500 courses per run. Narrow rule filters and retry.", 409);
    let appliedCount = 0;
    let skippedCount = 0;
    const items = [];
    for (const course of courses) {
      const price = Number(course.pricing?.price) || 0;
      const rule = rules.find((candidate) => {
        const f = candidate.filters || {};
        return (!f.category || f.category === course.category) &&
          (!f.level || f.level === course.level) &&
          (!f.mode || f.mode === (course.pricing?.mode || "free")) &&
          (f.minPrice === undefined || f.minPrice === null || price >= f.minPrice) &&
          (f.maxPrice === undefined || f.maxPrice === null || price <= f.maxPrice);
      });
      if (!rule) continue;
      try {
        const before = pricingSnapshot(course.pricing);
        const after = calculateNextPricing(course.pricing, rule.operation);
        if (samePricing(before, after)) { skippedCount++; items.push({ courseId: String(course._id), title: course.title, rule: rule.name, status: "skipped", note: "Price already matches the rule." }); continue; }
        course.pricing = after;
        course.$locals.revisionContext = { actor, source: "admin", reason, summary: "Automatic pricing rule: " + rule.name };
        await course.save();
        await cacheDelete("course:" + course._id);
        appliedCount++;
        items.push({ courseId: String(course._id), title: course.title, rule: rule.name, status: "applied", before, after: pricingSnapshot(course.pricing) });
      } catch (error) {
        skippedCount++;
        items.push({ courseId: String(course._id), title: course.title, rule: rule.name, status: "skipped", note: safeError(error) });
      }
    }
    const batch = await PricingBatch.create({
      kind: "batch", status: skippedCount ? "partially_applied" : "applied", actor, reason,
      operation: { type: "enabled_auto_rules", ruleIds: rules.map((rule) => String(rule._id)) },
      filters: {}, profile: {}, items: items.map((item) => ({
        courseId: new mongoose.Types.ObjectId(item.courseId),
        title: item.title,
        updatedAt: new Date(),
        before: item.before || {},
        after: item.after || null,
        status: item.status === "applied" ? "applied" : "skipped",
        note: item.rule ? "Rule: " + item.rule + (item.note ? " — " + item.note : "") : item.note || ""
      })),
      matchedCount: items.length, appliedCount, skippedCount, appliedAt: new Date()
    });
    await audit(req, "course.pricing.auto_rules_applied", batch._id, { ruleCount: rules.length }, { appliedCount, skippedCount, rules: rules.map((rule) => rule.name) }, reason);
    return success(res, { batchId: String(batch._id), appliedCount, skippedCount, items }, "Enabled automatic pricing rules executed. Review the audit history for the result.");
  } catch (error) { next(error); }
}

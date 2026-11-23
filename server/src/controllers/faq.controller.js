import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { FAQItem } from "../models/FAQItem.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { DEFAULT_FAQS, FAQ_CATEGORIES, FAQ_CATEGORY_LABELS } from "../utils/faqContent.js";

const FAQ_STATUSES = new Set(["draft", "published", "archived"]);

function actorId(req) {
  return req.user?.userId || req.user?.user?._id || null;
}

function hasUnsafeControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
  }
  return false;
}

export function cleanFaqInput(body = {}) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.replace(/\r\n?/g, "\n").trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const displayOrder = body.displayOrder === undefined || body.displayOrder === ""
    ? 100
    : Number(body.displayOrder);
  const featured = body.featured === undefined ? false : body.featured;

  if (question.length < 8 || question.length > 220) {
    throw new Error("Question is required and must be between 8 and 220 characters.");
  }
  if (answer.length < 10 || answer.length > 6000) {
    throw new Error("Answer is required and must be between 10 and 6,000 characters.");
  }
  if (hasUnsafeControlCharacters(question) || hasUnsafeControlCharacters(answer)) {
    throw new Error("Question and answer must not contain unsupported control characters.");
  }
  if (!FAQ_CATEGORIES.includes(category)) {
    throw new Error("Choose a supported FAQ category.");
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10000) {
    throw new Error("Display order must be a whole number between 0 and 10,000.");
  }
  if (typeof featured !== "boolean") {
    throw new Error("Featured must be true or false.");
  }

  return { question, answer, category, displayOrder, featured };
}

function publicFaq(item) {
  return {
    id: String(item._id || item.key || ""),
    key: item.key,
    question: item.question,
    answer: item.answer,
    category: item.category,
    displayOrder: item.displayOrder,
    featured: Boolean(item.featured),
  };
}

function adminFaq(item) {
  return {
    ...publicFaq(item),
    status: item.status,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    publishedAt: item.publishedAt || null,
  };
}

async function audit(req, action, item, reason, before = null) {
  const snapshot = item ? {
    key: item.key,
    question: item.question,
    category: item.category,
    status: item.status,
    displayOrder: item.displayOrder,
    featured: Boolean(item.featured),
  } : null;

  await recordAuditEvent({
    actor: actorId(req),
    action,
    targetType: "FAQItem",
    targetId: item?._id ? String(item._id) : "starter-import",
    reason: String(reason || "").slice(0, 500),
    before,
    after: snapshot,
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
  });
}

function cleanReason(value, actionLabel) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    return { valid: false, message: `Enter a ${actionLabel} reason between 10 and 500 characters.` };
  }
  return { valid: true, reason };
}

export async function listPublic(_req, res, next) {
  try {
    const total = await FAQItem.countDocuments({});
    const items = total === 0
      ? DEFAULT_FAQS
      : await FAQItem.find({ status: "published" })
        .select("key question answer category displayOrder featured")
        .sort({ category: 1, displayOrder: 1, createdAt: 1 })
        .lean();

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, {
      faqs: items.map(publicFaq),
      categories: FAQ_CATEGORIES.map((value) => ({ value, label: FAQ_CATEGORY_LABELS[value] })),
      usingStarterContent: total === 0,
    });
  } catch (error) {
    return next(error);
  }
}

export async function listAdmin(_req, res, next) {
  try {
    const [items, total] = await Promise.all([
      FAQItem.find({})
        .select("key question answer category status displayOrder featured createdAt updatedAt publishedAt")
        .sort({ status: 1, category: 1, displayOrder: 1, updatedAt: -1 })
        .lean(),
      FAQItem.countDocuments({}),
    ]);
    return success(res, {
      faqs: items.map(adminFaq),
      categories: FAQ_CATEGORIES.map((value) => ({ value, label: FAQ_CATEGORY_LABELS[value] })),
      starterFaqsAvailable: total === 0,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createFaq(req, res, next) {
  try {
    const reasonResult = cleanReason(req.body?.reason, "change");
    if (!reasonResult.valid) return failure(res, reasonResult.message, 400);
    const input = cleanFaqInput(req.body);
    const actor = actorId(req);
    const item = await FAQItem.create({
      ...input,
      key: "faq-" + randomUUID(),
      status: "draft",
      createdBy: actor,
      updatedBy: actor,
    });
    await audit(req, "faq.created", item, reasonResult.reason);
    return success(res, { faq: adminFaq(item) }, "FAQ draft created.", 201);
  } catch (error) {
    if (error instanceof Error && !error.name.startsWith("Mongo")) return failure(res, error.message, 400);
    if (error?.code === 11000) return failure(res, "That FAQ could not be saved because its key already exists.", 409);
    return next(error);
  }
}

export async function updateFaq(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.faqId)) return failure(res, "Invalid FAQ ID.", 400);
    const item = await FAQItem.findById(req.params.faqId);
    if (!item) return failure(res, "FAQ not found.", 404);

    const reasonResult = cleanReason(req.body?.reason, "change");
    if (!reasonResult.valid) return failure(res, reasonResult.message, 400);
    const input = cleanFaqInput(req.body);
    const before = {
      key: item.key,
      question: item.question,
      category: item.category,
      status: item.status,
      displayOrder: item.displayOrder,
      featured: Boolean(item.featured),
    };
    Object.assign(item, input, { updatedBy: actorId(req) });
    await item.save();
    await audit(req, "faq.updated", item, reasonResult.reason, before);
    return success(res, { faq: adminFaq(item) }, "FAQ changes saved.");
  } catch (error) {
    if (error instanceof Error && !error.name.startsWith("Mongo")) return failure(res, error.message, 400);
    return next(error);
  }
}

export async function updateFaqStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.faqId)) return failure(res, "Invalid FAQ ID.", 400);
    const item = await FAQItem.findById(req.params.faqId);
    if (!item) return failure(res, "FAQ not found.", 404);

    const reasonResult = cleanReason(req.body?.reason, "status change");
    if (!reasonResult.valid) return failure(res, reasonResult.message, 400);
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!FAQ_STATUSES.has(status)) return failure(res, "Choose draft, published, or archived status.", 400);
    if (status === "published" && (!item.question.trim() || !item.answer.trim())) {
      return failure(res, "A question and answer are required before publishing.", 400);
    }

    const before = {
      key: item.key,
      question: item.question,
      category: item.category,
      status: item.status,
      displayOrder: item.displayOrder,
      featured: Boolean(item.featured),
    };
    item.status = status;
    item.updatedBy = actorId(req);
    if (status === "published") {
      item.publishedAt = new Date();
      item.publishedBy = actorId(req);
    }
    await item.save();
    await audit(req, "faq.status_changed", item, reasonResult.reason, before);
    return success(res, { faq: adminFaq(item) }, `FAQ marked as ${status}.`);
  } catch (error) {
    return next(error);
  }
}

export async function importStarterFaqs(req, res, next) {
  try {
    const reasonResult = cleanReason(req.body?.reason, "import");
    if (!reasonResult.valid) return failure(res, reasonResult.message, 400);
    const existingCount = await FAQItem.countDocuments({});
    if (existingCount > 0) {
      return failure(res, "Starter FAQs can only be imported when the FAQ library is empty.", 409);
    }

    const actor = actorId(req);
    const publishedAt = new Date();
    const items = await FAQItem.create(DEFAULT_FAQS.map((faq) => ({
      ...faq,
      status: "published",
      publishedAt,
      publishedBy: actor,
      createdBy: actor,
      updatedBy: actor,
    })));
    await recordAuditEvent({
      actor,
      action: "faq.starter_content_imported",
      targetType: "FAQItem",
      targetId: "starter-import",
      reason: reasonResult.reason,
      before: null,
      after: { importedCount: items.length, keys: items.map((item) => item.key) },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
    });
    return success(res, { faqs: items.map(adminFaq) }, "Starter FAQs imported and published.", 201);
  } catch (error) {
    if (error?.code === 11000) return failure(res, "Starter FAQs were imported by another administrator. Refresh the FAQ library.", 409);
    return next(error);
  }
}

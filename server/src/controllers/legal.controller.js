import mongoose from "mongoose";
import { LegalDocument } from "../models/LegalDocument.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categories = new Set(["privacy", "terms", "rules", "refunds", "cookies", "community", "other"]);

function cleanInput(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const category = typeof body.category === "string" ? body.category.trim().toLowerCase() : "other";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const documentUrl = typeof body.documentUrl === "string" ? body.documentUrl.trim() : "";
  const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : null;
  const revisionNote = typeof body.revisionNote === "string" ? body.revisionNote.trim() : "";
  if (!title || title.length > 180) throw new Error("Title is required and must be at most 180 characters.");
  if (!slugPattern.test(slug) || slug.length > 100) throw new Error("Use a URL slug with lowercase letters, numbers, and hyphens.");
  if (!categories.has(category)) throw new Error("Choose a supported document category.");
  if (summary.length > 500) throw new Error("Summary must be 500 characters or fewer.");
  if (!content || content.length > 50000) throw new Error("Document content is required and must be at most 50,000 characters.");
  if (documentUrl && (documentUrl.length > 2048 || !/^https:\/\//i.test(documentUrl))) throw new Error("Document URL must be a valid HTTPS URL.");
  if (effectiveAt && Number.isNaN(effectiveAt.getTime())) throw new Error("Effective date is invalid.");
  if (revisionNote.length > 500) throw new Error("Revision note must be 500 characters or fewer.");
  return { title, slug, category, summary, body: content, documentUrl, effectiveAt, revisionNote };
}

function actorId(req) { return req.user?.user?._id || req.user?.userId; }
function publicVersion(doc) {
  const versions = Array.isArray(doc.versions) ? doc.versions : [];
  const version = versions.find((item) => item.version === doc.currentVersion) || versions[versions.length - 1];
  if (!version) return null;
  return {
    slug: version.slug, category: version.category, title: version.title, summary: version.summary,
    body: version.body, documentUrl: version.documentUrl, effectiveAt: version.effectiveAt,
    version: version.version, publishedAt: version.publishedAt, updatedAt: version.publishedAt
  };
}
async function audit(req, action, doc, reason = "") {
  await recordAuditEvent({
    actor: actorId(req), action, targetType: "LegalDocument", targetId: String(doc._id),
    before: null, after: { slug: doc.slug, title: doc.title, isPublished: doc.isPublished, currentVersion: doc.currentVersion },
    reason: String(reason || "").slice(0, 500), ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}

export async function listPublic(_req, res, next) {
  try {
    const docs = await LegalDocument.find({ isPublished: true, isArchived: false }).sort({ category: 1, title: 1 }).lean();
    return success(res, { documents: docs.map((doc) => {
      const version = (doc.versions || []).find((item) => item.version === doc.currentVersion);
      return version ? { slug: version.slug, title: version.title, category: version.category, summary: version.summary, version: version.version, effectiveAt: version.effectiveAt, publishedAt: version.publishedAt } : null;
    }).filter(Boolean) });
  } catch (error) { next(error); }
}

export async function getPublic(req, res, next) {
  try {
    const doc = await LegalDocument.findOne({ publishedSlug: String(req.params.slug || "").toLowerCase(), isPublished: true, isArchived: false }).lean();
    const version = doc && publicVersion(doc);
    if (!version) return failure(res, "This policy document is not available.", 404);
    return success(res, { document: version });
  } catch (error) { next(error); }
}

export async function listAdmin(req, res, next) {
  try {
    const documents = await LegalDocument.find({ isArchived: false }).sort({ updatedAt: -1 }).lean();
    return success(res, { documents: documents.map((doc) => ({
      _id: doc._id, slug: doc.slug, title: doc.title, category: doc.category, summary: doc.summary,
      body: doc.body, documentUrl: doc.documentUrl, effectiveAt: doc.effectiveAt,
      isPublished: doc.isPublished, currentVersion: doc.currentVersion, publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt, revisionNote: doc.revisionNote,
      hasUnpublishedChanges: Boolean(doc.isPublished && (doc.body !== (doc.versions || []).find((v) => v.version === doc.currentVersion)?.body || doc.title !== (doc.versions || []).find((v) => v.version === doc.currentVersion)?.title))
    })) });
  } catch (error) { next(error); }
}

export async function createDraft(req, res, next) {
  try {
    const input = cleanInput(req.body);
    if (input.revisionNote.length < 10) return failure(res, "Enter a revision reason of at least 10 characters.", 400);
    const existing = await LegalDocument.findOne({ slug: input.slug });
    if (existing) return failure(res, "A document with this URL slug already exists.", 409);
    const actor = actorId(req);
    const document = await LegalDocument.create({ ...input, isPublished: false, createdBy: actor, updatedBy: actor });
    await audit(req, "legal_document.created", document, input.revisionNote);
    return success(res, { document }, "Draft created", 201);
  } catch (error) {
    if (error instanceof Error && !error.name.startsWith("Mongo")) return failure(res, error.message, 400);
    if (error?.code === 11000) return failure(res, "A document with this URL slug already exists.", 409);
    next(error);
  }
}

export async function updateDraft(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return failure(res, "Invalid document ID.", 400);
    const document = await LegalDocument.findOne({ _id: req.params.documentId, isArchived: false });
    if (!document) return failure(res, "Document not found.", 404);
    const input = cleanInput(req.body);
    const reason = input.revisionNote;
    if (reason.length < 10) return failure(res, "Enter a revision reason of at least 10 characters.", 400);
    if (input.slug !== document.slug) {
      const duplicate = await LegalDocument.findOne({ slug: input.slug, _id: { $ne: document._id } }).select("_id").lean();
      if (duplicate) return failure(res, "A document with this URL slug already exists.", 409);
    }
    Object.assign(document, input, { updatedBy: actorId(req) });
    await document.save();
    await audit(req, "legal_document.draft_updated", document, reason);
    return success(res, { document }, "Draft changes saved");
  } catch (error) {
    if (error instanceof Error && !error.name.startsWith("Mongo")) return failure(res, error.message, 400);
    next(error);
  }
}

export async function publish(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return failure(res, "Invalid document ID.", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "Enter a publish reason between 10 and 500 characters.", 400);
    const document = await LegalDocument.findOne({ _id: req.params.documentId, isArchived: false });
    if (!document) return failure(res, "Document not found.", 404);
    if (!document.title || !document.body.trim()) return failure(res, "A title and document content are required before publishing.", 400);
    const publishedAt = new Date();
    const version = Number(document.currentVersion || 0) + 1;
    document.versions.push({
      version, slug: document.slug, category: document.category, title: document.title, summary: document.summary, body: document.body,
      documentUrl: document.documentUrl, effectiveAt: document.effectiveAt, publishedAt,
      publishedBy: actorId(req), revisionNote: reason
    });
    document.currentVersion = version;
    document.publishedSlug = document.slug;
    document.isPublished = true;
    document.publishedAt = publishedAt;
    document.publishedBy = actorId(req);
    document.updatedBy = actorId(req);
    document.revisionNote = reason;
    await document.save();
    await audit(req, "legal_document.published", document, reason);
    return success(res, { document: publicVersion(document.toObject()) }, "Policy published");
  } catch (error) { next(error); }
}

export async function unpublish(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return failure(res, "Invalid document ID.", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "Enter an unpublish reason between 10 and 500 characters.", 400);
    const document = await LegalDocument.findOne({ _id: req.params.documentId, isArchived: false });
    if (!document) return failure(res, "Document not found.", 404);
    document.isPublished = false;
    document.updatedBy = actorId(req);
    document.revisionNote = reason;
    await document.save();
    await audit(req, "legal_document.unpublished", document, reason);
    return success(res, { document }, "Policy unpublished");
  } catch (error) { next(error); }
}

export async function archive(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return failure(res, "Invalid document ID.", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "Enter an archive reason between 10 and 500 characters.", 400);
    const document = await LegalDocument.findOne({ _id: req.params.documentId, isArchived: false });
    if (!document) return failure(res, "Document not found.", 404);
    document.isPublished = false;
    document.isArchived = true;
    document.updatedBy = actorId(req);
    document.revisionNote = reason;
    await document.save();
    await audit(req, "legal_document.archived", document, reason);
    return success(res, { archived: true }, "Policy archived");
  } catch (error) { next(error); }
}

export async function history(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return failure(res, "Invalid document ID.", 400);
    const document = await LegalDocument.findById(req.params.documentId).select("slug title versions currentVersion").lean();
    if (!document) return failure(res, "Document not found.", 404);
    return success(res, { slug: document.slug, versions: (document.versions || []).slice().reverse().map((version) => ({
      version: version.version, title: version.title, summary: version.summary, body: version.body,
      documentUrl: version.documentUrl, effectiveAt: version.effectiveAt, publishedAt: version.publishedAt,
      publishedBy: version.publishedBy, revisionNote: version.revisionNote, isCurrent: version.version === document.currentVersion
    })) });
  } catch (error) { next(error); }
}

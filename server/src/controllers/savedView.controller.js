import { z } from "zod";
import { SavedView } from "../models/SavedView.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";

const pageSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const viewIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
const scalarSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(100)).max(50)
]);
const filtersSchema = z.record(z.string().max(80), scalarSchema).refine((value) => Object.keys(value).length <= 30, "A view can contain at most 30 filter fields.");
const viewSchema = z.object({
  page: pageSchema,
  name: z.string().trim().min(1).max(40),
  filters: filtersSchema.default({}),
  columns: z.array(z.string().min(1).max(80)).max(50).default([]),
  sort: z.record(z.string().max(80), scalarSchema).default({}),
  density: z.enum(["compact", "comfortable"]).default("comfortable"),
  shared: z.boolean().default(false)
}).strict();

const updateSchema = viewSchema.partial().omit({ page: true }).strict();

function ownerId(req) {
  return req.user?.userId || req.user?.user?._id?.toString();
}

function viewDto(view) {
  return {
    id: String(view._id),
    owner: String(view.owner),
    page: view.page,
    name: view.name,
    filters: view.filters || {},
    columns: view.columns || [],
    sort: view.sort || {},
    density: view.density || "comfortable",
    shared: Boolean(view.shared),
    createdAt: view.createdAt,
    updatedAt: view.updatedAt
  };
}

async function audit(req, action, view, before = null, after = null) {
  const actor = ownerId(req);
  if (!actor) return;
  await recordAuditEvent({
    actor,
    action,
    targetType: "SavedView",
    targetId: String(view?._id || ""),
    before: before ? { page: before.page, name: before.name, shared: Boolean(before.shared) } : null,
    after: after ? { page: after.page, name: after.name, shared: Boolean(after.shared) } : null,
    reason: ""
  });
}

export async function listSavedViews(req, res, next) {
  try {
    const pageResult = pageSchema.safeParse(String(req.query.pageKey || ""));
    if (!pageResult.success) return failure(res, "A valid pageKey is required.", 400);
    const requestedPage = Number(req.query.page);
    const requestedLimit = Number(req.query.limit);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 100;
    const filter = { page: pageResult.data, $or: [{ owner: ownerId(req) }, { shared: true }] };
    const [views, total] = await Promise.all([
      SavedView.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SavedView.countDocuments(filter)
    ]);
    return success(res, { items: views.map((view) => ({ ...viewDto(view), canManage: String(view.owner) === String(ownerId(req)) })), total, page, limit });
  } catch (error) { return next(error); }
}

export async function createSavedView(req, res, next) {
  try {
    const parsed = viewSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, "Saved view data is invalid.", 400, parsed.error.flatten());
    const owner = ownerId(req);
    const duplicate = await SavedView.findOne({ owner, page: parsed.data.page, name: { $regex: new RegExp("^" + parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") } }).lean();
    if (duplicate) return failure(res, "A saved view with that name already exists for this page.", 409);
    const count = await SavedView.countDocuments({ owner, page: parsed.data.page });
    if (count >= 50) return failure(res, "You can save up to 50 views per page. Delete one before saving another.", 400);
    const view = await SavedView.create({ ...parsed.data, owner });
    await audit(req, "admin.saved_view.created", view, null, view);
    return success(res, { item: viewDto(view) }, "Saved view created.", 201);
  } catch (error) { return next(error); }
}

export async function updateSavedView(req, res, next) {
  try {
    if (!viewIdSchema.safeParse(req.params.viewId).success) return failure(res, "Invalid saved view ID.", 400);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, "Saved view data is invalid.", 400, parsed.error.flatten());
    const view = await SavedView.findOne({ _id: req.params.viewId, owner: ownerId(req) });
    if (!view) return failure(res, "Saved view not found or not owned by this administrator.", 404);
    if (parsed.data.name) {
      const duplicate = await SavedView.findOne({ _id: { $ne: view._id }, owner: ownerId(req), page: view.page, name: { $regex: new RegExp("^" + parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") } }).lean();
      if (duplicate) return failure(res, "A saved view with that name already exists for this page.", 409);
    }
    const before = { page: view.page, name: view.name, shared: view.shared };
    Object.assign(view, parsed.data);
    await view.save();
    await audit(req, "admin.saved_view.updated", view, before, view);
    return success(res, { item: viewDto(view) }, "Saved view updated.");
  } catch (error) { return next(error); }
}

export async function deleteSavedView(req, res, next) {
  try {
    if (!viewIdSchema.safeParse(req.params.viewId).success) return failure(res, "Invalid saved view ID.", 400);
    const view = await SavedView.findOne({ _id: req.params.viewId, owner: ownerId(req) });
    if (!view) return failure(res, "Saved view not found or not owned by this administrator.", 404);
    const before = { page: view.page, name: view.name, shared: view.shared };
    await view.deleteOne();
    await audit(req, "admin.saved_view.deleted", view, before, null);
    return success(res, { id: String(view._id) }, "Saved view deleted.");
  } catch (error) { return next(error); }
}

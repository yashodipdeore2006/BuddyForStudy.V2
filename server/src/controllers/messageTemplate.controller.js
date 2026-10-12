import { MessageTemplate } from "../models/MessageTemplate.js";
import { AuditLog } from "../models/AuditLog.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { sanitizeAuditSnapshot } from "../utils/auditSanitizer.js";

const channels = new Set(["notification", "email", "announcement"]);
const messageTypes = new Set(["system", "course", "billing", "promotion", "security"]);

function cleanString(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function templatePayload(body = {}) {
  const name = cleanString(body.name, 100);
  const key = cleanString(body.key, 100).toLowerCase();
  const channel = cleanString(body.channel, 30);
  const title = cleanString(body.title, 200);
  const subject = cleanString(body.subject, 200);
  const messageBody = typeof body.body === "string" ? body.body.trim().slice(0, 10000) : "";
  const messageType = cleanString(body.messageType, 30) || "system";
  const link = cleanString(body.link, 1000);
  if (!name) return { error: "Template name is required" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return { error: "Template key must use lowercase letters, numbers and hyphens" };
  if (!channels.has(channel)) return { error: "Choose a valid template channel" };
  if (!messageBody) return { error: "Template body is required" };
  if (channel !== "email" && !title) return { error: "Title is required for notifications and announcements" };
  if (channel === "email" && !subject) return { error: "Subject is required for email templates" };
  if (!messageTypes.has(messageType)) return { error: "Choose a valid message type" };
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") return { error: "isActive must be a boolean" };
  return { value: { name, key, channel, title, subject, body: messageBody, messageType, link, isActive: body.isActive !== false } };
}

async function auditTemplate(req, action, template, before = null, after = null) {
  await AuditLog.create({
    actor: req.user?.user?._id || null,
    action,
    targetType: "MessageTemplate",
    targetId: String(template?._id || ""),
    before: sanitizeAuditSnapshot(before),
    after: sanitizeAuditSnapshot(after),
    reason: "",
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}

function summary(template) {
  return {
    name: template.name, key: template.key, channel: template.channel,
    title: template.title, subject: template.subject, messageType: template.messageType,
    link: template.link, isActive: template.isActive
  };
}

export async function listMessageTemplates(req, res, next) {
  try {
    const templates = await MessageTemplate.find({}).sort({ channel: 1, name: 1 }).lean();
    return success(res, { templates });
  } catch (error) { next(error); }
}

export async function createMessageTemplate(req, res, next) {
  try {
    const parsed = templatePayload(req.body);
    if (parsed.error) return failure(res, parsed.error, 400);
    const template = await MessageTemplate.create({
      ...parsed.value,
      createdBy: req.user?.user?._id || null,
      updatedBy: req.user?.user?._id || null
    });
    await auditTemplate(req, "message_template.created", template, null, summary(template));
    return success(res, { template }, "Message template created", 201);
  } catch (error) {
    if (error?.code === 11000) return failure(res, "A template with this key already exists", 409);
    next(error);
  }
}

export async function updateMessageTemplate(req, res, next) {
  try {
    if (!isValidObjectId(req.params.templateId)) return failure(res, "Invalid templateId", 400);
    const parsed = templatePayload(req.body);
    if (parsed.error) return failure(res, parsed.error, 400);
    const template = await MessageTemplate.findById(req.params.templateId);
    if (!template) return failure(res, "Message template not found", 404);
    const before = summary(template);
    Object.assign(template, parsed.value, { updatedBy: req.user?.user?._id || null });
    await template.save();
    await auditTemplate(req, "message_template.updated", template, before, summary(template));
    return success(res, { template }, "Message template updated");
  } catch (error) {
    if (error?.code === 11000) return failure(res, "A template with this key already exists", 409);
    next(error);
  }
}

export async function deleteMessageTemplate(req, res, next) {
  try {
    if (!isValidObjectId(req.params.templateId)) return failure(res, "Invalid templateId", 400);
    const template = await MessageTemplate.findById(req.params.templateId);
    if (!template) return failure(res, "Message template not found", 404);
    const before = summary(template);
    await template.deleteOne();
    await auditTemplate(req, "message_template.deleted", template, before, null);
    return success(res, { deletedId: String(template._id) }, "Message template deleted");
  } catch (error) { next(error); }
}

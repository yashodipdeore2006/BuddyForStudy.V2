import { MessageTemplate } from "../models/MessageTemplate.js";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { mailRecipientAccepted } from "../services/notificationDeliveryOutcomes.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { sanitizeAuditSnapshot } from "../utils/auditSanitizer.js";
import { hasUnsafeEmailMarkup } from "../utils/safeHtml.js";

const channels = new Set(["notification", "email", "announcement"]);
const messageTypes = new Set(["system", "course", "billing", "promotion", "security"]);
export const DEFAULT_AUTOMATED_TEMPLATES = [
  { name: "Course purchase confirmed · In-app", key: "course-purchase-confirmed-in-app", channel: "notification", title: "Course purchase confirmed", body: "Payment of {{currency}} {{amount}} for {{courseTitle}} was verified on {{purchaseDate}}. Reference: {{paymentReference}}. Your enrollment is confirmed; open your roadmap to start learning.", messageType: "billing", link: "" },
  { name: "Course purchase confirmed · Email", key: "course-purchase-confirmed-email", channel: "email", subject: "Your BuddyForStudy course purchase is confirmed", body: "<h1>Course purchase confirmed</h1><p>Hi {{userName}}, your payment of <strong>{{currency}} {{amount}}</strong> for <strong>{{courseTitle}}</strong> was verified on {{purchaseDate}}.</p><p>Payment reference: <code>{{paymentReference}}</code></p><p>Your enrollment is confirmed. <a href=\"{{link}}\">Open your course roadmap</a> to start learning.</p>", messageType: "billing", link: "" },
  { name: "Subscription active · In-app", key: "subscription-activated-in-app", channel: "notification", title: "Your subscription is active", body: "Your {{planName}} plan is active with {{billingInterval}} billing. Payment of {{currency}} {{amount}} is confirmed. Current billing period: {{periodSummary}}.", messageType: "billing", link: "" },
  { name: "Subscription active · Email", key: "subscription-activated-email", channel: "email", subject: "Your BuddyForStudy subscription is active", body: "<h1>Your plan is active</h1><p>Hi {{userName}}, your <strong>{{planName}}</strong> plan is active with <strong>{{billingInterval}}</strong> billing. Payment of <strong>{{currency}} {{amount}}</strong> is confirmed.</p><p>Current billing period: <strong>{{periodSummary}}</strong>.</p><p><a href=\"{{link}}\">Manage your subscription</a>.</p>", messageType: "billing", link: "" },
  { name: "Subscription renewal · In-app", key: "subscription-payment-in-app", channel: "notification", title: "Subscription payment received", body: "Your subscription renewal payment of {{currency}} {{amount}} was received successfully.", messageType: "billing", link: "" },
  { name: "Subscription renewal · Email", key: "subscription-payment-email", channel: "email", subject: "Your BuddyForStudy subscription payment receipt", body: "<h1>Payment received</h1><p>Hi {{userName}}, your subscription renewal payment of <strong>{{currency}} {{amount}}</strong> was received successfully.</p><p><a href=\"{{link}}\">View your billing details</a>.</p>", messageType: "billing", link: "" },
  { name: "Payment failed · In-app", key: "payment-failed-in-app", channel: "notification", title: "Payment was not completed", body: "Your payment did not complete. Review your billing details and try again when you are ready.", messageType: "billing", link: "" },
  { name: "Payment failed · Email", key: "payment-failed-email", channel: "email", subject: "BuddyForStudy payment update", body: "<h1>Payment was not completed</h1><p>Hi {{userName}}, your recent payment did not complete.</p><p><a href=\"{{link}}\">Review billing and try again</a> when you are ready.</p>", messageType: "billing", link: "" },
  { name: "Learning reminder · In-app", key: "learning-reminder-in-app", channel: "notification", title: "Your next learning session is waiting", body: "Pick up where you left off in {{courseTitle}}. A short session today can keep your learning progress moving.", messageType: "system", link: "" },
  { name: "Learning reminder · Email", key: "learning-reminder-email", channel: "email", subject: "Your BuddyForStudy learning reminder", body: "<h1>Keep your learning momentum</h1><p>Hi {{userName}}, pick up where you left off in <strong>{{courseTitle}}</strong>.</p><p><a href=\"{{link}}\">Continue learning</a>. A short session today is a useful next step.</p>", messageType: "system", link: "" },
  { name: "Course completed · In-app", key: "course-completed-in-app", channel: "notification", title: "Congratulations on completing your course", body: "You completed {{courseTitle}}. Celebrate your progress and choose your next learning goal.", messageType: "course", link: "" },
  { name: "Course completed · Email", key: "course-completed-email", channel: "email", subject: "Congratulations on completing a BuddyForStudy course", body: "<h1>Course completed!</h1><p>Hi {{userName}}, congratulations on completing <strong>{{courseTitle}}</strong>.</p><p><a href=\"{{link}}\">Review your course</a> or choose your next learning goal.</p>", messageType: "course", link: "" },
  { name: "Free course enrolled · In-app", key: "free-course-enrolled-in-app", channel: "notification", title: "You're enrolled — let's start learning", body: "You have been added to {{courseTitle}}. Open your roadmap to choose the next lesson.", messageType: "course", link: "" },
  { name: "Free course enrolled · Email", key: "free-course-enrolled-email", channel: "email", subject: "You're enrolled in a BuddyForStudy course", body: "<h1>You're enrolled!</h1><p>Hi {{userName}}, you've been added to <strong>{{courseTitle}}</strong>.</p><p><a href=\"{{link}}\">Open the course roadmap</a> to start learning.</p>", messageType: "course", link: "" },
  { name: "Refund request received · In-app", key: "refund-requested-in-app", channel: "notification", title: "Refund request received", body: "We've received your refund request for {{currency}} {{amount}}. We'll review it and update you when the status changes.", messageType: "billing", link: "" },
  { name: "Refund request received · Email", key: "refund-requested-email", channel: "email", subject: "Your BuddyForStudy refund request was received", body: "<h1>Refund request received</h1><p>Hi {{userName}}, we received your refund request for <strong>{{currency}} {{amount}}</strong>.</p><p>We'll review it and notify you when its status changes. <a href=\"{{link}}\">View billing</a>.</p>", messageType: "billing", link: "" },
  { name: "Refund status · In-app", key: "refund-status-in-app", channel: "notification", title: "Your refund request was updated", body: "Your refund request for {{currency}} {{amount}} has been updated to {{status}}.", messageType: "billing", link: "" },
  { name: "Refund status · Email", key: "refund-status-email", channel: "email", subject: "Your BuddyForStudy refund request update", body: "<h1>Refund request update</h1><p>Hi {{userName}}, your refund request for <strong>{{currency}} {{amount}}</strong> is now marked <strong>{{status}}</strong>.</p><p><a href=\"{{link}}\">View your billing details</a>.</p>", messageType: "billing", link: "" },
  { name: "Subscription attention needed · In-app", key: "subscription-payment-action-in-app", channel: "notification", title: "Subscription payment needs attention", body: "Your subscription payment needs attention. Open billing to review the status and next steps.", messageType: "billing", link: "" },
  { name: "Subscription attention needed · Email", key: "subscription-payment-action-email", channel: "email", subject: "Action needed for your BuddyForStudy subscription", body: "<h1>Subscription payment needs attention</h1><p>Hi {{userName}}, your {{planName}} subscription needs attention.</p><p><a href=\"{{link}}\">Open billing</a> to review the current status and next steps.</p>", messageType: "billing", link: "" },
  { name: "Subscription cancellation scheduled · In-app", key: "subscription-cancel-scheduled-in-app", channel: "notification", title: "Subscription cancellation scheduled", body: "Your subscription will remain active until {{currentPeriodEnd}}.", messageType: "billing", link: "" },
  { name: "Subscription cancellation scheduled · Email", key: "subscription-cancel-scheduled-email", channel: "email", subject: "Your BuddyForStudy subscription cancellation is scheduled", body: "<h1>Cancellation scheduled</h1><p>Hi {{userName}}, your subscription is scheduled to end on <strong>{{currentPeriodEnd}}</strong>.</p><p><a href=\"{{link}}\">View billing details</a>.</p>", messageType: "billing", link: "" },
  { name: "Subscription ended · In-app", key: "subscription-ended-in-app", channel: "notification", title: "Your subscription period has ended", body: "Your subscription is now {{status}}. Review the available plans if you'd like to renew access.", messageType: "billing", link: "" },
  { name: "Subscription ended · Email", key: "subscription-ended-email", channel: "email", subject: "Your BuddyForStudy subscription status changed", body: "<h1>Subscription status update</h1><p>Hi {{userName}}, your subscription is now <strong>{{status}}</strong>.</p><p><a href=\"{{link}}\">Review available plans</a> if you'd like to renew access.</p>", messageType: "billing", link: "" },
  { name: "Subscription expiring · In-app", key: "subscription-expiring-in-app", channel: "notification", title: "Your subscription period is ending soon", body: "Your current billing period for {{planName}} ends on {{currentPeriodEnd}}. Review Billing for the latest renewal status or to manage your plan.", messageType: "billing", link: "" },
  { name: "Subscription expiring · Email", key: "subscription-expiring-email", channel: "email", subject: "Your BuddyForStudy billing period is ending soon", body: "<h1>Your billing period is ending soon</h1><p>Hi {{userName}}, your current billing period for <strong>{{planName}}</strong> ends on <strong>{{currentPeriodEnd}}</strong>.</p><p><a href=\"{{link}}\">Review billing</a> for the latest renewal status or to manage your plan.</p>", messageType: "billing", link: "" }
];

const LEGACY_DEFAULT_BODIES = new Map([
  ["course-purchase-confirmed-in-app", "Your payment for {{courseTitle}} was verified. Open your course roadmap when you are ready to start learning."],
  ["course-purchase-confirmed-email", "<h1>Course purchase confirmed</h1><p>Hi {{userName}}, your payment for <strong>{{courseTitle}}</strong> has been verified.</p><p><a href=\"{{link}}\">Open your course roadmap</a> to start learning.</p>"],
  ["subscription-activated-in-app", "Your {{planName}} plan is now active. Your subscription payment has been confirmed."],
  ["subscription-activated-email", "<h1>Your plan is active</h1><p>Hi {{userName}}, your <strong>{{planName}}</strong> plan is now active and your subscription payment is confirmed.</p><p><a href=\"{{link}}\">Manage your subscription</a>.</p>"]
]);

async function ensureDefaultAutomatedTemplates() {
  await Promise.all(DEFAULT_AUTOMATED_TEMPLATES.map(async (template) => {
    try {
      const legacyBody = LEGACY_DEFAULT_BODIES.get(template.key);
      if (legacyBody) {
        // Upgrade only untouched legacy defaults; keep administrator-edited templates intact.
        await MessageTemplate.updateOne({ key: template.key, body: legacyBody }, {
          $set: { body: template.body }
        });
      }
      await MessageTemplate.updateOne({ key: template.key }, {
        $setOnInsert: { ...template, isActive: true }
      }, { upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }));
}


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
  if (channel === "email" && hasUnsafeEmailMarkup(messageBody)) return { error: "Email template contains unsafe HTML tags, attributes, or URL schemes" };
  if (channel !== "email" && !title) return { error: "Title is required for notifications and announcements" };
  if (channel === "email" && !subject) return { error: "Subject is required for email templates" };
  if (!messageTypes.has(messageType)) return { error: "Choose a valid message type" };
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") return { error: "isActive must be a boolean" };
  return { value: { name, key, channel, title, subject, body: messageBody, messageType, link, isActive: body.isActive !== false } };
}

async function auditTemplate(req, action, template, before = null, after = null, reason = "") {
  return recordAuditEvent({
    actor: req.user?.user?._id || req.user?.userId || null,
    action,
    targetType: "MessageTemplate",
    targetId: String(template?._id || ""),
    before: sanitizeAuditSnapshot(before),
    after: sanitizeAuditSnapshot(after),
    reason: String(reason || "").trim().slice(0, 500),
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

const TEMPLATE_EVENT_USAGE = [
  { notification: "course-purchase-confirmed-in-app", email: "course-purchase-confirmed-email", event: "Paid course purchase confirmed", source: "billingNotificationPayloads.js" },
  { notification: "subscription-activated-in-app", email: "subscription-activated-email", event: "Subscription activated", source: "billingNotificationPayloads.js" },
  { notification: "subscription-expiring-in-app", email: "subscription-expiring-email", event: "Subscription expiry reminder", source: "notification.service.js" },
  { notification: "learning-reminder-in-app", email: "learning-reminder-email", event: "Learning reminder", source: "notification.service.js" },
  { notification: "course-completed-in-app", email: "course-completed-email", event: "Course completion", source: "progress.service.js" },
  { notification: "free-course-enrolled-in-app", email: "free-course-enrolled-email", event: "Free course enrollment", source: "enrollment.service.js" },
  { notification: "refund-status-in-app", email: "refund-status-email", event: "Refund status update / reconciliation", source: "adminPro.controller.js" },
  { notification: "payment-issue-status-updated-in-app", email: "payment-issue-status-updated-email", event: "Payment issue status update", source: "adminPro.controller.js" }
];

function getTemplateUsage(template) {
  return TEMPLATE_EVENT_USAGE.filter((entry) => entry[template.channel] === template.key).map((entry) => ({ event: entry.event, source: entry.source }));
}
const TEMPLATE_SAMPLE_DEFAULTS = {
  userName: "Alex Morgan", courseTitle: "Introduction to MERN Stack", planName: "Premium",
  amount: "1,299.00", currency: "INR", purchaseDate: "19 Oct 2026", paymentReference: "TEST-REF-12345",
  billingInterval: "monthly", currentPeriodStart: "19 Oct 2026", currentPeriodEnd: "19 Nov 2026",
  periodSummary: "19 Oct – 19 Nov 2026", status: "active", link: "/dashboard"
};

function findUnknownTemplatePlaceholders(template) {
  const source = [template?.title, template?.subject, template?.body].filter(Boolean).join("\\n");
  const keys = [...new Set([...source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))];
  return keys.filter((key) => !Object.keys(TEMPLATE_SAMPLE_DEFAULTS).some((name) => name.toLowerCase() === key.toLowerCase()));
}

function escapeTemplateHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function renderTemplatePreview(template, sampleData = {}) {
  const values = { ...TEMPLATE_SAMPLE_DEFAULTS };
  if (sampleData && typeof sampleData === "object" && !Array.isArray(sampleData)) {
    for (const key of Object.keys(TEMPLATE_SAMPLE_DEFAULTS)) {
      if (typeof sampleData[key] === "string") values[key] = sampleData[key].slice(0, 200);
    }
  }
  const rawLink = String(template.link || values.link || "/dashboard");
  values.link = /^https?:\/\//i.test(rawLink) ? rawLink : env.clientUrl.replace(/\/$/, "") + (rawLink.startsWith("/") ? rawLink : "/" + rawLink);
  const render = (source, html = false) => String(source || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const actual = Object.keys(values).find((name) => name.toLowerCase() === String(key).toLowerCase());
    const value = actual ? values[actual] : "";
    return html ? escapeTemplateHtml(value) : String(value);
  });
  const tokens = [...new Set([template.title, template.subject, template.body].join("\\n").match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)?.map((token) => token.replace(/\{\{|\}\}/g, "").trim()) || [])];
  const unknownPlaceholders = tokens.filter((key) => !Object.keys(TEMPLATE_SAMPLE_DEFAULTS).some((name) => name.toLowerCase() === key.toLowerCase()));
  return {
    channel: template.channel, title: render(template.title), subject: render(template.subject),
    body: render(template.body, template.channel === "email"), placeholders: tokens, unknownPlaceholders, sampleData: values
  };
}

export async function previewMessageTemplate(req, res, next) {
  try {
    let template;
    if (req.params.templateId) {
      if (!isValidObjectId(req.params.templateId)) return failure(res, "Invalid templateId", 400);
      template = await MessageTemplate.findById(req.params.templateId).lean();
      if (!template) return failure(res, "Message template not found", 404);
    } else {
      const parsed = templatePayload(req.body?.template || req.body || {});
      if (parsed.error) return failure(res, parsed.error, 400);
      template = parsed.value;
    }
    const preview = renderTemplatePreview(template, req.body?.sampleData || {});
    return success(res, { preview, valid: preview.unknownPlaceholders.length === 0, warning: preview.unknownPlaceholders.length ? "Replace unsupported placeholders before saving or sending this template." : "" });
  } catch (error) { next(error); }
}

export async function testSendMessageTemplate(req, res, next) {
  try {
    if (!isValidObjectId(req.params.templateId)) return failure(res, "Invalid templateId", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) return failure(res, "A reason between 10 and 500 characters is required", 400);
    const template = await MessageTemplate.findById(req.params.templateId);
    if (!template) return failure(res, "Message template not found", 404);
    const actorId = req.user?.user?._id || req.user?.userId;
    const actor = await User.findById(actorId).select("name email").lean();
    if (!actor?.email) { await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false, cause: "administrator_email_missing" }, reason); return failure(res, "The signed-in administrator must have a registered email address for test sends", 400); }
    const preview = renderTemplatePreview(template.toObject ? template.toObject() : template, { userName: actor.name || "Administrator" });
    if (preview.unknownPlaceholders.length) { await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false, unknownPlaceholders: preview.unknownPlaceholders }, reason); return failure(res, "Template has unsupported placeholders: " + preview.unknownPlaceholders.join(", "), 400); }
    if (template.channel === "email") {
      if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.mailFrom) { await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false, cause: "smtp_not_configured" }, reason); return failure(res, "SMTP is not configured for test email", 503); }
      if (hasUnsafeEmailMarkup(preview.body)) { await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false, cause: "unsafe_markup" }, reason); return failure(res, "Rendered email contains unsafe HTML markup", 400); }
      const transport = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure, auth: { user: env.smtpUser, pass: env.smtpPass } });
      try {
        const result = await transport.sendMail({ from: env.mailFrom, to: actor.email, subject: preview.subject || preview.title || "BuddyForStudy template test", text: String(preview.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), html: preview.body });
        if (!mailRecipientAccepted(result, actor.email)) throw new Error("SMTP did not confirm acceptance");
      } catch (error) {
        await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false }, reason);
        return failure(res, "The SMTP provider did not accept the test email. Check server delivery logs.", 502);
      } finally {
        if (typeof transport.close === "function") transport.close();
      }
    } else {
      try {
        await Notification.create({
          user: actorId, title: String(preview.title || template.name).slice(0, 200), message: String(preview.body || "").slice(0, 5000),
          type: template.channel === "announcement" ? "promotion" : (template.messageType || "system"),
          eventKey: "admin-template-test:" + template._id + ":" + randomUUID(), showInApp: true, link: template.link || "/notifications",
          emailStatus: "skipped", emailError: "Template test was sent in-app only", pushStatus: "skipped", pushError: "Template test was sent in-app only", sentBy: actorId,
          metadata: { source: "admin-template-test", templateId: String(template._id), requestedChannels: ["in_app"] }
        });
      } catch {
        await auditTemplate(req, "message_template.test_send_failed", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: false, cause: "in_app_persistence_failed" }, reason);
        return failure(res, "The in-app test notification could not be saved.", 500);
      }
    }
    const auditResult = await auditTemplate(req, "message_template.test_send", template, null, { channel: template.channel, destination: "signed-in administrator", accepted: true }, reason);
    return success(res, { accepted: true, channel: template.channel, destination: "signed-in administrator", auditRecorded: auditResult.recorded || auditResult.queued }, "Test message sent to your administrator account");
  } catch (error) { next(error); }
}
export async function listMessageTemplates(req, res, next) {
  try {
    await ensureDefaultAutomatedTemplates();
    const templates = await MessageTemplate.find({}).sort({ channel: 1, name: 1 }).lean();
    return success(res, { templates: templates.map((template) => ({ ...template, usedBy: getTemplateUsage(template) })) });
  } catch (error) { next(error); }
}

export async function createMessageTemplate(req, res, next) {
  try {
    const parsed = templatePayload(req.body);
    if (parsed.error) return failure(res, parsed.error, 400);
    const unknownPlaceholders = findUnknownTemplatePlaceholders(parsed.value);
    if (unknownPlaceholders.length) return failure(res, "Unsupported template placeholders: " + unknownPlaceholders.join(", "), 400);
    const template = await MessageTemplate.create({
      ...parsed.value,
      createdBy: req.user?.user?._id || null,
      updatedBy: req.user?.user?._id || null
    });
    const auditResult = await auditTemplate(req, "message_template.created", template, null, summary(template));
    return success(res, { template, auditLogRecorded: auditResult.recorded, auditQueued: auditResult.queued }, auditResult.recorded || auditResult.queued ? "Message template created" : "Message template created, but audit persistence failed", 201);
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
    const unknownPlaceholders = findUnknownTemplatePlaceholders(parsed.value);
    if (unknownPlaceholders.length) return failure(res, "Unsupported template placeholders: " + unknownPlaceholders.join(", "), 400);
    const template = await MessageTemplate.findById(req.params.templateId);
    if (!template) return failure(res, "Message template not found", 404);
    if (parsed.value.key !== template.key) return failure(res, "Template keys are immutable after creation. Create a new template for a new event key.", 409);
    const before = summary(template);
    Object.assign(template, { ...parsed.value, key: template.key, updatedBy: req.user?.user?._id || null });
    await template.save();
    const auditResult = await auditTemplate(req, "message_template.updated", template, before, summary(template));
    return success(res, { template, auditLogRecorded: auditResult.recorded, auditQueued: auditResult.queued }, auditResult.recorded || auditResult.queued ? "Message template updated" : "Message template updated, but audit persistence failed");
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
    const auditResult = await auditTemplate(req, "message_template.deleted", template, before, null);
    return success(res, { deletedId: String(template._id), auditLogRecorded: auditResult.recorded, auditQueued: auditResult.queued }, auditResult.recorded || auditResult.queued ? "Message template deleted" : "Message template deleted, but audit persistence failed");
  } catch (error) { next(error); }
}

import { MessageTemplate } from "../models/MessageTemplate.js";
import { AuditLog } from "../models/AuditLog.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { sanitizeAuditSnapshot } from "../utils/auditSanitizer.js";

const channels = new Set(["notification", "email", "announcement"]);
const messageTypes = new Set(["system", "course", "billing", "promotion", "security"]);
const DEFAULT_AUTOMATED_TEMPLATES = [
  { name: "Course purchase confirmed · In-app", key: "course-purchase-confirmed-in-app", channel: "notification", title: "Course purchase confirmed", body: "Your payment for {{courseTitle}} was verified. Open your course roadmap when you are ready to start learning.", messageType: "billing", link: "" },
  { name: "Course purchase confirmed · Email", key: "course-purchase-confirmed-email", channel: "email", subject: "Your BuddyForStudy course purchase is confirmed", body: "<h1>Course purchase confirmed</h1><p>Hi {{userName}}, your payment for <strong>{{courseTitle}}</strong> has been verified.</p><p><a href=\"{{link}}\">Open your course roadmap</a> to start learning.</p>", messageType: "billing", link: "" },
  { name: "Subscription active · In-app", key: "subscription-activated-in-app", channel: "notification", title: "Your subscription is active", body: "Your {{planName}} plan is now active. Your subscription payment has been confirmed.", messageType: "billing", link: "" },
  { name: "Subscription active · Email", key: "subscription-activated-email", channel: "email", subject: "Your BuddyForStudy subscription is active", body: "<h1>Your plan is active</h1><p>Hi {{userName}}, your <strong>{{planName}}</strong> plan is now active and your subscription payment is confirmed.</p><p><a href=\"{{link}}\">Manage your subscription</a>.</p>", messageType: "billing", link: "" },
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
  { name: "Subscription ended · Email", key: "subscription-ended-email", channel: "email", subject: "Your BuddyForStudy subscription status changed", body: "<h1>Subscription status update</h1><p>Hi {{userName}}, your subscription is now <strong>{{status}}</strong>.</p><p><a href=\"{{link}}\">Review available plans</a> if you'd like to renew access.</p>", messageType: "billing", link: "" }
];

async function ensureDefaultAutomatedTemplates() {
  await Promise.all(DEFAULT_AUTOMATED_TEMPLATES.map(async (template) => {
    try {
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
    await ensureDefaultAutomatedTemplates();
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

import { AuditOutbox } from "../models/AuditOutbox.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { Notification } from "../models/Notification.js";
import { Payment } from "../models/Payment.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { getTypedSettingsRegistry, validateTypedSetting } from "../utils/typedSettingsRegistry.js";
import { checkWorkerHeartbeat } from "../services/jobHeartbeat.service.js";
import { success } from "../utils/response.js";

export async function systemHealth(_req, res, next) {
  try {
    const now = new Date();
    const [worker, auditOutbox, failedWebhooks, processingWebhooks, failedEmails, pendingEmails, failedPush, pendingPush, settings] = await Promise.all([
      checkWorkerHeartbeat(now),
      AuditOutbox.countDocuments({ status: { $in: ["pending", "processing"] } }),
      WebhookEvent.countDocuments({ status: "failed" }),
      WebhookEvent.countDocuments({ status: "processing" }),
      Notification.countDocuments({ emailStatus: "failed" }),
      Notification.countDocuments({ emailStatus: "pending" }),
      Notification.countDocuments({ pushStatus: "failed" }),
      Notification.countDocuments({ pushStatus: "pending" }),
      PlatformSetting.find().select("key updatedAt").lean()
    ]);

    const integration = (keys) => ({ configured: keys.every((key) => Boolean(process.env[key])), missing: keys.filter((key) => !process.env[key]) });
    const integrationStatus = {
      razorpay: integration(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]),
      email: integration(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]),
      googleOAuth: integration(["GOOGLE_CLIENT_ID"]),
      geminiAI: integration(["GEMINI_API_KEY"]),
      youtube: integration(["YOUTUBE_API_KEY"]),
      redis: process.env.REDIS_URL ? { configured: true, missing: [] } : { configured: false, missing: ["REDIS_URL"] },
      webPush: integration(["WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_SUBJECT"]),
      sentry: process.env.SENTRY_DSN ? { configured: true, missing: [] } : { configured: false, missing: ["SENTRY_DSN"] },
      database: { connected: true }
    };

    return success(res, {
      checkedAt: now.toISOString(),
      overallStatus: worker.status === "healthy" && failedWebhooks === 0 && failedEmails === 0 && failedPush === 0 ? "healthy" : "needs_attention",
      worker,
      queues: {
        auditOutbox: { pendingOrProcessing: auditOutbox },
        webhooks: { failed: failedWebhooks, processing: processingWebhooks },
        emailDelivery: { pending: pendingEmails, failed: failedEmails },
        pushDelivery: { pending: pendingPush, failed: failedPush }
      },
      integrations: integrationStatus,
      configuration: { registeredSettings: settings.length, lastUpdatedAt: settings.reduce((latest, item) => item.updatedAt && (!latest || item.updatedAt > latest) ? item.updatedAt : latest, null) }
    });
  } catch (error) { next(error); }
}

export async function webhookEvents(req, res, next) {
  try {
    const statuses = ["failed", "processing", "processed"];
    const status = statuses.includes(String(req.query.status || "")) ? String(req.query.status) : "failed";
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.trunc(requestedLimit), 100) : 50;
    const events = await WebhookEvent.find({ status }).sort({ updatedAt: -1 }).limit(limit).lean();
    const items = await Promise.all(events.map(async (event) => {
      const clauses = [];
      if (event.providerPaymentId) clauses.push({ provider: "razorpay", providerPaymentId: event.providerPaymentId });
      if (event.providerOrderId) clauses.push({ provider: "razorpay", providerOrderId: event.providerOrderId });
      const payment = clauses.length ? await Payment.findOne({ $or: clauses }).select("_id amount currency status provider providerPaymentId providerOrderId createdAt").populate("user", "name").lean() : null;
      return { id: String(event._id), eventId: event.eventId, event: event.event, status: event.status, providerOrderId: event.providerOrderId || "", providerPaymentId: event.providerPaymentId || "", createdAt: event.createdAt, updatedAt: event.updatedAt, processedAt: event.processedAt, payment: payment ? { id: String(payment._id), amount: payment.amount, currency: payment.currency, status: payment.status, provider: payment.provider, providerPaymentId: payment.providerPaymentId, providerOrderId: payment.providerOrderId, createdAt: payment.createdAt, user: payment.user ? { name: payment.user.name } : null } : null };
    }));
    return success(res, { events: items, status, count: items.length });
  } catch (error) { next(error); }
}

export async function auditOutboxItems(req, res, next) {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.trunc(requestedLimit), 100) : 50;
    const items = await AuditOutbox.find({ status: { $in: ["pending", "processing"] } }).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(limit).lean();
    return success(res, { items: items.map((item) => ({ id: String(item._id), eventId: item.eventId, status: item.status, attempts: item.attempts, nextAttemptAt: item.nextAttemptAt, lastError: item.lastError, createdAt: item.createdAt, updatedAt: item.updatedAt, action: typeof item.event?.action === "string" ? item.event.action : "audit event", targetType: typeof item.event?.targetType === "string" ? item.event.targetType : "", targetId: typeof item.event?.targetId === "string" ? item.event.targetId : "" })) });
  } catch (error) { next(error); }
}

export async function deliveryLog(req, res, next) {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.trunc(requestedLimit), 100) : 50;
    const items = await Notification.find({ $or: [{ emailStatus: { $in: ["pending", "sent", "failed"] } }, { pushStatus: { $in: ["pending", "sent", "failed"] } }, { emailError: { $ne: "" } }, { pushError: { $ne: "" } }] }).populate("user", "name").sort({ updatedAt: -1 }).limit(limit).lean();
    return success(res, { deliveries: items.map((item) => ({ id: String(item._id), user: item.user ? { name: item.user.name } : null, title: item.title, type: item.type, createdAt: item.createdAt, updatedAt: item.updatedAt, emailStatus: item.emailStatus, emailAttempts: item.emailAttempts, emailSentAt: item.emailSentAt, emailError: item.emailError, pushStatus: item.pushStatus, pushAttempts: item.pushAttempts, pushSentAt: item.pushSentAt, pushError: item.pushError })) });
  } catch (error) { next(error); }
}

export async function typedSettingsRegistry(_req, res, next) {
  try {
    const registry = getTypedSettingsRegistry();
    const keys = registry.map((item) => item.key);
    const stored = await PlatformSetting.find({ key: { $in: keys } }).select("key updatedAt value").lean();
    const byKey = new Map(stored.map((item) => [item.key, item]));
    return success(res, { settings: registry.map((definition) => {
      const current = byKey.get(definition.key);
      const value = current?.value;
      const valueMatchesType = value === undefined ? false : validateTypedSetting(definition.key, value).valid;
      return { ...definition, configured: Boolean(current), valueMatchesType, updatedAt: current?.updatedAt || null };
    }) });
  } catch (error) { next(error); }
}

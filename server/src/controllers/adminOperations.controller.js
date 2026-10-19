import { JobHeartbeat } from "../models/JobHeartbeat.js";
import { AuditOutbox } from "../models/AuditOutbox.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { Notification } from "../models/Notification.js";
import { Payment } from "../models/Payment.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
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

    const integrationStatus = {
      razorpay: {
        configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET),
        missing: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"].filter((key) => !process.env[key])
      },
      email: {
        configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
        missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((key) => !process.env[key])
      },
      database: { connected: true }
    };

    return success(res, {
      checkedAt: now.toISOString(),
      overallStatus: worker.status === "healthy" && failedWebhooks === 0 ? "healthy" : "needs_attention",
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

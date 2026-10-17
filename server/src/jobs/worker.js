import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { UserSubscription } from "../models/UserSubscription.js";
import "../models/Course.js";
import { Payment } from "../models/Payment.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";
import { deliverPendingNotificationEmails, deliverPendingNotificationPush, processLearningReminders, reconcilePendingCoursePurchaseNotifications, reconcilePendingSubscriptionActivationNotifications, processSubscriptionExpiryReminders } from "../services/notification.service.js";

const intervalMs = 15 * 60 * 1000;
let maintenanceInProgress = false;
let stopping = false;
let intervalHandle;

async function runMaintenance() {
  if (maintenanceInProgress || stopping) {
    console.info("[worker] maintenance run skipped because another run is active or shutdown has started");
    return;
  }

  maintenanceInProgress = true;
  const startedAt = Date.now();

  try {
    const now = new Date();
    const [subscriptions, payments] = await Promise.all([
      UserSubscription.updateMany(
        { status: { $in: ["trialing", "active", "past_due"] }, currentPeriodEnd: { $lt: now } },
        { $set: { status: "expired" } }
      ),
      Payment.updateMany(
        { status: { $in: ["created", "pending"] }, createdAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        { $set: { status: "cancelled" } }
      )
    ]);
    const notificationJobs = await Promise.allSettled([
      deliverPendingNotificationEmails(50),
      deliverPendingNotificationPush(50),
      processLearningReminders(now, 500),
      reconcilePendingCoursePurchaseNotifications(now, 100),
      reconcilePendingSubscriptionActivationNotifications(now, 100),
      processSubscriptionExpiryReminders(now)
    ]);
    const notificationJobNames = [
      "email-delivery",
      "push-delivery",
      "learning-reminders",
      "course-purchase-reconciliation",
      "subscription-activation-reconciliation",
      "subscription-expiry-reminders"
    ];
    for (let index = 0; index < notificationJobs.length; index += 1) {
      const result = notificationJobs[index];
      const jobName = notificationJobNames[index] || `notification-job-${index + 1}`;
      const itemFailures = result.status === "fulfilled"
        ? Math.max(0, Number(result.value?.failures) || 0)
        : 1;
      const jobFailed = result.status === "rejected" || itemFailures > 0;
      const alertKey = `notification-job-${jobName}-failure`;

      if (jobFailed) {
        const errorMessage = result.status === "rejected"
          ? String(result.reason?.message || "Unknown notification job error").slice(0, 500)
          : `The job reported ${itemFailures} item-level failure(s).`;
        await recordOperationalAlert({
          key: alertKey,
          severity: "critical",
          source: `notification-worker:${jobName}`,
          message: `${jobName} failed: ${errorMessage}`
        });
        console.error("[worker] notification job failed", {
          job: jobName,
          failures: itemFailures,
          message: errorMessage
        });
      } else {
        await resolveOperationalAlert(alertKey);
      }
    }
    await resolveOperationalAlert("background-maintenance-failure");
    console.info(`[worker] maintenance completed in ${Date.now() - startedAt}ms; subscriptions expired=${subscriptions.modifiedCount}; stale payments cancelled=${payments.modifiedCount}; notification jobs=${notificationJobs.map((item) => item.status).join(",")}`);
  } catch (error) {
    // Do not dump provider payloads or raw objects into logs; the message is bounded.
    try {
      await recordOperationalAlert({ key: "background-maintenance-failure", severity: "critical", source: "background-worker", message: `Maintenance failed: ${String(error?.message || "Unknown error").slice(0, 700)}` });
    } catch (alertError) {
      console.error("[worker] failed to persist operational alert", { name: alertError?.name || "Error", code: alertError?.code });
    }
    console.error("[worker] maintenance failed", {
      name: error?.name || "Error",
      message: String(error?.message || "Unknown maintenance error").slice(0, 500),
      code: error?.code
    });
  } finally {
    maintenanceInProgress = false;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] received ${signal}; stopping maintenance scheduler`);
  if (intervalHandle) clearInterval(intervalHandle);
  try {
    while (maintenanceInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await mongoose.disconnect();
    console.info("[worker] database connection closed");
    process.exitCode = 0;
  } catch (error) {
    console.error("[worker] shutdown failed", { name: error?.name || "Error", code: error?.code });
    process.exitCode = 1;
  }
}

await connectDatabase();
await runMaintenance();
intervalHandle = setInterval(() => void runMaintenance(), intervalMs);
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
console.info("[worker] background maintenance worker started");

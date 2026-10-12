import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";
import { recordOperationalAlert, resolveOperationalAlert } from "../models/OperationalAlert.js";

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
    await resolveOperationalAlert("background-maintenance-failure");
    console.info(`[worker] maintenance completed in ${Date.now() - startedAt}ms; subscriptions expired=${subscriptions.modifiedCount}; stale payments cancelled=${payments.modifiedCount}`);
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

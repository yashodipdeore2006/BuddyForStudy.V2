import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { Payment } from "../models/Payment.js";

const intervalMs = 15 * 60 * 1000;

async function runMaintenance() {
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
  console.log(`[worker] subscriptions expired=${subscriptions.modifiedCount} stale payments cancelled=${payments.modifiedCount}`);
}

await connectDatabase(env.mongoUri);
await runMaintenance();
setInterval(() => runMaintenance().catch((error) => console.error("[worker]", error)), intervalMs);
console.log("[worker] background maintenance worker started");

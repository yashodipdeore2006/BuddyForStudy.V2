import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { getUserNotificationPreferences, createNotificationEvent } from "../services/notification.service.js";
import { PushSubscription } from "../models/PushSubscription.js";

const targetEmail = String(process.argv[2] || "").trim().toLowerCase();
if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
  console.error("Usage: npm run test:notification-channels -- <registered-user-email>");
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(env.mongoUri);
    const user = await User.findOne({ email: targetEmail, isActive: true }).select("_id name email").lean();
    if (!user) throw new Error("No active account found for that email.");

    const preferences = await getUserNotificationPreferences(user._id);
    const pushSubscriptions = await PushSubscription.countDocuments({ user: user._id, active: true });
    const eventKey = `manual-channel-test-${new Date().toISOString()}-${String(user._id)}`;
    const title = "BuddyForStudy notification channel test";
    const message = `This is a test message for ${user.name || "your account"}. Check your email, in-app notifications, and browser push if each channel is configured and enabled.`;

    const notification = await createNotificationEvent({
      userId: user._id,
      title,
      message,
      type: "system",
      link: "/settings",
      eventKey,
      emailSubject: title,
      email: true,
      inApp: true,
      push: true,
      metadata: { test: true, testRunAt: new Date().toISOString() }
    });

    if (!notification) throw new Error("Notification event could not be created.");

    // Delivery is dispatched asynchronously by createNotificationEvent.
    // Poll only this test event; never drain the global pending-delivery queue.
    const deadline = Date.now() + 30000;
    let latest = null;
    while (Date.now() < deadline) {
      latest = await Notification.findById(notification._id)
        .select("showInApp emailStatus emailError emailSentAt pushStatus pushError pushSentAt")
        .lean();
      const emailDone = latest && latest.emailStatus !== "pending";
      const pushDone = latest && latest.pushStatus !== "pending";
      if (emailDone && pushDone) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const report = {
      recipient: user.email,
      notificationId: String(notification._id),
      inApp: latest?.showInApp ? "created" : "not created",
      email: {
        status: latest?.emailStatus || "unknown",
        sentAt: latest?.emailSentAt || null,
        reason: latest?.emailError || ""
      },
      push: {
        status: latest?.pushStatus || "unknown",
        sentAt: latest?.pushSentAt || null,
        reason: latest?.pushError || ""
      },
      accountPushPreferenceEnabled: preferences.pushEnabled === true,
      activeBrowserSubscriptions: pushSubscriptions,
      note: "A status of sent means the provider accepted the message; it does not guarantee inbox placement or that the operating system displayed the push."
    };
    console.log(JSON.stringify(report, null, 2));

    if (latest?.emailStatus === "failed" || latest?.pushStatus === "failed") process.exitCode = 1;
  } catch (error) {
    console.error("[notification-channel-test]", error?.message || error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

import webPush from "web-push";
import { env } from "../config/env.js";

let configuredKeyFingerprint = "";

export function isWebPushConfigured(config = env) {
  return Boolean(
    config.webPushVapidPublicKey &&
    config.webPushVapidPrivateKey &&
    config.webPushSubject
  );
}

export function getWebPushPublicKey() {
  return isWebPushConfigured() ? env.webPushVapidPublicKey : "";
}

function configureWebPush() {
  if (!isWebPushConfigured()) {
    const error = new Error("Web Push VAPID keys are not configured on the server.");
    error.status = 503;
    throw error;
  }

  const fingerprint = [
    env.webPushSubject,
    env.webPushVapidPublicKey,
    env.webPushVapidPrivateKey
  ].join(":");

  if (fingerprint !== configuredKeyFingerprint) {
    webPush.setVapidDetails(
      env.webPushSubject,
      env.webPushVapidPublicKey,
      env.webPushVapidPrivateKey
    );
    configuredKeyFingerprint = fingerprint;
  }
}

export async function sendWebPushNotification(subscription, payload) {
  configureWebPush();

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const error = new Error("Push subscription is missing an endpoint or encryption keys.");
    error.status = 400;
    throw error;
  }

  const notificationPayload = {
    title: String(payload?.title || "BuddyForStudy update").slice(0, 200),
    body: String(payload?.body || "").slice(0, 1500),
    url: String(payload?.url || "/notifications"),
    notificationId: String(payload?.notificationId || "")
  };

  return webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    },
    JSON.stringify(notificationPayload),
    { TTL: 60, urgency: "normal" }
  );
}

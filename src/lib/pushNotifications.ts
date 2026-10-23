import { apiFetch } from "@/lib/api";

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) {
    throw new Error("This browser does not support browser push notifications.");
  }
  if (!window.isSecureContext) {
    throw new Error("Browser push requires HTTPS (localhost is supported for local testing).");
  }
  await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  await apiFetch("/api/notifications/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      ...subscription.toJSON(),
      userAgent: navigator.userAgent.slice(0, 500)
    })
  });
}

export async function enableBrowserPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("This browser does not support browser push notifications.");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted. Allow notifications in your browser settings and try again.");
  }

  const keyResult = await apiFetch("/api/notifications/push/public-key");
  const publicKey = String(keyResult.publicKey || "");
  if (!publicKey) throw new Error("The server did not provide a Web Push public key.");

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const existingKey = subscription.options?.applicationServerKey;
    if (existingKey) {
      const existingKeyBytes = new Uint8Array(existingKey);
      const currentEncodedKey = btoa(String.fromCharCode(...existingKeyBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      if (currentEncodedKey !== publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
    });
  }

  await saveSubscription(subscription);
}

export async function hasBrowserPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}

export async function syncBrowserPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await saveSubscription(subscription);
}

export async function disableBrowserPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  let serverError: unknown = null;
  try {
    await apiFetch("/api/notifications/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
  } catch (error) {
    serverError = error;
  }

  await subscription.unsubscribe();
  if (serverError) {
    throw new Error("Push was disabled in this browser, but the server could not update its subscription. Save preferences again after reconnecting.");
  }
}

export async function logoutBrowserPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  try {
    await apiFetch("/api/notifications/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}

export async function sendTestBrowserPushNotification(): Promise<{ attempted: number; sent: number; failed: number }> {
  return apiFetch("/api/notifications/push/test", { method: "POST", body: JSON.stringify({}) });
}

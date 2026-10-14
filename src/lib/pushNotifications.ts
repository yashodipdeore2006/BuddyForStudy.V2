let initializedAppId = "";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void | Promise<void>>;
    __buddyForStudyOneSignalScript?: boolean;
  }
}

function loadOneSignalScript(): Promise<void> {
  if (window.__buddyForStudyOneSignalScript) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-bfs-onesignal="true"]');
  if (existing?.dataset.loaded === "true") {
    window.__buddyForStudyOneSignalScript = true;
    return Promise.resolve();
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.async = true;
    script.dataset.bfsOnesignal = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      window.__buddyForStudyOneSignalScript = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Unable to load the push notification provider. Check your network or content-security policy."));
    if (!existing) document.head.appendChild(script);
  });
}

function withOneSignal<T>(callback: (oneSignal: any) => Promise<T>): Promise<T> {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred!.push(async (oneSignal: any) => {
      try {
        resolve(await callback(oneSignal));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ensureInitialized(oneSignal: any, appId: string): Promise<void> {
  if (initializedAppId && initializedAppId !== appId) {
    throw new Error("A different push-notification app is already initialized in this tab.");
  }
  if (!initializedAppId) {
    await oneSignal.init({
      appId,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js"
    });
    initializedAppId = appId;
  }
}

// Restores the logged-in user's OneSignal identity without requesting browser permission.
export async function identifyBrowserPush(userId: string, appId: string): Promise<void> {
  if (!userId || !appId) return;
  const operation = withOneSignal(async (oneSignal) => {
    await ensureInitialized(oneSignal, appId);
    await oneSignal.login(String(userId));
  });
  await loadOneSignalScript();
  await operation;
}

// Remove the account alias at logout so a shared browser cannot stay linked to the previous account.
export async function logoutBrowserPush(appId: string): Promise<void> {
  if (!appId) return;
  const operation = withOneSignal(async (oneSignal) => {
    await ensureInitialized(oneSignal, appId);
    if (typeof oneSignal.logout !== "function") {
      throw new Error("This OneSignal SDK build does not support logout.");
    }
    await oneSignal.logout();
  });
  await loadOneSignalScript();
  await operation;
}

export async function enableBrowserPush(userId: string, appId: string): Promise<void> {
  if (!appId) throw new Error("Push notifications are not configured. Set VITE_ONESIGNAL_APP_ID in the frontend environment.");
  if (!userId) throw new Error("Sign in again before enabling notifications.");
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("This browser does not support web push notifications.");
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  const operation = withOneSignal(async (oneSignal) => {
    await ensureInitialized(oneSignal, appId);
    await oneSignal.login(String(userId));
    await oneSignal.Notifications.requestPermission();
    if (Notification.permission !== "granted") {
      throw new Error("Notification permission was not granted in the browser.");
    }
    await oneSignal.User.PushSubscription.optIn();
  });

  await loadOneSignalScript();
  await operation;
}

export async function disableBrowserPush(userId: string): Promise<void> {
  if (!userId || !window.__buddyForStudyOneSignalScript) return;
  await withOneSignal(async (oneSignal) => {
    await oneSignal.login(String(userId));
    await oneSignal.User.PushSubscription.optOut();
  });
}

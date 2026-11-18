const PROGRESS_SYNC_TAG = "bfs-progress-sync";

export async function registerApplicationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) || !window.isSecureContext) {
    return null;
  }

  return navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
}

/**
 * Best-effort browser Background Sync registration. Browsers without the
 * Background Sync API still receive the app's foreground "online" trigger.
 */
export async function requestBrowserProgressBackgroundSync(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (!syncRegistration.sync?.register) return false;
    await syncRegistration.sync.register(PROGRESS_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

export function subscribeToProgressSyncRequests(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleWindowRequest = () => handler();
  const handleOnline = () => handler();
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === "BFS_PROGRESS_SYNC_REQUESTED") handler();
  };

  window.addEventListener("bfs:progress-sync-requested", handleWindowRequest);
  window.addEventListener("online", handleOnline);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }

  return () => {
    window.removeEventListener("bfs:progress-sync-requested", handleWindowRequest);
    window.removeEventListener("online", handleOnline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    }
  };
}

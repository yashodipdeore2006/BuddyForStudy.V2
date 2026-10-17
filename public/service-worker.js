self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = String(payload.title || "BuddyForStudy update");
  const body = String(payload.body || "You have a new notification.");
  const notificationId = String(payload.notificationId || "");
  const url = (() => {
    try {
      const target = new URL(String(payload.url || "/notifications"), self.location.origin);
      return target.origin === self.location.origin
        ? target.pathname + target.search + target.hash
        : "/notifications";
    } catch {
      return "/notifications";
    }
  })();

  event.waitUntil(self.registration.showNotification(title, {
    body,
    data: { url, notificationId },
    tag: notificationId ? "buddyforstudy-" + notificationId : undefined,
    renotify: false
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = String(event.notification.data?.url || "/notifications");
  let targetUrl = self.location.origin + "/notifications";
  try {
    const target = new URL(targetPath, self.location.origin);
    if (target.origin === self.location.origin) targetUrl = target.href;
  } catch {}

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client && client.url !== targetUrl) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

/**
 * Keep a confirmed billing state transition successful when an optional
 * notification transport is unavailable. The caller is responsible for
 * invoking this only after the durable billing write succeeds.
 */
export async function sendBillingNotificationSafely(payload, context, notify) {
  try {
    return await notify(payload);
  } catch (error) {
    console.error("[notifications] billing event notice failed", {
      context,
      message: String(error?.message || "Unknown notification error").slice(0, 200)
    });
    return null;
  }
}

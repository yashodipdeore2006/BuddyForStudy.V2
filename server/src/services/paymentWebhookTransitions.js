export const CAPTURED_PAYMENT_SOURCE_STATUSES = Object.freeze(["created", "pending", "failed"]);
export const FAILED_PAYMENT_SOURCE_STATUSES = Object.freeze(["created", "pending"]);
export function buildCapturedPaymentUpdate(paymentEntity, now = new Date()) {
  const providerPaymentId = typeof paymentEntity?.id === "string" ? paymentEntity.id.trim() : "";
  return {
    status: "paid",
    ...(providerPaymentId ? { providerPaymentId } : {}),
    paidAt: now,
    purchaseNotificationStatus: "pending",
    purchaseNotificationLastCheckedAt: null
  };
}

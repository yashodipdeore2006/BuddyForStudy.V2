export const CAPTURED_PAYMENT_SOURCE_STATUSES = Object.freeze(["created", "pending", "failed"]);
export const FAILED_PAYMENT_SOURCE_STATUSES = Object.freeze(["created", "pending"]);

function normalizedProviderPaymentId(paymentEntity) {
  return typeof paymentEntity?.id === "string" ? paymentEntity.id.trim() : "";
}

export function buildCapturedPaymentUpdate(paymentEntity, now = new Date()) {
  const providerPaymentId = normalizedProviderPaymentId(paymentEntity);
  return {
    status: "paid",
    ...(providerPaymentId ? { providerPaymentId } : {}),
    paidAt: now,
    purchaseNotificationStatus: "pending",
    purchaseNotificationLastCheckedAt: null
  };
}

export function buildFailedPaymentUpdate(paymentEntity) {
  const providerPaymentId = normalizedProviderPaymentId(paymentEntity);
  return {
    status: "failed",
    ...(providerPaymentId ? { providerPaymentId } : {})
  };
}

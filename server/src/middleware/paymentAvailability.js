/**
 * Fail closed for payment and payment-webhook routes until a provider is
 * configured and explicitly enabled in the deployment environment.
 */
export function createPaymentAvailabilityMiddleware({ enabled = false } = {}) {
  return function requirePaymentsEnabled(_req, res, next) {
    if (enabled) return next();
    return res.status(503).json({
      success: false,
      message: "Payments are temporarily unavailable. Please try again later."
    });
  };
}

const PLACEHOLDER_SECRETS = new Set([
  "change-me",
  "change-me-in-production",
  "your_jwt_secret",
  "ci-test-secret",
  "secret",
]);

export function getProductionConfigErrors(config = {}) {
  const errors = [];
  const jwtSecret = String(config.JWT_SECRET || "");
  if (jwtSecret.length < 32 || PLACEHOLDER_SECRETS.has(jwtSecret.toLowerCase())) {
    errors.push("JWT_SECRET must be a non-placeholder value with at least 32 characters");
  }

  const clientUrl = String(config.CLIENT_URL || "");
  try {
    const parsed = new URL(clientUrl);
    if (parsed.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      errors.push("CLIENT_URL must use HTTPS and must not point to localhost");
    }
  } catch {
    errors.push("CLIENT_URL must be a valid HTTPS URL");
  }

  for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
    if (!String(config[key] || "").trim()) errors.push(key + " is required in production");
  }

  return errors;
}

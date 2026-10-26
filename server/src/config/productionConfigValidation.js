const PLACEHOLDER_SECRETS = new Set([
  "change-me",
  "change-me-in-production",
  "your_jwt_secret",
  "ci-test-secret",
  "secret",
]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PLACEHOLDER_SECRETS.has(normalized) ||
    /^(?:change|your|replace|example|test|demo)[-_ ]/.test(normalized);
}

function validateHttpsUrl(value, name, errors) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" || LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      errors.push(name + " must use HTTPS and must not point to localhost");
      return false;
    }
    return true;
  } catch {
    errors.push(name + " must be a valid HTTPS URL");
    return false;
  }
}

function validateMongoUri(value, errors) {
  try {
    const parsed = new URL(String(value || ""));
    if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol) || !parsed.hostname) {
      errors.push("MONGO_URI must be a valid MongoDB connection string");
      return;
    }
    if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      errors.push("MONGO_URI must not point to localhost in production");
    }
    if (!parsed.pathname || parsed.pathname.replace(/^\/+/, "").length === 0) {
      errors.push("MONGO_URI must specify the application database name");
    }
    if (!parsed.username || !parsed.password) {
      errors.push("MONGO_URI must use database credentials in production");
    }
    const tlsEnabled = parsed.protocol === "mongodb+srv:" ||
      ["true", "1"].includes(String(parsed.searchParams.get("tls") || parsed.searchParams.get("ssl") || "").toLowerCase());
    if (!tlsEnabled) {
      errors.push("MONGO_URI must enable TLS for production connections");
    }
  } catch {
    errors.push("MONGO_URI must be a valid MongoDB connection string");
  }
}

export function getProductionConfigErrors(config = {}) {
  const errors = [];
  const jwtSecret = String(config.JWT_SECRET || "").trim();
  if (jwtSecret.length < 32 || isPlaceholder(jwtSecret)) {
    errors.push("JWT_SECRET must be a non-placeholder value with at least 32 characters");
  }

  validateHttpsUrl(config.CLIENT_URL, "CLIENT_URL", errors);
  validateHttpsUrl(config.API_URL, "API_URL", errors);
  validateMongoUri(config.MONGO_URI, errors);

  const keyId = String(config.RAZORPAY_KEY_ID || "").trim();
  if (!keyId) {
    errors.push("RAZORPAY_KEY_ID is required in production");
  } else if (!/^rzp_live_[A-Za-z0-9]+$/.test(keyId) || isPlaceholder(keyId)) {
    errors.push("RAZORPAY_KEY_ID must be a non-placeholder live-mode key ID in production");
  }

  const paymentSecrets = [
    ["RAZORPAY_KEY_SECRET", 16],
    ["RAZORPAY_WEBHOOK_SECRET", 32],
  ];
  for (const [key, minLength] of paymentSecrets) {
    const value = String(config[key] || "").trim();
    if (!value) {
      errors.push(key + " is required in production");
    } else if (value.length < minLength || isPlaceholder(value)) {
      errors.push(key + " must be a non-placeholder value with at least " + minLength + " characters");
    }
  }

  return errors;
}

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
    const explicitTls = parsed.searchParams.get("tls") ?? parsed.searchParams.get("ssl");
    const tlsEnabled = explicitTls === null
      ? parsed.protocol === "mongodb+srv:"
      : ["true", "1"].includes(String(explicitTls).toLowerCase());
    if (!tlsEnabled) {
      errors.push("MONGO_URI must enable TLS for production connections");
    }
  } catch {
    errors.push("MONGO_URI must be a valid MongoDB connection string");
  }
}


function validateSmtp(config, errors) {
  const host = String(config.SMTP_HOST || "").trim();
  if (!host) {
    errors.push("SMTP_HOST is required in production for email-based authentication");
  } else if (/[\\s/]/.test(host) || host.includes("://") || LOOPBACK_HOSTS.has(host.toLowerCase())) {
    errors.push("SMTP_HOST must be a remote hostname, not a URL or loopback host");
  }

  const port = Number(config.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("SMTP_PORT must be an integer between 1 and 65535");
  }

  const secureValue = String(config.SMTP_SECURE ?? "false").trim().toLowerCase();
  if (!["true", "false"].includes(secureValue)) {
    errors.push("SMTP_SECURE must be true or false");
  }

  if (!String(config.SMTP_USER || "").trim()) {
    errors.push("SMTP_USER is required in production");
  }
  const password = String(config.SMTP_PASS || "").trim();
  if (password.length < 8 || isPlaceholder(password)) {
    errors.push("SMTP_PASS must be a non-placeholder credential of at least 8 characters");
  }

  const sender = String(config.MAIL_FROM || config.SMTP_USER || "").trim();
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(sender)) {
    errors.push("MAIL_FROM (or SMTP_USER fallback) must be a valid sender email address");
  }
}

function validateOptionalWebPush(config, errors) {
  const values = [
    config.WEB_PUSH_VAPID_PUBLIC_KEY,
    config.WEB_PUSH_VAPID_PRIVATE_KEY,
    config.WEB_PUSH_SUBJECT
  ];
  if (!values.some((value) => String(value || "").trim())) return;
  if (values.some((value) => !String(value || "").trim())) {
    errors.push("WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT must be configured together");
  }
  const subject = String(config.WEB_PUSH_SUBJECT || "").trim();
  if (subject && !/^mailto:[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(subject) && !/^https:\\/\\//i.test(subject)) {
    errors.push("WEB_PUSH_SUBJECT must be a mailto: address or HTTPS contact URL");
  }
}

function validateOptionalRedis(value, errors) {
  if (!String(value || "").trim()) return;
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== "rediss:") {
      errors.push("REDIS_URL must use rediss:// TLS in production");
    }
    if (!parsed.hostname || LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      errors.push("REDIS_URL must point to a remote Redis host in production");
    }
    if (!parsed.password) {
      errors.push("REDIS_URL must include authentication credentials in production");
    }
  } catch {
    errors.push("REDIS_URL must be a valid Redis connection URL");
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
  validateSmtp(config, errors);
  validateOptionalWebPush(config, errors);
  validateOptionalRedis(config.REDIS_URL, errors);

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

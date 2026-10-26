import rateLimit from "express-rate-limit";

// Shared auth-route limiter so the same policy can be verified independently
// without importing server.js (which connects to MongoDB and starts listeners).
export const AUTH_RATE_LIMIT_POLICY = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later."
  }
});

export const authLimiter = rateLimit(AUTH_RATE_LIMIT_POLICY);

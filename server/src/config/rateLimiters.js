import rateLimit from "express-rate-limit";
import { MongoRateLimitStore } from "./mongoRateLimitStore.js";

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

export function createAuthLimiter({ store = new MongoRateLimitStore("auth") } = {}) {
  return rateLimit({ ...AUTH_RATE_LIMIT_POLICY, store });
}

export const authLimiter = createAuthLimiter();


export const aiRoadmapDraftLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  store: new MongoRateLimitStore("ai-roadmap"),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.userId || "unauthenticated"),
  message: {
    success: false,
    message: "Too many roadmap build requests. Please wait before starting another build."
  }
});

import dotenv from "dotenv";
import { getProductionConfigErrors } from "./productionConfigValidation.js";
if (process.env.BUILD_WITH_AI_SELECTOR_MOCK !== "true") dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
if (nodeEnv === "production") {
  const errors = getProductionConfigErrors(process.env);
  if (errors.length) {
    throw new Error("Invalid production configuration: " + errors.join("; "));
  }
}

const required = ["MONGO_URI", "JWT_SECRET"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`,
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || "",
  webPushVapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "",
  webPushVapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "",
  webPushSubject: process.env.WEB_PUSH_SUBJECT || "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  redisUrl: process.env.REDIS_URL || "",
  sentryDsn: process.env.SENTRY_DSN || "",
  sentryTracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),

  // Build with AI v2 rollout controls. All feature flags are opt-in.
  useCurationEngineForAi: process.env.USE_CURATION_ENGINE_FOR_AI === "true",
  intentV2: process.env.INTENT_V2 === "true",
  asyncRoadmap: process.env.ASYNC_ROADMAP === "true",
  ytCombinedSearch: process.env.YT_COMBINED_SEARCH === "true",
  enableTrustedChannels: process.env.ENABLE_TRUSTED_CHANNELS === "true",
  enableCurationComplianceWorkers: process.env.ENABLE_CURATION_COMPLIANCE_WORKERS === "true",
  aiPrivateCoursesSkipReview: process.env.AI_PRIVATE_COURSES_SKIP_REVIEW === "true",
  ytDailyQuotaBudget: Math.max(1, Number(process.env.YT_DAILY_QUOTA_BUDGET || 9000)),
  ytSoftLimitPct: Math.max(1, Math.min(100, Number(process.env.YT_SOFT_LIMIT_PCT || 80))),
  nodeCacheTtlDays: Math.max(1, Math.min(25, Number(process.env.NODE_CACHE_TTL_DAYS || 14))),
  nodeConcurrency: Math.max(1, Number(process.env.NODE_CONCURRENCY || 3))
};

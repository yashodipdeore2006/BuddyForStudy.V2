import "./instrument.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authLimiter } from "./config/rateLimiters.js";
import { MongoRateLimitStore } from "./config/mongoRateLimitStore.js";
import { env } from "./config/env.js";
import { isAllowedClientOrigin } from "./config/corsPolicy.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import meRoutes from "./routes/me.routes.js";
import { googleConfig } from "./controllers/auth.controller.js";
import courseRoutes from "./routes/course.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import progressRoutes from "./routes/progress.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import curriculumRoutes from "./routes/curriculum.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import intentRoutes from "./routes/intent.routes.js";
import advancedAIRoutes from "./routes/advancedAI.routes.js";
import adminProRoutes from "./routes/adminPro.routes.js";
import savedViewRoutes from "./routes/savedView.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import roadmapRoutes from "./routes/roadmap.routes.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import achievementRoutes from "./routes/achievement.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import healthRoutes from "./routes/health.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import savedCourseRoutes from "./routes/savedCourse.routes.js";
import legalRoutes from "./routes/legal.routes.js";
import publicSettingsRoutes from "./routes/publicSettings.routes.js";
import consentRoutes from "./routes/consent.routes.js";
import adminPricingRoutes from "./routes/adminPricing.routes.js";
import adminTrialsRoutes from "./routes/adminTrials.routes.js";
import { checkWorkerHeartbeat } from "./services/jobHeartbeat.service.js";
import { safeRequestLog } from "./utils/safeRequestLog.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { createGracefulShutdown } from "./utils/gracefulShutdown.js";

const app = express();
// Configure the exact trusted proxy hop count for the deployment; avoid blanket trust.
app.set("trust proxy", env.trustProxyHops);
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, store: new MongoRateLimitStore("payments"), message: { success: false, message: "Too many payment requests. Please try again later." } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, store: new MongoRateLimitStore("webhooks") });

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedClientOrigin(origin, { nodeEnv: env.nodeEnv, clientUrl: env.clientUrl })) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by the BuddyForStudy CORS policy."));
  },
  credentials: false
}));
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { if (req.originalUrl.startsWith("/api/webhooks/razorpay")) req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(morgan(safeRequestLog));
// A learner page can legitimately request course data, enrollment state, saved
// state and reviews in parallel. Keep a broad abuse-protection ceiling here;
// sensitive endpoints retain their own stricter auth/payment limiters.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests from this connection. Please wait a few minutes and try again." }
}));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "BuddyForStudy API",
    status: "healthy"
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/public", publicSettingsRoutes);
app.use("/api/consent", consentRoutes);
app.get("/api/auth/google/config", googleConfig);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminProRoutes);
app.use("/api/admin/pricing", adminPricingRoutes);
app.use("/api/admin/trials", adminTrialsRoutes);
app.use("/api/admin/saved-views", savedViewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/courses", curriculumRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/intent", intentRoutes);
app.use("/api/advanced-ai", advancedAIRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/saved-courses", savedCourseRoutes);
app.use("/api/legal", legalRoutes);
app.use("/api/payments", paymentLimiter, paymentRoutes);
app.use("/api/webhooks", webhookLimiter, webhookRoutes);

app.use(notFound);
app.use(errorHandler);

connectDatabase()
  .then(() => {
    const workerHealthTimer = setInterval(() => {
      void checkWorkerHeartbeat().catch((error) => console.error("[operations] worker heartbeat monitor failed", { name: error?.name || "Error", code: error?.code }));
    }, 60 * 1000);
    workerHealthTimer.unref?.();
    void checkWorkerHeartbeat().catch((error) => console.error("[operations] initial worker heartbeat check failed", { name: error?.name || "Error", code: error?.code }));
    const server = app.listen(env.port, "0.0.0.0", () => {
      console.log(`BuddyForStudy API running on port ${env.port}`);
    });
    const shutdown = createGracefulShutdown({
      server,
      disconnect: disconnectDatabase,
      clearTimers: () => clearInterval(workerHealthTimer),
      timeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000,
      logger: console,
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM").catch((error) => {
        console.error("[server] graceful shutdown failed", { name: error?.name || "Error", code: error?.code });
        process.exitCode = 1;
      });
    });
    process.once("SIGINT", () => {
      void shutdown("SIGINT").catch((error) => {
        console.error("[server] graceful shutdown failed", { name: error?.name || "Error", code: error?.code });
        process.exitCode = 1;
      });
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", {
      name: error?.name || "Error",
      code: typeof error?.code === "string" || typeof error?.code === "number" ? error.code : undefined,
      ...(env.nodeEnv === "production" ? {} : { message: String(error?.message || "Unknown startup error").slice(0, 1000) })
    });
    process.exit(1);
  });

export default app;

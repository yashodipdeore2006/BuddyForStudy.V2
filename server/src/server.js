import "./instrument.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import { googleConfig } from "./controllers/auth.controller.js";
import courseRoutes from "./routes/course.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import progressRoutes from "./routes/progress.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import curriculumRoutes from "./routes/curriculum.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import adminProRoutes from "./routes/adminPro.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import roadmapRoutes from "./routes/roadmap.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import achievementRoutes from "./routes/achievement.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import healthRoutes from "./routes/health.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many authentication attempts. Please try again later." } });
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many payment requests. Please try again later." } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: env.clientUrl,
  credentials: false
}));
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { if (req.originalUrl.startsWith("/api/webhooks/razorpay")) req.rawBody = Buffer.from(buf); } }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "BuddyForStudy API",
    status: "healthy"
  });
});

app.use("/api/health", healthRoutes);
app.get("/api/auth/google/config", googleConfig);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminProRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/courses", curriculumRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/payments", paymentLimiter, paymentRoutes);
app.use("/api/webhooks", webhookLimiter, webhookRoutes);

app.use(notFound);
app.use(errorHandler);

connectDatabase()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`BuddyForStudy API running on port ${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

export default app;

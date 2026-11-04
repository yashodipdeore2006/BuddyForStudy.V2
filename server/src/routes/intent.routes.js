import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { parseIntentController, trackIntentQuestionEventController, getRetiredIntentQuestionsController } from "../controllers/intent.controller.js";

const router = Router();
const intentParseLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many intent parsing requests. Please try again shortly." }
});
router.post("/parse", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), intentParseLimiter, parseIntentController);
router.post("/events", authMiddleware, intentParseLimiter, trackIntentQuestionEventController);
router.get("/questions/retired", authMiddleware, intentParseLimiter, getRetiredIntentQuestionsController);
export default router;

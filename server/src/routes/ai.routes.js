import { Router } from "express";
import { authMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { generateRoadmap, generateAndSaveCourse, generateQuiz, generatePracticeQuiz, submitPracticeQuiz, usage } from "../controllers/ai.controller.js";
import { recordCurationFeedback } from "../controllers/courseCurationFeedback.controller.js";
import rateLimit from "express-rate-limit";
import { parseIntentController } from "../controllers/intent.controller.js";

const router = Router();
const intentParseLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many intent parsing requests. Please try again shortly." } });

router.get("/usage", authMiddleware, usage);
router.post("/intent/parse", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), intentParseLimiter, parseIntentController);
router.post("/curation-feedback", authMiddleware, recordCurationFeedback);
router.post("/roadmap", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), generateRoadmap);
router.post("/quiz", authMiddleware, generateQuiz);
router.post("/practice-quiz", authMiddleware, generatePracticeQuiz);
router.post("/practice-quiz/submit", authMiddleware, submitPracticeQuiz);
router.post("/course", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);
router.post("/course/save", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);

export default router;

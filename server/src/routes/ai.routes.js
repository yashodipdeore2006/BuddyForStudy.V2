import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { generateRoadmap, generateAndSaveCourse, generateQuiz, generatePracticeQuiz, usage } from "../controllers/ai.controller.js";

const router = Router();

router.get("/usage", authMiddleware, usage);
router.post("/roadmap", authMiddleware, requireFeature("ai_course_builder"), generateRoadmap);
router.post("/quiz", authMiddleware, generateQuiz);
router.post("/practice-quiz", authMiddleware, generatePracticeQuiz);
router.post("/course", authMiddleware, adminMiddleware, generateAndSaveCourse);
router.post("/course/save", authMiddleware, adminMiddleware, generateAndSaveCourse);

export default router;

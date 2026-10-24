import { Router } from "express";
import { authMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { generateRoadmap, generateAndSaveCourse, generateQuiz, generatePracticeQuiz, submitPracticeQuiz, usage } from "../controllers/ai.controller.js";
import { recordCurationFeedback } from "../controllers/courseCurationFeedback.controller.js";

const router = Router();

router.get("/usage", authMiddleware, usage);
router.post("/curation-feedback", authMiddleware, recordCurationFeedback);
router.post("/roadmap", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), generateRoadmap);
router.post("/quiz", authMiddleware, generateQuiz);
router.post("/practice-quiz", authMiddleware, generatePracticeQuiz);
router.post("/practice-quiz/submit", authMiddleware, submitPracticeQuiz);
router.post("/course", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);
router.post("/course/save", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);

export default router;

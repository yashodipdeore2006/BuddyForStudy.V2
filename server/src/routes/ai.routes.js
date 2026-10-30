import { Router } from "express";
import { authMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { generateRoadmap, generateAndSaveCourse, generateQuiz, generatePracticeQuiz, submitPracticeQuiz, submitCourseQuiz, usage } from "../controllers/ai.controller.js";
import { recordCurationFeedback } from "../controllers/courseCurationFeedback.controller.js";
import * as asyncRoadmap from "../controllers/asyncRoadmap.controller.js";
import { env } from "../config/env.js";
import { aiRoadmapDraftLimiter } from "../config/rateLimiters.js";


const router = Router();

router.get("/usage", authMiddleware, usage);
router.post("/curation-feedback", authMiddleware, recordCurationFeedback);
if (env.asyncRoadmap) {
  router.post("/roadmap/draft", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), aiRoadmapDraftLimiter, asyncRoadmap.createDraft);
  router.get("/roadmap/:draftId/events", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), asyncRoadmap.streamDraft);
  router.get("/roadmap/:draftId", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), asyncRoadmap.pollDraft);
  router.post("/roadmap", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), asyncRoadmap.finalizeDraft);
} else {
  router.post("/roadmap", authMiddleware, requireFeature("ai_course_builder"), requireFeature("personalized_roadmaps"), aiRoadmapDraftLimiter, generateRoadmap);
}
router.post("/quiz", authMiddleware, generateQuiz);
router.post("/quiz/submit", authMiddleware, submitCourseQuiz);
router.post("/practice-quiz", authMiddleware, generatePracticeQuiz);
router.post("/practice-quiz/submit", authMiddleware, submitPracticeQuiz);
router.post("/course", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);
router.post("/course/save", authMiddleware, adminPermissionMiddleware("courses.manage"), adminPermissionMiddleware("ai.manage"), generateAndSaveCourse);

export default router;

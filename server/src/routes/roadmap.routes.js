import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import * as controller from "../controllers/roadmap.controller.js";

const router = Router();
router.use(authMiddleware);
router.post("/", requireFeature("personalized_roadmaps"), controller.save);
router.get("/", requireFeature("personalized_roadmaps"), controller.list);
router.get("/:roadmapId", requireFeature("personalized_roadmaps"), controller.get);
router.delete("/:roadmapId", requireFeature("personalized_roadmaps"), controller.remove);
router.post("/:roadmapId/lessons/:lessonId/complete", requireFeature("personalized_roadmaps"), controller.complete);
router.post("/:roadmapId/quizzes/:moduleIndex/generate", requireFeature("personalized_roadmaps"), controller.generateQuiz);
router.post("/:roadmapId/quizzes/:moduleIndex/submit", requireFeature("personalized_roadmaps"), controller.submitQuiz);

export default router;
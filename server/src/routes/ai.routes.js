import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { generateRoadmap, generateAndSaveCourse } from "../controllers/ai.controller.js";

const router = Router();

router.post("/roadmap", authMiddleware, generateRoadmap);
router.post("/course", authMiddleware, adminMiddleware, generateRoadmap);
router.post("/course/save", authMiddleware, adminMiddleware, generateAndSaveCourse);

export default router;

import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { generateCourse, generateAndSaveCourse } from "../controllers/ai.controller.js";

const router = Router();

router.post("/course", authMiddleware, adminMiddleware, generateCourse);
router.post("/course/save", authMiddleware, adminMiddleware, generateAndSaveCourse);

export default router;

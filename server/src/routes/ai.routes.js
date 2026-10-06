import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { generateCourse } from "../controllers/ai.controller.js";

const router = Router();

router.post("/course", authMiddleware, adminMiddleware, generateCourse);

export default router;

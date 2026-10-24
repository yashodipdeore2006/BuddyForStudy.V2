import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { updateLearningPace } from "../controllers/auth.controller.js";

const router = Router();
router.put("/learning-pace", authMiddleware, updateLearningPace);
export default router;

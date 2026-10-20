import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/achievement.controller.js";

const router = Router();
router.use(authMiddleware);
router.get("/me", controller.me);
router.put("/preferences", controller.updatePreferences);

export default router;

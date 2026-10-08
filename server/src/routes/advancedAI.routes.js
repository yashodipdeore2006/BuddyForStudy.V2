import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { usage, insight, ask } from "../controllers/advancedAI.controller.js";

const router = Router();

router.use(authMiddleware, requireFeature("advanced_ai_paths"));
router.get("/usage", usage);
router.post("/insight", insight);
router.post("/ask", ask);

export default router;

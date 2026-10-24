import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { usage, insight, ask } from "../controllers/advancedAI.controller.js";

const router = Router();

// Reading the lesson panel/allowance must never open an upgrade modal.
// Gate only the explicit actions that consume Advanced AI functionality.
router.get("/usage", authMiddleware, usage);
router.post("/insight", authMiddleware, requireFeature("advanced_ai_paths"), insight);
router.post("/ask", authMiddleware, requireFeature("advanced_ai_paths"), ask);

export default router;

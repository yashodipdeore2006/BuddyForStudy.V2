import { Router } from "express";
import * as controller from "../controllers/progress.controller.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.get("/:courseId", requireFeature("learning_progress"), controller.get);
router.post("/:courseId/items/:itemId/complete", requireFeature("learning_progress"), controller.complete);
router.delete("/:courseId/items/:itemId/complete", requireFeature("learning_progress"), controller.uncomplete);

export default router;

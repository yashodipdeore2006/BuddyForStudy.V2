import { Router } from "express";
import * as controller from "../controllers/progress.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.get("/:courseId", controller.get);
router.post("/:courseId/items/:itemId/complete", controller.complete);

export default router;

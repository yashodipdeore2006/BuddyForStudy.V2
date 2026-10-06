import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/roadmap.controller.js";

const router = Router();
router.use(authMiddleware);
router.post("/", controller.save);
router.get("/", controller.list);
router.get("/:roadmapId", controller.get);
router.post("/:roadmapId/lessons/:lessonId/complete", controller.complete);

export default router;
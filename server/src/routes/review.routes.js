import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/review.controller.js";

const router = Router();
router.get("/courses/:courseId", controller.list);
router.post("/courses/:courseId", authMiddleware, controller.upsert);
router.delete("/courses/:courseId", authMiddleware, controller.remove);

export default router;

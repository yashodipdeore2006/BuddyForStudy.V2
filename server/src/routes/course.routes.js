import { Router } from "express";
import * as controller from "../controllers/course.controller.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/", controller.list);
router.get("/search", controller.search);
router.get("/:courseId/learn/:itemId", authMiddleware, controller.learningItem);
router.get("/:courseId/learn", authMiddleware, controller.learn);
router.get("/:courseId", controller.details);

router.post("/", authMiddleware, adminMiddleware, controller.create);
router.put("/:courseId", authMiddleware, adminMiddleware, controller.update);
router.delete("/:courseId", authMiddleware, adminMiddleware, controller.remove);

export default router;

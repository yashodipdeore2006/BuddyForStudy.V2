import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/curriculum.controller.js";

const router = Router();

router.use(authMiddleware, adminMiddleware);
router.post("/:courseId/modules", controller.createModule);
router.put("/:courseId/modules/:moduleId", controller.updateModule);
router.delete("/:courseId/modules/:moduleId", controller.deleteModule);
router.post("/:courseId/modules/:moduleId/lessons", controller.createLesson);
router.put("/:courseId/modules/:moduleId/lessons/:lessonId", controller.updateLesson);
router.delete("/:courseId/modules/:moduleId/lessons/:lessonId", controller.deleteLesson);

export default router;

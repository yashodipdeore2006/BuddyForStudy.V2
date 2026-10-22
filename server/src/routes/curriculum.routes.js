import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/curriculum.controller.js";

const router = Router();

router.use(authMiddleware, adminMiddleware);
router.post("/:courseId/modules", adminPermissionMiddleware("courses.manage"), controller.createModule);
router.put("/:courseId/modules/:moduleId", adminPermissionMiddleware("courses.manage"), controller.updateModule);
router.delete("/:courseId/modules/:moduleId", adminPermissionMiddleware("courses.manage"), controller.deleteModule);
router.post("/:courseId/modules/:moduleId/lessons", adminPermissionMiddleware("courses.manage"), controller.createLesson);
router.put("/:courseId/modules/:moduleId/lessons/:lessonId", adminPermissionMiddleware("courses.manage"), controller.updateLesson);
router.delete("/:courseId/modules/:moduleId/lessons/:lessonId", adminPermissionMiddleware("courses.manage"), controller.deleteLesson);

export default router;

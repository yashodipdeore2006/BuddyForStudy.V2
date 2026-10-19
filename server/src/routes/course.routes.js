import { Router } from "express";
import * as controller from "../controllers/course.controller.js";
import { requireFeatureIfAuthenticated, requireCourseOrFeature } from "../middleware/subscription.middleware.js";
import { authMiddleware, adminMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), controller.list);
router.get("/search", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), controller.search);
router.get("/:courseId/learn/:itemId", authMiddleware, requireCourseOrFeature("published_courses"), controller.learningItem);
router.get("/:courseId/learn", authMiddleware, requireCourseOrFeature("published_courses"), controller.learn);
router.get("/:courseId", optionalAuthMiddleware, controller.details);

router.post("/", authMiddleware, adminMiddleware, controller.create);
router.put("/:courseId", authMiddleware, adminMiddleware, controller.update);
router.delete("/:courseId", authMiddleware, adminMiddleware, controller.remove);

export default router;

import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/admin.controller.js";

const router = Router();

router.use(authMiddleware, adminMiddleware);
router.get("/users", controller.users);
router.get("/users/:userId", controller.userDetails);
router.get("/users/:userId/courses", controller.userCourses);
router.post("/users/:userId/courses/:courseId", controller.grantUserCourse);
router.delete("/users/:userId/courses/:courseId", controller.revokeUserCourse);
router.put("/users/:userId", controller.updateUser);
router.get("/analytics", controller.analytics);

export default router;

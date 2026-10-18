import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/admin.controller.js";

const router = Router();

router.use(authMiddleware, adminMiddleware);
router.get("/users", adminPermissionMiddleware("users.read"), controller.users);
router.get("/users/:userId", adminPermissionMiddleware("users.read"), controller.userDetails);
router.get("/users/:userId/courses", adminPermissionMiddleware("users.read"), controller.userCourses);
router.post("/users/:userId/courses/:courseId", adminPermissionMiddleware("users.manage"), controller.grantUserCourse);
router.delete("/users/:userId/courses/:courseId", adminPermissionMiddleware("users.manage"), controller.revokeUserCourse);
router.put("/users/:userId", adminPermissionMiddleware("users.manage"), controller.updateUser);
router.get("/analytics", adminPermissionMiddleware("analytics.read"), controller.analytics);

export default router;

import { Router } from "express";
import * as controller from "../controllers/enrollment.controller.js";
import { requireFeature } from "../middleware/subscription.middleware.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.post("/:courseId", requireFeature("published_courses"), controller.enroll);
router.get("/", controller.mine);
router.get("/course/:courseId", controller.byCourse);
router.get("/:enrollmentId", controller.byId);
router.delete("/:courseId", controller.cancel);

export default router;

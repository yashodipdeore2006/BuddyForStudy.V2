import { Router } from "express";
import * as controller from "../controllers/enrollment.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.post("/:courseId", controller.enroll);
router.get("/", controller.mine);
router.get("/course/:courseId", controller.byCourse);
router.get("/:enrollmentId", controller.byId);
router.delete("/:courseId", controller.cancel);

export default router;

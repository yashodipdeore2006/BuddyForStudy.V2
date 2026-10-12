import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/savedCourse.controller.js";

const router = Router();
router.use(authMiddleware);

router.get("/", controller.mine);
router.post("/", controller.save);
router.delete("/:courseId", controller.remove);

export default router;

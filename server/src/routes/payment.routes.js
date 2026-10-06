import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/payment.controller.js";

const router = Router();
router.use(authMiddleware);
router.post("/course/order", controller.createCourseOrder);

export default router;

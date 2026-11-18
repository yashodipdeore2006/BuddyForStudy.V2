import { Router } from "express";
import * as controller from "../controllers/health.controller.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = Router();
router.get("/", controller.health);
router.get("/ready", controller.readiness);
router.get("/operations", authMiddleware, adminMiddleware, controller.operations);

export default router;

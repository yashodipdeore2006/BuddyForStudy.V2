import { Router } from "express";
import * as controller from "../controllers/health.controller.js";

const router = Router();
router.get("/", controller.health);
router.get("/ready", controller.readiness);

export default router;

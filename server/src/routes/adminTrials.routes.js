import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminTrials.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);
router.get("/grants", adminPermissionMiddleware("trials.manage"), controller.listGrants);
router.post("/preview", adminPermissionMiddleware("trials.manage"), controller.preview);
router.post("/grant", adminPermissionMiddleware("trials.manage"), controller.grant);
export default router;

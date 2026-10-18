import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from "../controllers/savedView.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware, adminPermissionMiddleware("dashboard.read"));
router.get("/", listSavedViews);
router.post("/", createSavedView);
router.patch("/:viewId", updateSavedView);
router.delete("/:viewId", deleteSavedView);

export default router;

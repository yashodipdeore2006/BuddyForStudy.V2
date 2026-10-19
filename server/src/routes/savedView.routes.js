import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from "../controllers/savedView.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

// Reading views is available to admins who can enter the dashboard. Creating,
// sharing, editing and deleting views require the explicit saved-views grant.
router.get("/", adminPermissionMiddleware("dashboard.read"), listSavedViews);
router.post("/", adminPermissionMiddleware("saved_views.manage"), createSavedView);
router.patch("/:viewId", adminPermissionMiddleware("saved_views.manage"), updateSavedView);
router.delete("/:viewId", adminPermissionMiddleware("saved_views.manage"), deleteSavedView);

export default router;

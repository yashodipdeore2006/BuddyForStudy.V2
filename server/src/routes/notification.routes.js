import { Router } from "express";
import * as controller from "../controllers/notification.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.get("/", controller.list);
router.get("/preferences", controller.getPreferences);
router.put("/preferences", controller.updatePreferences);
router.patch("/:notificationId/read", controller.markRead);
router.patch("/read-all", controller.markAllRead);

export default router;

import { Router } from "express";
import * as controller from "../controllers/notification.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/unsubscribe", controller.unsubscribeLanding);
router.post("/unsubscribe", controller.unsubscribePromotionalEmails);

router.use(authMiddleware);
router.get("/", controller.list);
router.get("/preferences", controller.getPreferences);
router.get("/push/public-key", controller.getPushPublicKey);
router.post("/push/subscriptions", controller.registerPushSubscription);
router.delete("/push/subscriptions", controller.removePushSubscription);
router.post("/push/test", controller.sendTestPush);
router.put("/preferences", controller.updatePreferences);
router.patch("/:notificationId/read", controller.markRead);
router.patch("/read-all", controller.markAllRead);

export default router;

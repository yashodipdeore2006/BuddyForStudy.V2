import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminPro.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/overview", controller.overview);
router.get("/users", controller.users);
router.get("/users/:userId", controller.userDetail);
router.put("/users/:userId", controller.updateUser);
router.get("/courses", controller.courses);
router.put("/courses/:courseId", controller.updateCourse);

router.get("/plans", controller.plans);
router.post("/plans", controller.createPlan);
router.put("/plans/:planId", controller.updatePlan);

router.get("/payments", controller.payments);
router.get("/refunds", controller.refunds);
router.put("/refunds/:refundId", controller.updateRefund);

router.post("/notifications/send", controller.sendNotification);
router.post("/emails/send", controller.sendEmail);
router.post("/announcements/send", controller.sendAnnouncement);

router.get("/settings", controller.settings);
router.put("/settings", controller.upsertSetting);

router.get("/coupons", controller.coupons);
router.post("/coupons", controller.createCoupon);
router.put("/coupons/:couponId", controller.updateCoupon);

router.get("/audit-logs", controller.auditLogs);
router.get("/health", controller.health);

export default router;

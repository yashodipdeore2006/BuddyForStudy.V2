import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminPro.controller.js";
import * as messageTemplateController from "../controllers/messageTemplate.controller.js";
import * as operationalAlertController from "../controllers/operationalAlert.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/overview", controller.overview);
router.get("/users", controller.users);
router.get("/users/:userId", controller.userDetail);
router.put("/users/:userId", controller.updateUser);
router.get("/courses", controller.courses);
router.get("/courses/:courseId", controller.courseDetail);
router.get("/courses/:courseId/readiness", controller.courseReadiness);
router.post("/courses/:courseId/publish", controller.publishCourse);
router.put("/courses/:courseId", controller.updateCourse);
router.put("/courses/:courseId/tutorial", controller.updateCourseTutorial);

router.post("/courses/:courseId/modules", controller.addCourseModule);
router.put("/courses/:courseId/modules/:moduleId", controller.updateCourseModule);
router.delete("/courses/:courseId/modules/:moduleId", controller.deleteCourseModule);
router.post("/courses/:courseId/modules/:moduleId/videos", controller.addCourseVideo);
router.post("/courses/:courseId/modules/:moduleId/lessons", controller.addCourseLesson);
router.delete("/courses/:courseId/modules/:moduleId/lessons/:lessonId", controller.deleteCourseLesson);
router.post("/courses/:courseId/modules/:moduleId/resources", controller.addModuleResource);
router.delete("/courses/:courseId/modules/:moduleId/resources/:resourceId", controller.deleteModuleResource);

router.get("/plans", controller.plans);
router.post("/plans", controller.createPlan);
router.put("/plans/:planId", controller.updatePlan);

router.get("/payments", controller.payments);
router.get("/notification-deliveries", controller.notificationDeliveries);
router.post("/notification-deliveries/:notificationId/retry", controller.retryNotificationDeliveryAdmin);
router.get("/refunds", controller.refunds);
router.put("/refunds/:refundId", controller.updateRefund);
router.get("/payment-issues", controller.paymentIssues);
router.put("/payment-issues/:issueId", controller.updatePaymentIssue);

router.post("/notifications/send", controller.sendNotification);
router.post("/emails/send", controller.sendEmail);
router.post("/announcements/send", controller.sendAnnouncement);

router.get("/message-templates", messageTemplateController.listMessageTemplates);
router.post("/message-templates", messageTemplateController.createMessageTemplate);
router.put("/message-templates/:templateId", messageTemplateController.updateMessageTemplate);
router.delete("/message-templates/:templateId", messageTemplateController.deleteMessageTemplate);

router.get("/settings", controller.settings);
router.put("/settings", controller.upsertSetting);
router.delete("/settings/:settingId", controller.deleteSetting);

router.get("/coupons", controller.coupons);
router.post("/coupons", controller.createCoupon);
router.put("/coupons/:couponId", controller.updateCoupon);

router.get("/audit-logs", controller.auditLogs);
router.get("/analytics", controller.analytics);
router.get("/health", controller.health);
router.get("/operations/alerts", operationalAlertController.operationalAlerts);
router.post("/operations/alerts/:alertId/acknowledge", operationalAlertController.acknowledgeOperationalAlert);

export default router;

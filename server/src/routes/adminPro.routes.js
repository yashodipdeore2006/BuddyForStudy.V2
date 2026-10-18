import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminPro.controller.js";
import * as messageTemplateController from "../controllers/messageTemplate.controller.js";
import * as operationalAlertController from "../controllers/operationalAlert.controller.js";
import * as adminRolesController from "../controllers/adminRoles.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/access", adminRolesController.currentAdminAccess);
router.get("/ai-content/settings", adminPermissionMiddleware("ai.manage"), adminRolesController.getAIContentSettings);
router.put("/ai-content/settings/:key", adminPermissionMiddleware("ai.manage"), adminRolesController.updateAIContentSetting);
router.get("/roles", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.listAdminRoles);
router.get("/administrators", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.listAdministrators);
router.put("/administrators/:userId/role", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.updateAdministratorRole);

router.get("/overview", adminPermissionMiddleware("dashboard.read"), controller.overview);
router.get("/users", adminPermissionMiddleware("users.read"), controller.users);
router.get("/users/:userId", adminPermissionMiddleware("users.read"), controller.userDetail);
router.put("/users/:userId", adminPermissionMiddleware("users.manage"), controller.updateUser);

router.get("/courses", adminPermissionMiddleware("courses.read"), controller.courses);
router.get("/courses/:courseId", adminPermissionMiddleware("courses.read"), controller.courseDetail);
router.get("/courses/:courseId/readiness", adminPermissionMiddleware("courses.read"), controller.courseReadiness);
router.post("/courses/:courseId/publish", adminPermissionMiddleware("courses.publish"), controller.publishCourse);
router.put("/courses/:courseId", adminPermissionMiddleware("courses.manage"), controller.updateCourse);
router.put("/courses/:courseId/tutorial", adminPermissionMiddleware("courses.manage"), controller.updateCourseTutorial);
router.post("/courses/:courseId/modules", adminPermissionMiddleware("courses.manage"), controller.addCourseModule);
router.put("/courses/:courseId/modules/:moduleId", adminPermissionMiddleware("courses.manage"), controller.updateCourseModule);
router.delete("/courses/:courseId/modules/:moduleId", adminPermissionMiddleware("courses.manage"), controller.deleteCourseModule);
router.post("/courses/:courseId/modules/:moduleId/videos", adminPermissionMiddleware("courses.manage"), controller.addCourseVideo);
router.post("/courses/:courseId/modules/:moduleId/lessons", adminPermissionMiddleware("courses.manage"), controller.addCourseLesson);
router.delete("/courses/:courseId/modules/:moduleId/lessons/:lessonId", adminPermissionMiddleware("courses.manage"), controller.deleteCourseLesson);
router.post("/courses/:courseId/modules/:moduleId/resources", adminPermissionMiddleware("courses.manage"), controller.addModuleResource);
router.delete("/courses/:courseId/modules/:moduleId/resources/:resourceId", adminPermissionMiddleware("courses.manage"), controller.deleteModuleResource);

router.get("/plans", adminPermissionMiddleware("plans.read"), controller.plans);
router.post("/plans", adminPermissionMiddleware("plans.manage"), controller.createPlan);
router.put("/plans/:planId", adminPermissionMiddleware("plans.manage"), controller.updatePlan);

router.get("/payments", adminPermissionMiddleware("billing.read"), controller.payments);
router.get("/notification-deliveries", adminPermissionMiddleware("operations.read"), controller.notificationDeliveries);
router.post("/notification-deliveries/:notificationId/retry", adminPermissionMiddleware("operations.manage"), controller.retryNotificationDeliveryAdmin);
router.get("/refunds", adminPermissionMiddleware("billing.read"), controller.refunds);
router.put("/refunds/:refundId", adminPermissionMiddleware("refunds.manage"), controller.updateRefund);
router.get("/payment-issues", adminPermissionMiddleware("billing.read"), controller.paymentIssues);
router.put("/payment-issues/:issueId", adminPermissionMiddleware("payment_issues.manage"), controller.updatePaymentIssue);

router.post("/notifications/send", adminPermissionMiddleware("communications.send"), controller.sendNotification);
router.post("/emails/send", adminPermissionMiddleware("communications.send"), controller.sendEmail);
router.post("/announcements/send", adminPermissionMiddleware("communications.send"), controller.sendAnnouncement);

router.get("/message-templates", adminPermissionMiddleware("communications.manage"), messageTemplateController.listMessageTemplates);
router.post("/message-templates", adminPermissionMiddleware("communications.manage"), messageTemplateController.createMessageTemplate);
router.put("/message-templates/:templateId", adminPermissionMiddleware("communications.manage"), messageTemplateController.updateMessageTemplate);
router.delete("/message-templates/:templateId", adminPermissionMiddleware("communications.manage"), messageTemplateController.deleteMessageTemplate);

router.get("/settings", adminPermissionMiddleware("settings.read"), controller.settings);
router.put("/settings", adminPermissionMiddleware("settings.manage"), controller.upsertSetting);
router.delete("/settings/:settingId", adminPermissionMiddleware("settings.manage"), controller.deleteSetting);

router.get("/coupons", adminPermissionMiddleware("coupons.read"), controller.coupons);
router.post("/coupons", adminPermissionMiddleware("coupons.manage"), controller.createCoupon);
router.put("/coupons/:couponId", adminPermissionMiddleware("coupons.manage"), controller.updateCoupon);

router.get("/audit-logs", adminPermissionMiddleware("audit.read"), controller.auditLogs);
router.get("/analytics", adminPermissionMiddleware("analytics.read"), controller.analytics);
router.get("/health", adminPermissionMiddleware("operations.read"), controller.health);
router.get("/operations/alerts", adminPermissionMiddleware("operations.read"), operationalAlertController.operationalAlerts);
router.post("/operations/alerts/:alertId/acknowledge", adminPermissionMiddleware("operations.manage"), operationalAlertController.acknowledgeOperationalAlert);

export default router;

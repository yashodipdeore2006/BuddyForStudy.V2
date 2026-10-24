import { Router } from "express";
import * as pricingController from "../controllers/adminPricing.controller.js";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminPro.controller.js";
import * as journeyController from "../controllers/courseJourneyRoadmap.controller.js";
import * as messageTemplateController from "../controllers/messageTemplate.controller.js";
import * as operationalAlertController from "../controllers/operationalAlert.controller.js";
import * as adminRolesController from "../controllers/adminRoles.controller.js";
import * as adminInvitationsController from "../controllers/adminInvitations.controller.js";
import * as adminOperationsController from "../controllers/adminOperations.controller.js";
import * as aiPromptController from "../controllers/aiPrompt.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/access", adminRolesController.currentAdminAccess);
router.get("/pricing/courses", adminPermissionMiddleware("pricing.manage"), pricingController.listCourses);
router.post("/pricing/preview", adminPermissionMiddleware("pricing.manage"), pricingController.preview);
router.post("/pricing/apply", adminPermissionMiddleware("pricing.manage"), pricingController.applyPreview);
router.get("/pricing/history", adminPermissionMiddleware("pricing.manage"), pricingController.history);
router.post("/pricing/history/:batchId/rollback", adminPermissionMiddleware("pricing.manage"), pricingController.rollback);
router.get("/ai-content/settings", adminPermissionMiddleware("ai.manage"), adminRolesController.getAIContentSettings);
router.put("/ai-content/settings/:key", adminPermissionMiddleware("ai.manage"), adminRolesController.updateAIContentSetting);
router.get("/prompts", adminPermissionMiddleware("ai.manage"), aiPromptController.listPromptVersions);
router.get("/prompts/:feature/versions/:versionId", adminPermissionMiddleware("ai.manage"), aiPromptController.getPromptVersion);
router.post("/prompts/:feature/versions", adminPermissionMiddleware("ai.manage"), aiPromptController.createPromptVersion);
router.post("/prompts/:feature/activate", adminPermissionMiddleware("ai.manage"), aiPromptController.activatePromptVersion);
router.get("/roles", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.listAdminRoles);
router.get("/administrators", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.listAdministrators);
router.get("/invitations", adminPermissionMiddleware("admin_roles.manage"), adminInvitationsController.listInvitations);
router.post("/invitations", adminPermissionMiddleware("admin_roles.manage"), adminInvitationsController.createInvitation);
router.delete("/invitations/:invitationId", adminPermissionMiddleware("admin_roles.manage"), adminInvitationsController.revokeInvitation);
router.put("/administrators/:userId/role", adminPermissionMiddleware("admin_roles.manage"), adminRolesController.updateAdministratorRole);

router.get("/overview", adminPermissionMiddleware("dashboard.read"), controller.overview);
router.get("/users", adminPermissionMiddleware("users.read"), controller.users);
router.post("/users/export", adminPermissionMiddleware("users.pii.reveal"), controller.exportUsers);
router.get("/users/:userId", adminPermissionMiddleware("users.read"), controller.userDetail);
router.post("/users/:userId/pii-reveal", adminPermissionMiddleware("users.pii.reveal"), controller.revealUserPii);
router.get("/users/:userId/feature-overrides", adminPermissionMiddleware("users.read"), controller.userFeatureOverrides);
router.put("/users/:userId/feature-overrides/:featureKey", adminPermissionMiddleware("users.manage"), controller.upsertUserFeatureOverride);
router.delete("/users/:userId/feature-overrides/:featureKey", adminPermissionMiddleware("users.manage"), controller.deleteUserFeatureOverride);
router.put("/users/:userId", adminPermissionMiddleware("users.manage"), controller.updateUser);

router.get("/content-policies", adminPermissionMiddleware("courses.read"), controller.contentApprovalPolicies);
router.put("/content-policies", adminPermissionMiddleware("courses.manage"), controller.updateContentApprovalPolicies);
router.get("/courses", adminPermissionMiddleware("courses.read"), controller.courses);
router.get("/courses/:courseId/roadmap", adminPermissionMiddleware("courses.read"), journeyController.get);
router.put("/courses/:courseId/roadmap", adminPermissionMiddleware("courses.manage"), journeyController.updateAdmin);
router.post("/courses/:courseId/roadmap/regenerate", adminPermissionMiddleware("courses.manage"), journeyController.regenerateAdmin);
router.get("/courses/:courseId", adminPermissionMiddleware("courses.read"), controller.courseDetail);
router.get("/courses/:courseId/readiness", adminPermissionMiddleware("courses.read"), controller.courseReadiness);
router.get("/courses/:courseId/revisions", adminPermissionMiddleware("courses.read"), controller.courseRevisions);
router.post("/courses/:courseId/revisions/:revisionId/rollback", adminPermissionMiddleware("courses.manage"), controller.rollbackCourseRevision);
router.post("/courses/:courseId/ai-review", adminPermissionMiddleware("courses.publish"), controller.reviewAiCourse);
router.post("/courses/:courseId/status", adminPermissionMiddleware("courses.manage"), controller.setCourseLifecycle);
router.post("/courses/:courseId/soft-delete", adminPermissionMiddleware("courses.manage"), controller.softDeleteCourse);
router.post("/courses/:courseId/restore", adminPermissionMiddleware("courses.manage"), controller.restoreCourse);
router.get("/content-moderation/:contentType", adminPermissionMiddleware("courses.read"), controller.contentModerationList);
router.post("/content-moderation/:contentType/:contentId", adminPermissionMiddleware("courses.manage"), controller.moderateContent);
router.get("/content-roadmaps", adminPermissionMiddleware("courses.read"), controller.contentRoadmaps);
router.post("/content/broken-links/check", adminPermissionMiddleware("courses.manage"), controller.brokenCourseLinks);
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
router.get("/subscriptions", adminPermissionMiddleware("billing.read"), controller.subscriptions);
router.get("/notification-deliveries", adminPermissionMiddleware("operations.read"), controller.notificationDeliveries);
router.post("/notification-deliveries/:notificationId/retry", adminPermissionMiddleware("operations.manage"), controller.retryNotificationDeliveryAdmin);
router.get("/refunds", adminPermissionMiddleware("billing.read"), controller.refunds);
router.put("/refunds/:refundId", adminPermissionMiddleware("refunds.manage"), controller.updateRefund);
router.post("/refunds/:refundId/reconcile", adminPermissionMiddleware("refunds.manage"), controller.reconcileRefund);
router.get("/payment-issues/assignees", adminPermissionMiddleware("payment_issues.manage"), controller.paymentIssueAssignees);
router.get("/payment-issues", adminPermissionMiddleware("billing.read"), controller.paymentIssues);
router.put("/payment-issues/:issueId", adminPermissionMiddleware("payment_issues.manage"), controller.updatePaymentIssue);

router.get("/notifications/audience-options", adminPermissionMiddleware("communications.send"), controller.notificationAudienceOptions);
router.post("/notifications/audience-preview", adminPermissionMiddleware("communications.send"), controller.previewNotificationAudience);
router.post("/notifications/send", adminPermissionMiddleware("communications.send"), controller.sendNotification);
router.post("/emails/send", adminPermissionMiddleware("communications.send"), controller.sendEmail);
router.post("/announcements/send", adminPermissionMiddleware("communications.send"), controller.sendAnnouncement);
router.get("/announcements", adminPermissionMiddleware("communications.manage"), controller.listAnnouncements);
router.post("/announcements/:announcementId/cancel", adminPermissionMiddleware("communications.manage"), controller.cancelAnnouncement);
router.get("/announcements/:announcementId/report", adminPermissionMiddleware("communications.manage"), controller.announcementReport);
router.get("/deliveries", adminPermissionMiddleware("notifications.read"), controller.deliveryLog);
router.post("/deliveries/:notificationId/retry", adminPermissionMiddleware("notifications.retry"), controller.retryDeliveryLog);

router.get("/message-templates", adminPermissionMiddleware("communications.manage"), messageTemplateController.listMessageTemplates);
router.post("/message-templates", adminPermissionMiddleware("communications.manage"), messageTemplateController.createMessageTemplate);
router.post("/message-templates/preview", adminPermissionMiddleware("communications.manage"), messageTemplateController.previewMessageTemplate);
router.put("/message-templates/:templateId", adminPermissionMiddleware("communications.manage"), messageTemplateController.updateMessageTemplate);
router.post("/message-templates/:templateId/preview", adminPermissionMiddleware("communications.manage"), messageTemplateController.previewMessageTemplate);
router.post("/message-templates/:templateId/test-send", adminPermissionMiddleware("communications.manage"), messageTemplateController.testSendMessageTemplate);
router.delete("/message-templates/:templateId", adminPermissionMiddleware("communications.manage"), messageTemplateController.deleteMessageTemplate);

router.get("/settings", adminPermissionMiddleware("settings.read"), controller.settings);
router.put("/settings", adminPermissionMiddleware("settings.manage"), controller.upsertSetting);
router.delete("/settings/:settingId", adminPermissionMiddleware("settings.manage"), controller.deleteSetting);

router.get("/coupons", adminPermissionMiddleware("coupons.read"), controller.coupons);
router.post("/coupons", adminPermissionMiddleware("coupons.manage"), controller.createCoupon);
router.post("/coupons/bulk", adminPermissionMiddleware("coupons.manage"), controller.bulkCreateCoupons);
router.put("/coupons/:couponId", adminPermissionMiddleware("coupons.manage"), controller.updateCoupon);

router.get("/audit-logs", adminPermissionMiddleware("audit.read"), controller.auditLogs);
router.get("/analytics", adminPermissionMiddleware("analytics.read"), controller.analytics);
router.get("/health", adminPermissionMiddleware("operations.read"), controller.health);
router.get("/operations/system-health", adminPermissionMiddleware("operations.read"), adminOperationsController.systemHealth);
router.get("/operations/webhooks", adminPermissionMiddleware("operations.read"), adminOperationsController.webhookEvents);
router.get("/operations/outbox", adminPermissionMiddleware("operations.read"), adminOperationsController.auditOutboxItems);
router.get("/operations/delivery-log", adminPermissionMiddleware("operations.read"), adminOperationsController.deliveryLog);
router.get("/operations/settings-registry", adminPermissionMiddleware("operations.read"), adminOperationsController.typedSettingsRegistry);
router.get("/operations/alerts", adminPermissionMiddleware("operations.read"), operationalAlertController.operationalAlerts);
router.post("/operations/alerts/:alertId/acknowledge", adminPermissionMiddleware("operations.manage"), operationalAlertController.acknowledgeOperationalAlert);

export default router;

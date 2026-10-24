import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminPricing.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);
router.get("/courses", adminPermissionMiddleware("pricing.manage"), controller.listCourses);
router.post("/preview", adminPermissionMiddleware("pricing.manage"), controller.preview);
router.post("/apply", adminPermissionMiddleware("pricing.manage"), controller.applyPreview);
router.get("/rules", adminPermissionMiddleware("pricing.manage"), controller.listRules);
router.post("/rules", adminPermissionMiddleware("pricing.manage"), controller.createRule);
router.put("/rules/:ruleId", adminPermissionMiddleware("pricing.manage"), controller.updateRule);
router.delete("/rules/:ruleId", adminPermissionMiddleware("pricing.manage"), controller.deleteRule);
router.post("/rules/run", adminPermissionMiddleware("pricing.manage"), controller.runEnabledRules);
router.get("/history", adminPermissionMiddleware("pricing.manage"), controller.history);
router.post("/history/:batchId/rollback", adminPermissionMiddleware("pricing.manage"), controller.rollback);
export default router;

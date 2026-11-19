import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/adminTrials.controller.js";
import * as campaignController from "../controllers/adminTrialCampaigns.controller.js";

const router = Router();
router.use(authMiddleware, adminMiddleware);

// Self-serve campaign configuration is separate from administrator-issued grants.
router.get("/campaigns", adminPermissionMiddleware("trials.manage"), campaignController.listCampaigns);
router.get("/campaigns/:campaignId", adminPermissionMiddleware("trials.manage"), campaignController.getCampaign);
router.post("/campaigns", adminPermissionMiddleware("trials.manage"), campaignController.createCampaign);
router.put("/campaigns/:campaignId", adminPermissionMiddleware("trials.manage"), campaignController.updateCampaign);
router.post("/campaigns/:campaignId/publish", adminPermissionMiddleware("trials.manage"), campaignController.publishCampaign);
router.post("/campaigns/:campaignId/pause", adminPermissionMiddleware("trials.manage"), campaignController.pauseCampaign);
router.post("/campaigns/:campaignId/disable", adminPermissionMiddleware("trials.manage"), campaignController.disableCampaign);

// Existing administrator-issued grant workflow remains unchanged.
router.get("/grants", adminPermissionMiddleware("trials.manage"), controller.listGrants);
router.post("/preview", adminPermissionMiddleware("trials.manage"), controller.preview);
router.post("/grant", adminPermissionMiddleware("trials.manage"), controller.grant);
export default router;

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { claimCampaign } from "../controllers/trialCampaignClaim.controller.js";

const router = Router();
router.use(authMiddleware);
router.post("/campaigns/:campaignId/claim", claimCampaign);
export default router;

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/consent.controller.js";

const router = Router();

// Public policy version metadata can be used by the registration UI without tracking a visitor.
router.get("/policy-versions", controller.policyVersions);

router.get("/status", authMiddleware, controller.status);
router.post("/accept", authMiddleware, controller.acceptLegal);
router.get("/cookies", authMiddleware, controller.getCookiePreferences);
router.put("/cookies", authMiddleware, controller.saveCookiePreferences);
router.post("/profile/complete", authMiddleware, controller.completeGoogleProfile);
router.post("/profile/skip", authMiddleware, controller.skipGoogleProfile);
router.put("/profile", authMiddleware, controller.updateProfileDetails);
router.put("/marketing-email", authMiddleware, controller.updateMarketingConsent);

export default router;

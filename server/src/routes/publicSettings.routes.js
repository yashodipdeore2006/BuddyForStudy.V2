import { Router } from "express";
import { getPublicSocialLinks } from "../controllers/publicSettings.controller.js";
import { getPublicSiteSettings } from "../controllers/siteSettings.controller.js";
import { listPublic as getPublicFaqs } from "../controllers/faq.controller.js";

const router = Router();

// This endpoint exposes only the six allowlisted social-link settings.
router.get("/social-links", getPublicSocialLinks);
router.get("/site-settings", getPublicSiteSettings);
router.get("/faqs", getPublicFaqs);

export default router;

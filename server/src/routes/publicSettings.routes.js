import { Router } from "express";
import { getPublicSocialLinks } from "../controllers/publicSettings.controller.js";

const router = Router();

// This endpoint exposes only the six allowlisted social-link settings.
router.get("/social-links", getPublicSocialLinks);

export default router;

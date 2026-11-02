import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { updateLearningPace } from "../controllers/auth.controller.js";
import {
  exportMyData,
  createMyPrivacyRequest,
  listMyPrivacyRequests,
} from "../controllers/privacyRequests.controller.js";

const router = Router();
router.use(authMiddleware);
router.put("/learning-pace", updateLearningPace);
router.get("/data-export", exportMyData);
router.get("/privacy-requests", listMyPrivacyRequests);
router.post("/privacy-requests", createMyPrivacyRequest);
export default router;

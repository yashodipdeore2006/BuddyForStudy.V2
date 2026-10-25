import { Router } from "express";
import rateLimit from "express-rate-limit";
import { search, courseSearch, enrollCourseSearch, enrollYouTubeResource, prepareYouTubeResourceCourse, saveYouTubeResource, playlist, recordCurationFeedback } from "../controllers/discovery.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { requireFeature, requireFeatureIfAuthenticated } from "../middleware/subscription.middleware.js";

const router = Router();
const curationFeedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many curation feedback events. Please try again later." }
});

// Keep public discovery available to guests, but enforce plan entitlements for signed-in learners.
router.get("/search", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), search);
router.get("/course-search", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), courseSearch);
router.post("/course-search/enroll", authMiddleware, requireFeature("course_search"), enrollCourseSearch);
router.post("/youtube-course/prepare", authMiddleware, requireFeature("course_search"), prepareYouTubeResourceCourse);
router.post("/youtube-course/enroll", authMiddleware, requireFeature("course_search"), enrollYouTubeResource);
router.post("/youtube-course/save", authMiddleware, requireFeature("course_search"), saveYouTubeResource);
router.post("/curation-feedback", curationFeedbackLimiter, optionalAuthMiddleware, recordCurationFeedback);
router.get("/playlists/:playlistId", optionalAuthMiddleware, playlist);

export default router;

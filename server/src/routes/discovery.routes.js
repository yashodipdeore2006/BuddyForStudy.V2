import { Router } from "express";
import { search, courseSearch, enrollCourseSearch, enrollYouTubeResource, saveYouTubeResource, playlist } from "../controllers/discovery.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { requireFeature, requireFeatureIfAuthenticated } from "../middleware/subscription.middleware.js";

const router = Router();

// Keep public discovery available to guests, but enforce plan entitlements for signed-in learners.
router.get("/search", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), search);
router.get("/course-search", optionalAuthMiddleware, requireFeatureIfAuthenticated("course_search"), courseSearch);
router.post("/course-search/enroll", authMiddleware, requireFeature("course_search"), enrollCourseSearch);
router.post("/youtube-course/enroll", authMiddleware, requireFeature("course_search"), enrollYouTubeResource);
router.post("/youtube-course/save", authMiddleware, requireFeature("course_search"), saveYouTubeResource);
router.get("/playlists/:playlistId", optionalAuthMiddleware, playlist);

export default router;

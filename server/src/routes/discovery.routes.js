import { Router } from "express";
import { search, courseSearch, enrollCourseSearch, enrollYouTubeResource, saveYouTubeResource, playlist } from "../controllers/discovery.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.get("/search", search);
router.get("/course-search", courseSearch);
router.post("/course-search/enroll", authMiddleware, enrollCourseSearch);
router.post("/youtube-course/enroll", authMiddleware, enrollYouTubeResource);
router.post("/youtube-course/save", authMiddleware, saveYouTubeResource);
router.get("/playlists/:playlistId", playlist);

export default router;

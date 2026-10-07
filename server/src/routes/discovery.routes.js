import { Router } from "express";
import { search, courseSearch, playlist } from "../controllers/discovery.controller.js";

const router = Router();
router.get("/search", search);
router.get("/course-search", courseSearch);
router.get("/playlists/:playlistId", playlist);

export default router;

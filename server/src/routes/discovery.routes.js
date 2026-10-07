import { Router } from "express";
import { search, playlist } from "../controllers/discovery.controller.js";

const router = Router();
router.get("/search", search);
router.get("/playlists/:playlistId", playlist);

export default router;

import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { getPlaylistCourse, searchStructuredPlaylists } from "../services/discovery.service.js";

const searchSchema = z.object({ q: z.string().trim().min(2).max(200) });

export async function search(req, res, next) {
  try {
    const { q } = searchSchema.parse(req.query);
    return success(res, { query: q, playlists: await searchStructuredPlaylists(q) });
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid search query", 400);
    if (e?.code === "forbidden" || e?.status === 503) {
      return failure(
        res,
        "YouTube search is unavailable. Check that the YouTube Data API v3 is enabled and that YOUTUBE_API_KEY is valid for server-side requests.",
        503
      );
    }
    next(e);
  }
}

export async function playlist(req, res, next) {
  try {
    return success(res, { course: await getPlaylistCourse(String(req.params.playlistId)) });
  } catch (e) {
    next(e);
  }
}

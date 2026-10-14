import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { getPlaylistCourse, searchStructuredPlaylists, searchCourseBySkills, createCourseFromSearch, getOrCreateYouTubeResourceCourse } from "../services/discovery.service.js";
import { SavedCourse } from "../models/SavedCourse.js";
import { Enrollment } from "../models/Enrollment.js";
import { enroll } from "../services/enrollment.service.js";
import { getActivePlanForUser, readPlanLimit } from "../services/subscriptionEntitlement.service.js";
import { consumeUsage, releaseUsage } from "../services/aiUsage.service.js";

const searchSchema = z.object({ q: z.string().trim().min(2).max(200) });
const resourceSchema = z.object({
  query: z.string().trim().min(2).max(200),
  resourceType: z.enum(["video", "playlist"]),
  resourceId: z.string().trim().min(2).max(200)
});


async function reserveDiscoveryQuota(req, limitKey, usageFeature) {
  if (req.user?.role === "admin" || req.user?.user?.role === "admin") return null;
  const plan = await getActivePlanForUser(req.user.userId);
  const limit = readPlanLimit(plan, limitKey, -1);
  const usage = await consumeUsage({ userId: req.user.userId, feature: usageFeature, period: "month", limit, amount: 1 });
  if (!usage.allowed) {
    const error = new Error("You have reached this plan's monthly course allowance. Upgrade your plan or try again next month.");
    error.status = 429;
    error.code = "COURSE_DISCOVERY_LIMIT";
    error.details = { limitKey, limit: usage.limit, used: usage.count };
    throw error;
  }
  return { userId: req.user.userId, feature: usageFeature };
}

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

export async function courseSearch(req, res, next) {
  try {
    const { q } = searchSchema.parse(req.query);
    return success(res, await searchCourseBySkills(q));
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid search query", 400);
    if (e?.status === 503) return failure(res, e.message, 503);
    next(e);
  }
}


export async function enrollCourseSearch(req, res, next) {
  let reservation = null;
  try {
    const { q } = searchSchema.parse(req.body);
    reservation = await reserveDiscoveryQuota(req, "ai_curated_courses_per_month", "ai_curated_courses");
    const course = await createCourseFromSearch(q);
    const enrollment = await enroll(req.user.userId, course._id);
    return success(res, { course, enrollment }, "Course enrolled successfully", 201);
  } catch (e) {
    if (reservation) await releaseUsage({ ...reservation, period: "month", amount: 1 }).catch(() => {});
    if (e instanceof z.ZodError) return failure(res, "Invalid course query", 400);
    if (e?.status === 429) return failure(res, e.message, 429, e.details || {});
    next(e);
  }
}


export async function enrollYouTubeResource(req, res, next) {
  let reservation = null;
  try {
    const input = resourceSchema.parse(req.body);
    reservation = await reserveDiscoveryQuota(req, "youtube_discovery_courses_per_month", "youtube_discovery_courses");
    const course = await getOrCreateYouTubeResourceCourse(input);
    let enrollment;

    try {
      enrollment = await enroll(req.user.userId, course._id);
    } catch (error) {
      if (error?.status === 409) {
        enrollment = await Enrollment.findOne({ user: req.user.userId, course: course._id });
      } else {
        throw error;
      }
    }

    return success(res, { course, enrollment }, "Course added to My Learning", 201);
  } catch (e) {
    if (reservation) await releaseUsage({ ...reservation, period: "month", amount: 1 }).catch(() => {});
    if (e instanceof z.ZodError) return failure(res, "Invalid YouTube course request", 400);
    if (e?.status === 429) return failure(res, e.message, 429, e.details || {});
    next(e);
  }
}

export async function saveYouTubeResource(req, res, next) {
  try {
    const input = resourceSchema.parse(req.body);
    const course = await getOrCreateYouTubeResourceCourse(input);
    const savedCourse = await SavedCourse.findOneAndUpdate(
      { user: req.user.userId, course: course._id },
      { $setOnInsert: { user: req.user.userId, course: course._id, savedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate({
      path: "course",
      select: "title slug description category level duration thumbnail isPublished pricing"
    });

    return success(res, { course, savedCourse }, "Course saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Invalid YouTube course request", 400);
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

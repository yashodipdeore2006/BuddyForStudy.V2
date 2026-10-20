import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { getPlaylistCourse, searchStructuredPlaylists, searchCourseBySkills, createCourseFromSearch, getOrCreateYouTubeResourceCourse } from "../services/discovery.service.js";
import { SavedCourse } from "../models/SavedCourse.js";
import { Enrollment } from "../models/Enrollment.js";
import { enroll } from "../services/enrollment.service.js";
import { getActivePlanForUser, readPlanLimit } from "../services/subscriptionEntitlement.service.js";
import { consumeUsage, releaseUsage } from "../services/aiUsage.service.js";
import { toPublicCoursePreview } from "../utils/coursePreview.js";
import { CourseCurationFeedback } from "../models/CourseCurationFeedback.js";
import { invalidateNormalSearchCurationCache } from "../services/courseCurationDecisionEngine.service.js";

const searchSchema = z.object({ q: z.string().trim().min(2).max(200) });
function pendingCourseAccessState(course) {
  const generated = ["normal", "ai", "module", "discovery"].includes(course?.generation?.mode);
  if (!generated) return null;
  const approved = course?.aiReviewStatus === "approved" && (Boolean(course?.aiReviewedBy) || course?.aiReviewSource === "automatic");
  if (!approved) return "review";
  if (course?.visibility === "private" && course?.createdForUser) return null;
  return course?.isPublished ? null : "publication";
}

function pendingCourseAccessMessage(state, courseType) {
  if (state === "publication") {
    return "This course is approved but not available yet. Administrators must complete the readiness and publication checks before learners can enroll.";
  }
  return "Your " + courseType + " has been submitted for administrator review. Access and enrollment will be enabled after approval and required publication checks.";
}

const resourceSchema = z.object({
  query: z.string().trim().min(2).max(200),
  resourceType: z.enum(["video", "playlist", "series"]),
  resourceId: z.string().trim().min(2).max(200)
});

const curationFeedbackSchema = z.object({
  query: z.string().trim().min(2).max(200),
  event: z.enum(["preview", "save", "enroll", "thumbs_up", "thumbs_down", "outdated", "report"]),
  resourceType: z.enum(["video", "playlist", "series"]),
  resourceId: z.string().trim().min(2).max(200),
  engineVersion: z.string().trim().min(1).max(100).default("course-curation-decision-engine-v1"),
  rank: z.number().int().min(1).max(100).optional(),
  score: z.number().min(0).max(100).optional()
});


async function reserveDiscoveryQuota(req, limitKey, usageFeature) {
  if (req.user?.role === "admin" && req.user?.accessType === "admin") return null;
  const plan = await getActivePlanForUser(req.user.userId);
  const limit = readPlanLimit(plan, limitKey, -1);
  const usage = await consumeUsage({ userId: req.user.userId, feature: usageFeature, period: "month", limit, amount: 1 });
  if (!usage.allowed) {
    const error = new Error("You have reached this plan's monthly course allowance. Upgrade your plan or try again next month.");
    error.status = 429;
    error.code = "COURSE_DISCOVERY_LIMIT";
    error.details = {
      feature: "priority_recommendations",
      limitKey,
      limit: usage.limit,
      used: usage.count
    };
    throw error;
  }
  return { userId: req.user.userId, feature: usageFeature };
}

export async function recordCurationFeedback(req, res, next) {
  try {
    const input = curationFeedbackSchema.parse(req.body);
    const normalizedQuery = input.query
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    await CourseCurationFeedback.create({
      user: req.user.userId,
      query: input.query,
      normalizedQuery,
      event: input.event,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      engineVersion: input.engineVersion,
      rank: input.rank ?? null,
      score: input.score ?? null
    });
    if (["save", "enroll", "thumbs_up", "thumbs_down", "outdated"].includes(input.event)) {
      await invalidateNormalSearchCurationCache(input.query);
    }
    return success(res, { recorded: true }, "Curation feedback recorded", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Invalid curation feedback", 400, error.flatten().fieldErrors);
    next(error);
  }
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
    const course = await createCourseFromSearch(q, req.user.userId);
    const accessHold = pendingCourseAccessState(course);
    if (accessHold) {
      return success(res, {
        course: toPublicCoursePreview(course),
        enrollment: null,
        pendingApproval: accessHold === "review",
        pendingPublication: accessHold === "publication"
      }, pendingCourseAccessMessage(accessHold, "AI-assembled course"), 202);
    }
    const enrollment = await enroll(req.user.userId, course._id);
    return success(res, { course: toPublicCoursePreview(course), enrollment }, "Course enrolled successfully", 201);
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
    const course = await getOrCreateYouTubeResourceCourse({ ...input, userId: req.user.userId });
    const accessHold = pendingCourseAccessState(course);
    if (accessHold) {
      return success(res, {
        course: toPublicCoursePreview(course),
        enrollment: null,
        pendingApproval: accessHold === "review",
        pendingPublication: accessHold === "publication"
      }, pendingCourseAccessMessage(accessHold, "YouTube learning course"), 202);
    }
    let enrollment;

    try {
      enrollment = await enroll(req.user.userId, course._id);
    } catch (error) {
      if (error?.status === 409) {
        enrollment = await Enrollment.findOne({ user: req.user.userId, course: course._id });
        if (reservation) {
          await releaseUsage({ ...reservation, period: "month", amount: 1 }).catch(() => {});
          reservation = null;
        }
      } else {
        throw error;
      }
    }

    return success(res, { course: toPublicCoursePreview(course), enrollment }, "Course added to My Learning", 201);
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

    return success(res, { course: toPublicCoursePreview(course), savedCourse }, "Course saved");
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

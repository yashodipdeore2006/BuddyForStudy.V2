import mongoose from "mongoose";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";
import { buildTopicKeys } from "./generatedCourseCache.service.js";
import { curateNormalSearch } from "./courseCurationDecisionEngine.service.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { evaluateCourseReadiness } from "../utils/courseReadiness.js";

const GENERATED_COURSE_MODES = ["normal", "ai", "module", "discovery"];
const PUBLICATION_APPROVAL_FILTER = {
  $or: [
    { "generation.mode": { $nin: GENERATED_COURSE_MODES } },
    {
      aiReviewStatus: "approved",
      $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
    }
  ]
};
function isApprovedForPublication(course) {
  return !GENERATED_COURSE_MODES.includes(course?.generation?.mode) ||
    (course?.aiReviewStatus === "approved" && (Boolean(course?.aiReviewedBy) || course?.aiReviewSource === "automatic"));
}

async function applyGeneratedCourseApprovalPolicy(course) {
  const setting = await PlatformSetting.findOne({ key: "content_approval_ai_courses" }).select("value").lean();
  if (setting?.value !== "automatic") {
    course.isPublished = false;
    course.status = "draft";
    course.aiReviewStatus = "pending";
    course.aiReviewSource = "manual";
    course.aiReviewedBy = null;
    course.aiReviewedAt = null;
    course.aiReviewNote = "";
    return course;
  }

  course.aiReviewStatus = "approved";
  course.aiReviewSource = "automatic";
  course.aiReviewedBy = null;
  course.aiReviewedAt = new Date();
  course.aiReviewNote = "Automatically approved by the platform content policy.";
  if (evaluateCourseReadiness(course).ready) {
    course.isPublished = true;
    course.status = "published";
    course.visibility = "public";
  } else {
    course.isPublished = false;
    course.status = "draft";
  }
  return course;
}

function normalizeSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeRegex(value) {
  const regexCharacters = "\\^$.*+?()[]{}|";
  return [...String(value || "")].map((char) => regexCharacters.includes(char) ? "\\" + char : char).join("");
}

function buildCourseSearchFilter(search) {
  const query = String(search || "").trim();
  if (!query) return null;

  const regex = new RegExp(escapeRegex(query), "i");

  return {
    $or: [
      { title: regex },
      { description: regex },
      { category: regex },
      { learningOutcomes: regex },
      { "modules.title": regex },
      { "modules.description": regex },
      { "modules.lessons.title": regex },
      { "modules.lessons.description": regex },
      { "modules.lessons.tutorial.playlistTitle": regex },
      { "modules.lessons.tutorial.videos.title": regex },
      { "modules.lessons.tutorial.videos.description": regex },
      { "modules.lessons.tutorial.videos.channelTitle": regex }
    ]
  };
}

function buildDirectCourseSearchFilter(search) {
  const query = String(search || "").trim();
  if (!query) return null;

  const regex = new RegExp(escapeRegex(query), "i");
  return {
    $or: [
      { title: regex },
      { description: regex },
      { category: regex },
      { learningOutcomes: regex }
    ]
  };
}
function normalizeSearchTokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+#.]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function textMatchesSearch(value, searchTokens) {
  const tokens = normalizeSearchTokens(value);
  return searchTokens.every((token) => tokens.includes(token));
}

function moduleMatchesSearch(module, searchTokens) {
  if (!module || !searchTokens.length) return false;

  const values = [
    module.title,
    module.description,
    ...(module.lessons || []).flatMap((lesson) => [
      lesson.title,
      lesson.description,
      lesson.tutorial?.playlistTitle,
      ...(lesson.tutorial?.videos || []).flatMap((video) => [
        video.title,
        video.description,
        video.channelTitle
      ])
    ])
  ];

  return values.some((value) => textMatchesSearch(value, searchTokens));
}

function standaloneCourseFromModule(parent, module) {
  const lessons = (module.lessons || []).map((lesson, index) => ({
    title: lesson.title,
    description: lesson.description || "",
    type: lesson.type,
    order: lesson.order || index + 1,
    ...(lesson.type === "tutorial"
      ? {
          tutorial: {
            content: lesson.tutorial?.content || "",
            resources: lesson.tutorial?.resources || [],
            videos: lesson.tutorial?.videos || [],
            playlistId: lesson.tutorial?.playlistId || "",
            playlistTitle: lesson.tutorial?.playlistTitle || ""
          }
        }
      : {
          project: lesson.project || {}
        })
  }));

  const firstVideo = (module.lessons || [])
    .flatMap((lesson) => lesson.tutorial?.videos || [])
    .find((video) => video?.thumbnail || video?.url);

  const sourceModuleId = String(module._id);
  const title = String(module.title || "Learning Module").trim();
  const parentTitle = String(parent.title || "course").trim();
  const slugBase = normalizeSlug(title + "-" + parentTitle + "-" + sourceModuleId.slice(-8));

  return {
    title,
    slug: slugBase,
    description: module.description
      ? String(module.description)
      : "Standalone " + title + " course extracted from the " + parentTitle + " curriculum.",
    category: parent.category || "Learning",
    level: parent.level || "Beginner",
    duration: "Self-paced",
    thumbnail: firstVideo?.thumbnail || parent.thumbnail || "",
    learningOutcomes: ["Learn " + title],
    modules: [{
      title,
      description: module.description || "Learn " + title + " through the selected curriculum lessons.",
      order: 1,
      lessons
    }],
    isPublished: false,
    pricing: parent.pricing || { mode: "free", price: 0, currency: "INR" },
    enrollmentEnabled: parent.enrollmentEnabled !== false,
    certificateEnabled: parent.certificateEnabled !== false,
    featured: false,
    generation: {
      mode: "module",
      query: title,
      topicKeys: buildTopicKeys(
        title,
        parent.title,
        ...(module.lessons || []).flatMap((lesson) => [
          lesson.title,
          lesson.tutorial?.playlistTitle,
          ...(lesson.tutorial?.videos || []).map((video) => video.title)
        ])
      ),
      sourceCourse: parent._id,
      sourceModuleId: module._id,
      snapshot: {
        sourceCourseId: String(parent._id),
        sourceCourseTitle: parent.title,
        sourceModuleId
      }
    }
  };
}

async function getStandaloneModuleCourses(search, { category, level } = {}) {
  const searchTokens = normalizeSearchTokens(search);
  if (!searchTokens.length) {
    return { courses: [], sourceCourseIds: [], standaloneIds: [] };
  }

  const candidateFilter = {
    isPublished: true,
    deletedAt: null,
    "generation.mode": { $ne: "module" },
    $and: [PUBLICATION_APPROVAL_FILTER],
    ...(category ? { category } : {}),
    ...(level ? { level } : {}),
    $or: [
      { "modules.title": new RegExp(escapeRegex(search), "i") },
      { "modules.description": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.title": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.description": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.tutorial.playlistTitle": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.tutorial.videos.title": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.tutorial.videos.description": new RegExp(escapeRegex(search), "i") },
      { "modules.lessons.tutorial.videos.channelTitle": new RegExp(escapeRegex(search), "i") }
    ]
  };

  const parents = await Course.find(candidateFilter)
    .select("title description category level duration thumbnail pricing enrollmentEnabled certificateEnabled modules")
    .lean();

  const matches = [];
  for (const parent of parents) {
    for (const module of parent.modules || []) {
      if (moduleMatchesSearch(module, searchTokens)) {
        matches.push({ parent, module });
      }
    }
  }

  if (!matches.length) {
    return { courses: [], sourceCourseIds: [], standaloneIds: [] };
  }

  const courses = [];
  const sourceCourseIds = new Set();

  for (const { parent, module } of matches) {
    sourceCourseIds.add(String(parent._id));

    const matchFilter = {
      "generation.mode": "module",
      "generation.sourceCourse": parent._id,
      "generation.sourceModuleId": module._id,
      deletedAt: null
    };

    const existing = await Course.findOne(matchFilter).lean();
    if (existing) {
      if (existing.isPublished && isApprovedForPublication(existing)) courses.push(existing);
      continue;
    }

    const payload = await applyGeneratedCourseApprovalPolicy(standaloneCourseFromModule(parent, module));

    try {
      const created = await Course.findOneAndUpdate(
        {
          "generation.mode": "module",
          "generation.sourceCourse": parent._id,
          "generation.sourceModuleId": module._id
        },
        { $setOnInsert: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      if (created?.isPublished && !created.deletedAt && isApprovedForPublication(created)) courses.push(created);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await Course.findOne(matchFilter).lean();
        if (duplicate?.isPublished && !duplicate.deletedAt && isApprovedForPublication(duplicate)) courses.push(duplicate);
        else throw error;
      } else {
        throw error;
      }
    }
  }

  const uniqueCourses = [...new Map(courses.map((item) => [String(item._id), item])).values()];
  return {
    courses: uniqueCourses,
    sourceCourseIds: [...sourceCourseIds],
    standaloneIds: uniqueCourses.map((item) => String(item._id))
  };
}


function hasMultipleTutorialVideos(course) {
  return (course?.modules || []).some((module) =>
    (module.lessons || []).some(
      (lesson) => lesson.type === "tutorial" && (lesson.tutorial?.videos || []).length > 1
    )
  );
}

function normalizeMultiVideoLessons(course) {
  let changed = false;

  for (const module of course.modules || []) {
    const originalLessons = module.lessons || [];
    const rebuilt = [];

    for (let index = 0; index < originalLessons.length; index += 1) {
      const lesson = originalLessons[index];
      const videos = lesson.type === "tutorial" ? (lesson.tutorial?.videos || []) : [];
      
      if (videos.length <= 1) {
        rebuilt.push(lesson);
        continue;
      }

      changed = true;
      const nextLesson = originalLessons[index + 1];
      const shouldCloneLessonQuiz =
        nextLesson?.type === "quiz" &&
        nextLesson.quiz?.scope === "lesson";

      for (let videoIndex = 0; videoIndex < videos.length; videoIndex += 1) {
        const video = videos[videoIndex];
        const tutorial = {
          ...(lesson.toObject ? lesson.toObject() : { ...lesson }),
          title:
            videoIndex === 0
              ? lesson.title
              : `${lesson.title} — Part ${videoIndex + 1}`,
          type: "tutorial",
          tutorial: {
            ...(lesson.tutorial?.toObject
              ? lesson.tutorial.toObject()
              : { ...(lesson.tutorial || {}) }),
            videos: [video],
            resources: video.url ? [video.url] : [],
            resourceStatus: "ready",
            selection: {
              ...(lesson.tutorial?.selection?.toObject
                ? lesson.tutorial.selection.toObject()
                : { ...(lesson.tutorial?.selection || {}) }),
              selectedVideoId: video.videoId,
              selectedVideoTitle: video.title || ""
            }
          }
        };

        if (videoIndex > 0) delete tutorial._id;

        rebuilt.push(tutorial);

        if (shouldCloneLessonQuiz) {
          const quiz = {
            ...(nextLesson.toObject ? nextLesson.toObject() : { ...nextLesson }),
            title:
              videoIndex === 0
                ? nextLesson.title || `${lesson.title} Quiz`
                : `${lesson.title} — Part ${videoIndex + 1} Quiz`,
            type: "quiz",
            quiz: nextLesson.quiz?.toObject
              ? nextLesson.quiz.toObject()
              : { ...(nextLesson.quiz || {}) }
          };

          if (videoIndex > 0) delete quiz._id;
          rebuilt.push(quiz);
        }
      }

      if (shouldCloneLessonQuiz) index += 1;
    }

    rebuilt.forEach((item, itemIndex) => {
      item.order = itemIndex + 1;
    });
    module.lessons = rebuilt;
  }

  return changed;
}

function totalLessons(course) {
  return course.modules.reduce((count, module) => count + module.lessons.length, 0);
}

function courseSummary(course) {
  return {
    id: course._id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    category: course.category,
    level: course.level,
    duration: course.duration,
    thumbnail: course.thumbnail,
    learningOutcomes: course.learningOutcomes,
    isPublished: course.isPublished
  };
}


function courseContentCountsStage() {
  return {
    $addFields: {
      moduleCount: { $size: { $ifNull: ["$modules", []] } },
      lessonCount: {
        $sum: {
          $map: {
            input: { $ifNull: ["$modules", []] },
            as: "module",
            in: { $size: { $ifNull: ["$module.lessons", []] } }
          }
        }
      }
    }
  };
}

export async function listPublished({ page = 1, limit = 20, search, category, level, sort = "recent" }) {
  const filter = { isPublished: true, deletedAt: null, $and: [PUBLICATION_APPROVAL_FILTER] };
  if (category) filter.category = category;
  if (level) filter.level = level;

  const normalizedSearch = String(search || "").trim();

  if (normalizedSearch) {
    const directFilter = buildDirectCourseSearchFilter(normalizedSearch);
    const directCandidates = directFilter
      ? await Course.aggregate([
          { $match: { ...filter, ...directFilter } },
          courseContentCountsStage(),
          { $project: { modules: 0 } },
          { $sort: { createdAt: -1 } }
        ])
      : [];

    const nonModuleDirectCourses = directCandidates.filter(
      (course) => course.generation?.mode !== "module"
    );
    let localCourses = nonModuleDirectCourses.slice(
      (page - 1) * limit,
      page * limit
    );

    if (!localCourses.length) {
      const standalone = await getStandaloneModuleCourses(normalizedSearch, {
        category,
        level
      });

      localCourses = standalone.courses.slice(
        (page - 1) * limit,
        page * limit
      );
    }

    let curation = { resources: [], meta: { version: "course-curation-decision-engine-v1", resultsShown: 0 } };
    let youtubeError = "";

    try {
      curation = await curateNormalSearch(normalizedSearch, { category, level });
      youtubeError = String(curation?.meta?.youtubeError || "");
    } catch (error) {
      youtubeError = error instanceof Error ? error.message : "YouTube course curation is unavailable";
      console.error("Course Curation Decision Engine failed", {
        query: normalizedSearch,
        message: youtubeError
      });
      curation = {
        resources: [],
        meta: {
          version: "course-curation-decision-engine-v1",
          resultsShown: 0,
          error: youtubeError
        }
      };
    }

    const localTotal = nonModuleDirectCourses.length || localCourses.length;
    const hasLocalResults = localCourses.length > 0;

    return {
      courses: localCourses,
      pagination: {
        page,
        limit,
        total: hasLocalResults ? localTotal : 0,
        pages: hasLocalResults ? Math.ceil(localTotal / limit) : 0
      },
      discovery: {
        mode: "youtube_supplementary",
        query: normalizedSearch,
        courseRecommendations: [],
        curatedResources: curation.resources || [],
        curationMeta: curation.meta || null,
        youtubeError,
        hasLocalResults
      }
    };
  }

  if (sort === "popular") {
    const [courses, total] = await Promise.all([
      Course.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "enrollments",
            let: { courseId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$course", "$$courseId"] },
                      { $in: ["$status", ["active", "completed"]] }
                    ]
                  }
                }
              },
              { $count: "count" }
            ],
            as: "enrollmentStats"
          }
        },
        {
          $addFields: {
            enrollmentCount: {
              $ifNull: [{ $arrayElemAt: ["$enrollmentStats.count", 0] }, 0]
            }
          }
        },
        courseContentCountsStage(),
        { $project: { modules: 0, enrollmentStats: 0 } },
        { $sort: { enrollmentCount: -1, featured: -1, createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ]),
      Course.countDocuments(filter)
    ]);

    return {
      courses,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }

  const [courses, total] = await Promise.all([
    Course.aggregate([
      { $match: filter },
      courseContentCountsStage(),
      { $project: { modules: 0 } },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]),
    Course.countDocuments(filter)
  ]);

  return {
    courses,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
export async function getPublished(courseId, userId = null) {
  const key = `course:${courseId}`;
  const cached = await cacheGet(key);
  if (cached) {
    if (cached.deletedAt || cached.status === "archived") return null;
    if (cached.visibility === "private") {
      const owner = userId && String(cached.createdForUser) === String(userId);
      if (!owner || !isApprovedForPublication(cached) || cached.aiReviewStatus !== "approved") return null;
      const enrollment = await Enrollment.exists({
        user: userId,
        course: cached._id,
        status: { $in: ["active", "completed"] },
        revokedBy: null
      });
      return enrollment ? cached : null;
    }
    // Existing enrolled learners retain access to non-archived courses even
    // when a course is no longer listed publicly. Explicit moderation holds,
    // rejections, soft deletion and revoked enrollments still block access.
    if (userId && !["pending", "rejected"].includes(cached.aiReviewStatus)) {
      const enrollment = await Enrollment.exists({
        user: userId,
        course: cached._id,
        status: { $in: ["active", "completed"] },
        revokedBy: null
      });
      if (enrollment) return cached;
    }
    if (!cached.isPublished) {
      await cacheDelete(key);
      return null;
    }
    if (isApprovedForPublication(cached) && !hasMultipleTutorialVideos(cached)) return cached;
    await cacheDelete(key);
    return null;
  }

  const accessBranches = [{ isPublished: true, $and: [PUBLICATION_APPROVAL_FILTER] }];
  if (userId) accessBranches.push({
    visibility: "private",
    createdForUser: userId,
    aiReviewStatus: "approved",
    $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
  });
  let courseDoc = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    status: { $ne: "archived" },
    $or: accessBranches
  });

  if (!courseDoc && userId) {
    const existingEnrollment = await Enrollment.exists({
      user: userId,
      course: courseId,
      status: { $in: ["active", "completed"] },
      revokedBy: null
    });
    if (existingEnrollment) {
      courseDoc = await Course.findOne({
        _id: courseId,
        deletedAt: null,
        status: { $ne: "archived" },
        visibility: { $ne: "private" },
        aiReviewStatus: { $nin: ["pending", "rejected"] }
      });
    }
  }
  if (!courseDoc) return null;
  if (courseDoc.visibility === "private") {
    const enrollment = await Enrollment.exists({
      user: userId,
      course: courseDoc._id,
      status: { $in: ["active", "completed"] },
      revokedBy: null
    });
    if (!enrollment) return null;
  }

  if (courseDoc.visibility !== "private" && normalizeMultiVideoLessons(courseDoc)) {
    courseDoc.$locals.revisionContext = { source: "system", summary: "Video resource normalization", reason: "" };
    await courseDoc.save();
  }

  const course = courseDoc.toObject();
  void cacheSet(key, course, 120);
  return course;
}

export async function getAny(courseId) {
  return Course.findById(courseId);
}

export async function createCourse(input) {
  const slug = input.slug ? normalizeSlug(input.slug) : normalizeSlug(input.title);
  const generated = ["normal", "ai", "module", "discovery"].includes(input.generation?.mode);
  const course = await Course.create({
    ...input, slug, isPublished: false, status: "draft",
    ...(generated ? { aiReviewStatus: "pending", aiReviewedBy: null, aiReviewedAt: null } : {})
  });
  await cacheDelete(`course:${course._id}`);
  return course;
}

export async function updateCourse(courseId, input, context = {}) {
  if (input.slug) input.slug = normalizeSlug(input.slug);
  if (input.isPublished === true) {
    const error = new Error("Use the readiness-gated publish action to publish a course.");
    error.status = 400;
    throw error;
  }
  const course = await Course.findById(courseId);
  if (!course || course.deletedAt) return null;
  for (const [key, value] of Object.entries(input)) {
    if (key === "isPublished" && value === true) continue;
    if (key === "reason" || key === "deletedAt" || key === "status" || key === "aiReviewStatus" || key === "aiReviewedBy" || key === "aiReviewedAt") continue;
    course.set(key, value);
  }
  if (input.isPublished === false) course.isPublished = false;
  course.$locals.revisionContext = {
    actor: context.actor || null, source: "admin",
    reason: String(context.reason || "Admin course update").trim().slice(0, 500),
    summary: "Course updated through course API"
  };
  await course.save();
  await cacheDelete(`course:${courseId}`);
  return course;
}

export async function deleteCourse(courseId, context = {}) {
  const course = await Course.findById(courseId);
  if (!course) return null;
  if (course.deletedAt) return course;
  course.deletedAt = new Date();
  course.isPublished = false;
  course.status = "draft";
  course.$locals.revisionContext = {
    actor: context.actor || null, source: "admin",
    reason: String(context.reason || "Admin soft delete").trim().slice(0, 500),
    summary: "Course soft-deleted through course API"
  };
  await course.save();
  await cacheDelete(`course:${courseId}`);
  return course;
}

export function findLearningItem(course, itemId) {
  for (const module of course.modules || []) {
    const item = (module.lessons || []).find(
      (lesson) => String(lesson._id || lesson.id) === String(itemId)
    );
    if (item) return { module, item };
  }
  return null;
}

export { courseSummary, totalLessons, normalizeMultiVideoLessons, hasMultipleTutorialVideos };

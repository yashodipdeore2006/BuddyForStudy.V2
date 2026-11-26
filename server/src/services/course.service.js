import { Course, resolveGeneratedCoursePricingPreview } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";
import { buildTopicKeys } from "./generatedCourseCache.service.js";
import { curateNormalSearch } from "./courseCurationDecisionEngine.service.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { evaluateCourseReadiness } from "../utils/courseReadiness.js";
import { buildCourseDomainFilter, COURSE_DOMAIN_IDS, filterCoursesByInferredDomain, filterLearningResourcesByInferredDomain, getCourseTaxonomy, inferCourseDomain, resolveCourseDomain } from "../utils/courseTaxonomy.js";
import { getCachedCourseTaxonomy, setCachedCourseTaxonomy, invalidateCourseTaxonomyCache } from "./courseTaxonomyCache.service.js";
import { addCourseRankingMetadata, rankCoursesForSearch } from "../utils/courseRanking.js";

const COURSE_RATING_LOOKUP_STAGE = {
  $lookup: {
    from: "course_reviews",
    let: { courseId: "$_id" },
    pipeline: [
      {
        $match: {
          $expr: { $eq: ["$course", "$$courseId"] },
          isHidden: { $ne: true },
          moderationStatus: "approved"
        }
      },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
      { $project: { _id: 0, average: { $round: ["$average", 1] }, count: 1 } }
    ],
    as: "courseRatingStats"
  }
};
const COURSE_RATING_FIELDS_STAGE = {
  $addFields: {
    ratingAverage: { $ifNull: [{ $arrayElemAt: ["$courseRatingStats.average", 0] }, 0] },
    ratingCount: { $ifNull: [{ $arrayElemAt: ["$courseRatingStats.count", 0] }, 0] }
  }
};
const COURSE_ENROLLMENT_LOOKUP_STAGE = {
  $lookup: {
    from: "enrollments",
    let: { courseId: "$_id" },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ["$course", "$courseId"] },
              { $in: ["$status", ["active", "completed"]] }
            ]
          }
        }
      },
      { $count: "count" }
    ],
    as: "enrollmentStats"
  }
};
const COURSE_ENROLLMENT_FIELDS_STAGE = {
  $addFields: {
    enrollmentCount: { $ifNull: [{ $arrayElemAt: ["$enrollmentStats.count", 0] }, 0] }
  }
};
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

function buildDirectCourseSearchFilter(search) {
  const query = String(search || "").trim();
  if (!query) return null;

  const regex = new RegExp(escapeRegex(query), "i");
  return {
    $or: [
      { title: regex },
      { description: regex },
      { category: regex },
      { learningOutcomes: regex },
      { tags: regex }
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
    domain: parent.domain || null,
    tags: parent.tags || [],
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

async function getStandaloneModuleCourses(search, { category, domain, level, searchDomain } = {}) {
  const searchTokens = normalizeSearchTokens(search);
  if (!searchTokens.length) {
    return { courses: [], sourceCourseIds: [], standaloneIds: [] };
  }

  const candidateConditions = [PUBLICATION_APPROVAL_FILTER];
  const selectedDomainFilter = domain ? buildCourseDomainFilter(domain) : null;
  if (selectedDomainFilter) candidateConditions.push(selectedDomainFilter);
  const candidateFilter = {
    isPublished: true,
    deletedAt: null,
    status: { $ne: "archived" },
    "generation.mode": { $ne: "module" },
    $and: candidateConditions,
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
    .select("title description category domain tags level duration thumbnail pricing enrollmentEnabled certificateEnabled modules")
    .lean();

  const matches = [];
  for (const parent of filterCoursesByInferredDomain(parents, searchDomain)) {
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
    const inheritParentTaxonomy = (course) => ({
      ...course,
      domain: course.domain || parent.domain || null,
      tags: Array.isArray(course.tags) && course.tags.length ? course.tags : (parent.tags || [])
    });
    if (existing) {
      if (existing.isPublished && !existing.deletedAt && existing.status !== "archived" && isApprovedForPublication(existing)) {
        courses.push(inheritParentTaxonomy(existing));
      }
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

      if (created?.isPublished && !created.deletedAt && created.status !== "archived" && isApprovedForPublication(created)) courses.push(inheritParentTaxonomy(created));
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await Course.findOne(matchFilter).lean();
        if (duplicate?.isPublished && !duplicate.deletedAt && duplicate.status !== "archived" && isApprovedForPublication(duplicate)) courses.push(inheritParentTaxonomy(duplicate));
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

function boundedRatioExpression(numerator, denominator) {
  return { $min: [1, { $max: [0, { $divide: [numerator, denominator] }] }] };
}

function courseRankingSortStages(sort, now = new Date()) {
  const descriptionLength = { $strLenCP: { $trim: { input: { $ifNull: ["$description", ""] } } } };
  const titleLength = { $strLenCP: { $trim: { input: { $ifNull: ["$title", ""] } } } };
  const categoryLength = { $strLenCP: { $trim: { input: { $ifNull: ["$category", ""] } } } };
  const domainLength = { $strLenCP: { $trim: { input: { $ifNull: ["$domain", ""] } } } };
  const durationLength = { $strLenCP: { $trim: { input: { $ifNull: ["$duration", ""] } } } };
  const outcomeCount = { $size: { $ifNull: ["$learningOutcomes", []] } };
  const tagCount = { $size: { $ifNull: ["$tags", []] } };
  const validRating = {
    $and: [
      { $gt: ["$ratingCount", 0] },
      { $gte: ["$ratingAverage", 1] },
      { $lte: ["$ratingAverage", 5] }
    ]
  };
  const validCount = { $cond: [validRating, "$ratingCount", 0] };
  const validAverage = { $cond: [validRating, "$ratingAverage", 3.5] };
  const adjustedRating = {
    $divide: [
      { $add: [{ $multiply: [validAverage, validCount] }, 35] },
      { $add: [validCount, 10] }
    ]
  };
  const ratingScore = {
    $round: [{ $multiply: [{ $divide: [{ $subtract: [adjustedRating, 1] }, 4] }, 100] }, 2]
  };
  const ageDays = {
    $max: [0, {
      $divide: [
        { $subtract: [now, { $ifNull: ["$createdAt", new Date(0)] }] },
        86400000
      ]
    }]
  };
  const popularityScore = {
    $round: [{
      $min: [100, {
        $multiply: [
          { $divide: [{ $ln: { $add: ["$enrollmentCount", 1] } }, Math.log(1001)] },
          100
        ]
      }]
    }, 2]
  };
  const completeness = {
    $round: [{ $add: [
      { $cond: [{ $gt: [titleLength, 0] }, 5, 0] },
      { $multiply: [15, boundedRatioExpression(descriptionLength, 300)] },
      { $cond: [{ $gt: [categoryLength, 0] }, 5, 0] },
      { $cond: [{ $gt: [domainLength, 0] }, 5, 0] },
      { $cond: [{ $gt: [durationLength, 0] }, 5, 0] },
      { $multiply: [5, boundedRatioExpression(tagCount, 3)] },
      { $multiply: [20, boundedRatioExpression(outcomeCount, 5)] },
      { $multiply: [15, boundedRatioExpression("$moduleCount", 4)] },
      { $multiply: [25, boundedRatioExpression("$lessonCount", 16)] }
    ] }, 2]
  };
  const curriculumCoverage = {
    $round: [{ $add: [
      { $multiply: [35, boundedRatioExpression(outcomeCount, 5)] },
      { $multiply: [25, boundedRatioExpression("$moduleCount", 5)] },
      { $multiply: [40, boundedRatioExpression("$lessonCount", 20)] }
    ] }, 2]
  };
  const freshnessScore = {
    $round: [{
      $multiply: [100, {
        $exp: {
          $divide: [{ $multiply: [-1, ageDays] }, 730]
        }
      }]
    }, 2]
  };
  const qualityScore = {
    $round: [{ $add: [
      { $multiply: [completeness, 0.45] },
      { $multiply: [curriculumCoverage, 0.25] },
      { $multiply: [ratingScore, 0.30] }
    ] }, 2]
  };
  const rankingScore = {
    $round: [{ $add: [
      { $multiply: [completeness, 0.25] },
      { $multiply: [curriculumCoverage, 0.15] },
      { $multiply: [ratingScore, 0.15] },
      { $multiply: [popularityScore, 0.05] },
      { $multiply: [freshnessScore, 0.05] }
    ] }, 2]
  };

  let primarySort;
  if (sort === "title") primarySort = { title: 1 };
  else if (sort === "quality") primarySort = { _qualityScore: -1, _rankingScore: -1 };
  else if (sort === "popular") primarySort = { enrollmentCount: -1, _qualityScore: -1 };
  else if (sort === "highest_rated") primarySort = { _ratingScore: -1, _validRatingCount: -1, _qualityScore: -1 };
  else if (sort === "newest") primarySort = { createdAt: -1, _rankingScore: -1, _qualityScore: -1 };
  else primarySort = { _rankingScore: -1, _qualityScore: -1 };

  return [
    { $addFields: {
      _validRatingCount: validCount,
      _ratingScore: ratingScore,
      _qualityScore: qualityScore,
      _rankingScore: rankingScore
    } },
    { $sort: { ...primarySort, createdAt: -1, _id: 1 } },
    { $unset: ["_validRatingCount", "_ratingScore", "_qualityScore", "_rankingScore"] }
  ];
}

async function attachCourseRankingStats(courses) {
  if (!Array.isArray(courses) || !courses.length) return [];
  const ids = courses.map((course) => course?._id).filter(Boolean);
  const stats = await Course.aggregate([
    { $match: { _id: { $in: ids } } },
    COURSE_ENROLLMENT_LOOKUP_STAGE,
    COURSE_ENROLLMENT_FIELDS_STAGE,
    COURSE_RATING_LOOKUP_STAGE,
    COURSE_RATING_FIELDS_STAGE,
    { $project: { _id: 1, enrollmentCount: 1, ratingAverage: 1, ratingCount: 1 } }
  ]);
  const byId = new Map(stats.map((entry) => [String(entry._id), entry]));
  return courses.map((course) => ({ ...course, ...(byId.get(String(course._id)) || {}) }));
}


function effectiveDiscoveryPricingPreview(pricing = {}) {
  const currency = String(pricing.currency || "INR").toUpperCase();
  if (pricing.mode === "free") return { mode: "free", price: 0, currency };
  const basePrice = Number(pricing.price);
  if (pricing.mode !== "paid" || !Number.isFinite(basePrice) || basePrice <= 0) {
    return { mode: "unknown", currency };
  }
  const salePrice = Number(pricing.salePrice);
  const activeSale = pricing.saleEnabled === true &&
    Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice;
  return { mode: "paid", price: activeSale ? salePrice : basePrice, currency, ...(activeSale ? { salePrice, basePrice } : {}) };
}

export async function getDiscoveryPricingPreview(level) {
  const normalizedLevel = ["Beginner", "Intermediate", "Advanced"].includes(level) ? level : "Beginner";
  const pricing = await resolveGeneratedCoursePricingPreview({
    title: "YouTube Discovery price preview",
    category: "YouTube Discovery",
    level: normalizedLevel,
    modules: [{ title: "YouTube Discovery", lessons: [{ type: "tutorial" }] }],
    generation: { mode: "discovery" },
    pricing: { mode: "free", price: 0, compareAtPrice: 0, currency: "INR", saleEnabled: false, salePrice: 0 }
  });
  return effectiveDiscoveryPricingPreview(pricing);
}

async function getDiscoveryPricingPreviews(resources, level) {
  const items = Array.isArray(resources) ? resources : [];
  const pairs = items.filter((resource) => resource?.sourceType && resource?.sourceId).map((resource) => ({
    resourceType: resource.sourceType,
    resourceId: String(resource.sourceId)
  }));
  const existingCourses = pairs.length ? await Course.find({
    "generation.mode": "discovery",
    deletedAt: null,
    $or: pairs.map(({ resourceType, resourceId }) => ({
      "generation.sourceResourceType": resourceType,
      "generation.sourceResourceId": resourceId
    }))
  }).select("pricing level generation.sourceResourceType generation.sourceResourceId").lean() : [];
  const existingByKey = new Map(existingCourses.map((course) => [
    String(course.generation?.sourceResourceType || "") + ":" + String(course.generation?.sourceResourceId || ""),
    course
  ]));
  const enrollmentCounts = existingCourses.length ? await Enrollment.aggregate([
    { $match: { course: { $in: existingCourses.map((course) => course._id) }, status: { $in: ["active", "completed"] } } },
    { $group: { _id: "$course", count: { $sum: 1 } } }
  ]) : [];
  const learnersByCourseId = new Map(enrollmentCounts.map((row) => [String(row._id), Number(row.count) || 0]));
  const configuredPreview = await getDiscoveryPricingPreview(level);
  const normalizedLevel = ["Beginner", "Intermediate", "Advanced"].includes(level) ? level : "Beginner";
  return items.map((resource) => {
    const key = String(resource?.sourceType || "") + ":" + String(resource?.sourceId || "");
    const existing = existingByKey.get(key);
    return {
      ...resource,
      learningLevel: existing?.level || normalizedLevel,
      learnerCount: existing ? (learnersByCourseId.get(String(existing._id)) || 0) : 0,
      // Saved prices win: reusing an existing resource must never display a
      // policy estimate that differs from the persisted course/checkout price.
      pricingPreview: existing ? effectiveDiscoveryPricingPreview(existing.pricing) : configuredPreview
    };
  });
}

export async function listPublished({ page = 1, limit = 20, search, category, domain, level, sort = "best_match" }) {
  const normalizedSort = ["best_match", "quality", "popular", "highest_rated", "newest", "title"].includes(sort)
    ? sort
    : "best_match";
  const filter = { isPublished: true, deletedAt: null, status: { $ne: "archived" }, $and: [PUBLICATION_APPROVAL_FILTER] };
  if (category) filter.category = category;
  if (level) filter.level = level;
  const selectedDomainFilter = domain ? buildCourseDomainFilter(domain) : null;
  if (selectedDomainFilter) filter.$and.push(selectedDomainFilter);

  const normalizedSearch = String(search || "").trim();

  if (normalizedSearch) {
    const inferredSearchDomain = inferCourseDomain(normalizedSearch);
    const directFilter = buildDirectCourseSearchFilter(normalizedSearch);
    const rawDirectCandidates = directFilter
      ? await Course.aggregate([
          { $match: { ...filter, ...directFilter } },
          courseContentCountsStage(),
          COURSE_ENROLLMENT_LOOKUP_STAGE,
          COURSE_ENROLLMENT_FIELDS_STAGE,
          { $project: { modules: 0, enrollmentStats: 0 } },
          COURSE_RATING_LOOKUP_STAGE,
          COURSE_RATING_FIELDS_STAGE,
          { $project: { courseRatingStats: 0 } },
          { $sort: { createdAt: -1, _id: 1 } }
        ])
      : [];
    const directCandidates = filterCoursesByInferredDomain(rawDirectCandidates, inferredSearchDomain);
    const nonModuleDirectCourses = directCandidates.filter((course) => course.generation?.mode !== "module");
    const rankedDirectCourses = rankCoursesForSearch(nonModuleDirectCourses, normalizedSearch, { sort: normalizedSort });
    let localTotal = rankedDirectCourses.length;
    let localCourses = rankedDirectCourses.slice((page - 1) * limit, page * limit);

    if (!rankedDirectCourses.length) {
      const standalone = await getStandaloneModuleCourses(normalizedSearch, {
        category,
        domain,
        level,
        searchDomain: inferredSearchDomain
      });
      const enrichedStandalone = await attachCourseRankingStats(standalone.courses);
      const rankedStandaloneCourses = rankCoursesForSearch(enrichedStandalone, normalizedSearch, { sort: normalizedSort });
      localTotal = rankedStandaloneCourses.length;
      localCourses = rankedStandaloneCourses.slice((page - 1) * limit, page * limit);
    }

    let curation;
    let youtubeError;
    try {
      curation = await curateNormalSearch(normalizedSearch, { category, level });
      const curationDomain = domain || inferredSearchDomain;
      if (curationDomain) {
        curation.resources = filterLearningResourcesByInferredDomain(curation.resources || [], curationDomain);
      }
      curation.resources = await getDiscoveryPricingPreviews(
        curation.resources || [],
        curation?.meta?.intent?.level || level
      );
      youtubeError = String(curation?.meta?.youtubeError || "");
    } catch (error) {
      youtubeError = error instanceof Error ? error.message : "YouTube course curation is unavailable";
      console.error("Course Curation Decision Engine failed", { query: normalizedSearch, message: youtubeError });
      curation = {
        resources: [],
        meta: { version: "course-curation-decision-engine-v1", resultsShown: 0, error: youtubeError }
      };
    }

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

  const [rawCourses, total] = await Promise.all([
    Course.aggregate([
      { $match: filter },
      courseContentCountsStage(),
      COURSE_ENROLLMENT_LOOKUP_STAGE,
      COURSE_ENROLLMENT_FIELDS_STAGE,
      { $project: { modules: 0, enrollmentStats: 0 } },
      COURSE_RATING_LOOKUP_STAGE,
      COURSE_RATING_FIELDS_STAGE,
      { $project: { courseRatingStats: 0 } },
      ...courseRankingSortStages(normalizedSort),
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]),
    Course.countDocuments(filter)
  ]);
  const courses = addCourseRankingMetadata(rawCourses, "", { sort: normalizedSort });
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

/**
 * Course details may be viewed by the owner of an approved learner-private
 * generated course before enrollment. Learning endpoints still use getPublished
 * and retain their explicit enrollment/entitlement checks.
 */
export async function getCourseDetails(courseId, userId = null) {
  const published = await getPublished(courseId, userId);
  if (published || !userId) return published;

  const privatePreview = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    status: { $ne: "archived" },
    visibility: "private",
    createdForUser: userId,
    aiReviewStatus: "approved",
    $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
  }).lean();

  if (!privatePreview || !isApprovedForPublication(privatePreview)) return null;
  return privatePreview;
}

export async function getAny(courseId) {
  return Course.findById(courseId);
}

export async function invalidatePublicCourseTaxonomyCache() {
  await invalidateCourseTaxonomyCache();
}

export async function getPublicCourseTaxonomy() {
  const cached = await getCachedCourseTaxonomy();
  if (cached?.domains && Array.isArray(cached.categories)) return cached;

  const categoryRows = await Course.aggregate([
    {
      $match: {
        isPublished: true,
        deletedAt: null,
        status: { $ne: "archived" },
        $and: [PUBLICATION_APPROVAL_FILTER]
      }
    },
    { $group: { _id: { category: "$category", domain: "$domain" } } }
  ]);
  const categories = [...new Set(categoryRows
    .map((row) => String(row?._id?.category || "").trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categoriesByDomain = Object.fromEntries(COURSE_DOMAIN_IDS.map((domainId) => [domainId, []]));
  categoriesByDomain.unclassified = [];
  const seenCategoriesByDomain = new Set();
  for (const row of categoryRows) {
    const categoryValue = String(row?._id?.category || "").trim();
    if (!categoryValue) continue;
    const domainId = resolveCourseDomain(row?._id?.domain) || resolveCourseDomain(categoryValue);
    const key = (domainId || "unclassified") + ":" + categoryValue.toLowerCase();
    if (seenCategoriesByDomain.has(key)) continue;
    seenCategoriesByDomain.add(key);
    (domainId ? categoriesByDomain[domainId] : categoriesByDomain.unclassified).push(categoryValue);
  }
  for (const key of Object.keys(categoriesByDomain)) {
    categoriesByDomain[key].sort((a, b) => a.localeCompare(b));
  }
  const taxonomy = { ...getCourseTaxonomy(), categories, categoriesByDomain };
  await setCachedCourseTaxonomy(taxonomy);
  return taxonomy;
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
  // Content edits may trigger the model's publication-readiness hook even when
  // category/domain were not directly edited, so always refresh the public facets.
  await invalidatePublicCourseTaxonomyCache();
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
  await invalidatePublicCourseTaxonomyCache();
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

import mongoose from "mongoose";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";
import { buildTopicKeys } from "./generatedCourseCache.service.js";

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

function normalizeSearchTokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
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
    isPublished: true,
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

async function getStandaloneModuleCourses(search) {
  const searchTokens = normalizeSearchTokens(search);
  if (!searchTokens.length) {
    return { courses: [], sourceCourseIds: [], standaloneIds: [] };
  }

  const candidateFilter = {
    isPublished: true,
    "generation.mode": { $ne: "module" },
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
      isPublished: true
    };

    const existing = await Course.findOne(matchFilter).lean();
    if (existing) {
      courses.push(existing);
      continue;
    }

    const payload = standaloneCourseFromModule(parent, module);

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

      if (created) courses.push(created);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await Course.findOne(matchFilter).lean();
        if (duplicate) courses.push(duplicate);
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


export async function listPublished({ page = 1, limit = 20, search, category, level, sort = "recent" }) {
  const filter = { isPublished: true };
  if (category) filter.category = category;
  if (level) filter.level = level;

  const standalone = search ? await getStandaloneModuleCourses(search) : {
    courses: [],
    sourceCourseIds: [],
    standaloneIds: []
  };

  if (standalone.sourceCourseIds.length || standalone.standaloneIds.length) {
    const excludedIds = [...new Set([
      ...standalone.sourceCourseIds,
      ...standalone.standaloneIds
    ])].map((id) => new mongoose.Types.ObjectId(id));
    filter._id = { $nin: excludedIds };
  }

  const searchFilter = buildCourseSearchFilter(search);
  if (searchFilter) Object.assign(filter, searchFilter);

  const standaloneCourses = standalone.courses;
  const standaloneCount = standaloneCourses.length;
  const skip = (page - 1) * limit;
  const regularSkip = Math.max(skip - standaloneCount, 0);
  const pageStandalone = standaloneCourses.slice(skip, skip + limit);
  const regularLimit = Math.max(limit - pageStandalone.length, 0);

  const fetchRegular = async () => {
    if (regularLimit === 0 && standaloneCount > skip) {
      return { courses: [], total: 0 };
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
          { $project: { modules: 0, enrollmentStats: 0 } },
          { $sort: { enrollmentCount: -1, featured: -1, createdAt: -1 } },
          ...(regularSkip ? [{ $skip: regularSkip }] : []),
          ...(regularLimit ? [{ $limit: regularLimit }] : [])
        ]),
        Course.countDocuments(filter)
      ]);

      return { courses, total };
    }

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .select("-modules")
        .sort({ createdAt: -1 })
        .skip(regularSkip)
        .limit(regularLimit || limit)
        .lean(),
      Course.countDocuments(filter)
    ]);

    return { courses, total };
  };

  const regular = await fetchRegular();
  const courses = [...pageStandalone, ...regular.courses];
  const total = standaloneCount + regular.total;

  return {
    courses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}
export async function getPublished(courseId) {
  const key = `course:${courseId}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const course = await Course.findOne({ _id: courseId, isPublished: true }).lean();
  if (course) void cacheSet(key, course, 120);
  return course;
}

export async function getAny(courseId) {
  return Course.findById(courseId);
}

export async function createCourse(input) {
  const slug = input.slug ? normalizeSlug(input.slug) : normalizeSlug(input.title);
  const course = await Course.create({ ...input, slug });
  await cacheDelete(`course:${course._id}`);
  return course;
}

export async function updateCourse(courseId, input) {
  if (input.slug) input.slug = normalizeSlug(input.slug);
  const course = await Course.findByIdAndUpdate(courseId, input, { new: true, runValidators: true });
  await cacheDelete(`course:${courseId}`);
  return course;
}

export async function deleteCourse(courseId) {
  const course = await Course.findByIdAndDelete(courseId);
  if (!course) return null;
  await cacheDelete(`course:${courseId}`);
  await Promise.all([
    Enrollment.deleteMany({ course: courseId }),
    Progress.deleteMany({ course: courseId })
  ]);
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

export { courseSummary, totalLessons };

import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";
import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";

function normalizeSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
  if (search) filter.$text = { $search: search };

  const skip = (page - 1) * limit;

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
        { $skip: skip },
        { $limit: limit }
      ]),
      Course.countDocuments(filter)
    ]);

    return { courses, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  const [courses, total] = await Promise.all([
    Course.find(filter).select("-modules").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Course.countDocuments(filter)
  ]);

  return { courses, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getPublished(courseId) {
  const key = `course:${courseId}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const course = await Course.findOne({ _id: courseId, isPublished: true }).lean();
  if (course) await cacheSet(key, course, 120);
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

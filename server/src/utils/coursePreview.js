/**
 * Public catalogue projection. Keep this allowlist intentionally small:
 * lesson content, quiz answers, project briefs and provider URLs must only be
 * delivered by the authenticated learning endpoints after access checks.
 */
export function toPublicCoursePreview(course) {
  return {
    _id: course._id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    category: course.category,
    level: course.level,
    duration: course.duration,
    thumbnail: course.thumbnail,
    learningOutcomes: course.learningOutcomes || [],
    isPublished: course.isPublished,
    pricing: course.pricing,
    enrollmentEnabled: course.enrollmentEnabled,
    certificateEnabled: course.certificateEnabled,
    featured: course.featured,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    modules: (course.modules || []).map((module) => ({
      _id: module._id,
      title: module.title,
      order: module.order,
      lessons: (module.lessons || []).map((lesson) => ({
        _id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        order: lesson.order
      }))
    }))
  };
}

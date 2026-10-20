/**
 * Public catalogue projection. Keep this allowlist intentionally small:
 * lesson content, quiz answers, project briefs and provider URLs must only be
 * delivered by the authenticated learning endpoints after access checks.
 */
export function toPublicCoursePreview(course) {
  const modules = course.modules || [];
  const videosById = new Map();
  for (const module of modules) {
    for (const lesson of module.lessons || []) {
      for (const video of lesson.tutorial?.videos || []) {
        const key = String(video.videoId || video.url || video.title || "");
        if (key && !videosById.has(key)) videosById.set(key, video);
      }
    }
  }
  const snapshotModules = Array.isArray(course.generation?.snapshot?.modules) ? course.generation.snapshot.modules : [];
  const selectedResources = snapshotModules.map((module) => module?.course).filter(Boolean);
  // Snapshot-selected YouTube resources may exist before their videos are expanded
  // into lesson payloads. Count these too so playlist cards never report 0 videos.
  const selectedVideoKeys = new Set(selectedResources
    .map((resource) => String(resource.videoId || resource.url || resource.title || "").trim())
    .filter(Boolean));
  const videoCount = Math.max(videosById.size, selectedVideoKeys.size);
  const channelNames = [...new Set([
    ...[...videosById.values()].map((video) => String(video.channelTitle || "").trim()),
    ...selectedResources.map((video) => String(video.channelTitle || "").trim())
  ].filter(Boolean))];
  const scoredResources = selectedResources.filter((resource) => Number.isFinite(Number(resource.score)) && Number(resource.score) > 0);
  const qualityScore = scoredResources.length
    ? Math.round(scoredResources.reduce((sum, resource) => sum + Number(resource.score), 0) / scoredResources.length)
    : null;
  const viewCount = selectedResources.reduce((sum, resource) => sum + Math.max(0, Number(resource.viewCount) || 0), 0);
  const likeCount = selectedResources.reduce((sum, resource) => sum + Math.max(0, Number(resource.likeCount) || 0), 0);
  const sourceResourceType = course.generation?.sourceResourceType || null;
  const typeTag = course.generation?.mode === "ai"
    ? "AI roadmap"
    : sourceResourceType === "video" || videoCount === 1
      ? "Single video"
      : sourceResourceType === "playlist" || sourceResourceType === "series" || videoCount > 1
        ? "Playlist"
        : "Course";
  const firstPreviewVideoId = String(
    selectedResources.find((resource) => /^[a-zA-Z0-9_-]{11}$/.test(String(resource.videoId || "")))?.videoId ||
    [...videosById.values()].find((video) => /^[a-zA-Z0-9_-]{11}$/.test(String(video.videoId || "")))?.videoId ||
    ""
  );
  const cardMetadata = {
    ...(channelNames.length === 1 ? { creatorName: channelNames[0] } : channelNames.length > 1 ? { creatorName: "Multiple creators" } : {}),
    typeTag,
    videoCount,
    ...(firstPreviewVideoId ? { previewVideoId: firstPreviewVideoId } : {}),
    ...(qualityScore !== null ? { qualityScore } : {}),
    ...(viewCount > 0 ? { viewCount } : {}),
    ...(likeCount > 0 ? { likeCount } : {})
  };
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
    cardMetadata,
    ...(course.enrollmentCount !== undefined ? { enrollmentCount: course.enrollmentCount } : {}),
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    generation: course.generation ? {
      mode: course.generation.mode,
      sourceResourceType: course.generation.sourceResourceType || null,
      query: course.generation.query || ""
    } : undefined,
    modules: modules.map((module) => ({
      _id: module._id,
      title: module.title,
      order: module.order,
      lessons: (module.lessons || []).map((lesson) => {
        const videos = [...(lesson.tutorial?.videos || []), ...(lesson.project?.videos || [])];
        const durationSeconds = videos.reduce((sum, video) => sum + Math.max(0, Number(video.durationSeconds) || 0), 0);
        return {
          _id: lesson._id,
          title: lesson.title,
          type: lesson.type,
          order: lesson.order,
          ...(durationSeconds > 0 ? { durationSeconds } : {})
        };
      })
    }))
  };
}

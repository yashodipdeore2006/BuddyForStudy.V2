/**
 * Public catalogue projection. Keep this allowlist intentionally small:
 * lesson content, quiz answers, project briefs and provider URLs must only be
 * delivered by the authenticated learning endpoints after access checks.
 */
function parseDurationSeconds(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  const iso = text.match(/^pt(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = text.match(/^\d+(?::\d{1,2}){1,2}$/);
  if (clock) {
    const parts = text.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+)\s*m/);
  const seconds = text.match(/(\d+)\s*s/);
  return Math.round(Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0));
}

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
  const allResources = [...selectedResources, ...videosById.values()];
  const firstPreviewVideoId = String(
    allResources.find((resource) => /^[a-zA-Z0-9_-]{11}$/.test(String(resource.videoId || "")))?.videoId || ""
  );
  const firstCreatorResource = allResources.find((resource) =>
    String(resource.channelTitle || "").trim() && (String(resource.channelUrl || resource.channel_url || "").trim() || String(resource.channelId || "").trim())
  );
  const creatorUrl = firstCreatorResource
    ? String(firstCreatorResource.channelUrl || firstCreatorResource.channel_url || (firstCreatorResource.channelId ? "https://www.youtube.com/channel/" + encodeURIComponent(String(firstCreatorResource.channelId)) : "")).trim()
    : "";
  const cardMetadata = {
    ...(channelNames.length === 1 ? { creatorName: channelNames[0] } : channelNames.length > 1 ? { creatorName: "Multiple creators" } : {}),
    ...(creatorUrl.startsWith("https://www.youtube.com/") ? { creatorUrl } : {}),
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
        const sourceDuration = videos.reduce((sum, video) => sum + Math.max(0, Number(video.durationSeconds) || parseDurationSeconds(video.duration), 0), 0);
        const durationSeconds = Math.max(0, Number(lesson.durationSeconds) || 0, sourceDuration);
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

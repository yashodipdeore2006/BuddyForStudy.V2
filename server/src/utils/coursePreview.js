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


const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"]);

function getYouTubeVideoId(resource) {
  const directId = String(resource?.videoId || "").trim();
  if (YOUTUBE_VIDEO_ID_PATTERN.test(directId)) return directId;

  const rawUrl = String(resource?.url || "").trim();
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(hostname)) return "";

    const pathId = hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:[/?]|$)/)?.[1];
    const candidate = String(url.searchParams.get("v") || pathId || "").trim();
    return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

function getSafePreviewImageUrl(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? candidate : "";
  } catch {
    return "";
  }
}

function getPreviewThumbnailUrl(resource) {
  const storedThumbnail = getSafePreviewImageUrl(resource?.thumbnail);
  if (storedThumbnail) return storedThumbnail;
  const videoId = getYouTubeVideoId(resource);
  return videoId ? "https://i.ytimg.com/vi/" + encodeURIComponent(videoId) + "/hqdefault.jpg" : "";
}

function addYouTubeVideoRuntime(videoDurations, resource) {
  const videoId = getYouTubeVideoId(resource);
  if (!videoId) return;

  const declaredSeconds = Number(resource?.durationSeconds);
  const durationSeconds = Math.round(declaredSeconds > 0
    ? declaredSeconds
    : parseDurationSeconds(resource?.duration));
  if (durationSeconds <= 0) return;

  // A video can be referenced by several lessons or by the generation snapshot.
  // Keep one runtime per YouTube video ID and prefer the greatest verified value.
  videoDurations.set(videoId, Math.max(videoDurations.get(videoId) || 0, durationSeconds));
}

export function toPublicCoursePreview(course, options = {}) {
  const modules = course.modules || [];
  // List endpoints may supply narrow thumbnail-only resources without returning
  // full lesson/provider payloads to public catalogue clients.
  const thumbnailSource = options.thumbnailSource && typeof options.thumbnailSource === "object"
    ? options.thumbnailSource
    : course;
  const resourceModules = Array.isArray(thumbnailSource.modules) ? thumbnailSource.modules : modules;
  const videosById = new Map();
  const videoResources = [];
  for (const module of resourceModules) {
    for (const lesson of module.lessons || []) {
      const tutorialVideos = lesson.tutorial?.videos || [];
      const projectVideos = lesson.project?.videos || [];
      for (const video of [...tutorialVideos, ...projectVideos]) {
        if (video && typeof video === "object") videoResources.push(video);
      }
      for (const video of tutorialVideos) {
        const key = String(video.videoId || video.url || video.title || "");
        if (key && !videosById.has(key)) videosById.set(key, video);
      }
    }
  }
  const snapshot = thumbnailSource.generation?.snapshot || course.generation?.snapshot;
  const snapshotModules = Array.isArray(snapshot?.modules) ? snapshot.modules : [];
  const selectedResources = snapshotModules.map((module) => module?.course).filter(Boolean);

  // Expose only aggregate public metadata. Do not return the underlying YouTube
  // resource records from this public projection.
  const youtubeVideoDurations = new Map();
  for (const module of resourceModules) {
    for (const lesson of module.lessons || []) {
      for (const video of [
        ...(lesson.tutorial?.videos || []),
        ...(lesson.project?.videos || [])
      ]) {
        addYouTubeVideoRuntime(youtubeVideoDurations, video);
      }
    }
  }
  for (const resource of selectedResources) {
    addYouTubeVideoRuntime(youtubeVideoDurations, resource);
  }
  const youtubeRuntimeSeconds = [...youtubeVideoDurations.values()]
    .reduce((total, durationSeconds) => total + durationSeconds, 0);
  // Snapshot-selected YouTube resources may exist before their videos are expanded
  // into lesson payloads. Count these too so playlist cards never report 0 videos.
  const selectedVideoKeys = new Set(selectedResources
    .map((resource) => String(resource.videoId || resource.url || resource.title || "").trim())
    .filter(Boolean));
  const videoCount = Math.max(videosById.size, selectedVideoKeys.size);
  const channelNames = [...new Set([
    ...videoResources.map((video) => String(video.channelTitle || "").trim()),
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
  const allResources = [...selectedResources, ...videoResources];
  const firstPreviewResource = allResources.find((resource) => getYouTubeVideoId(resource));
  const firstPreviewVideoId = firstPreviewResource ? getYouTubeVideoId(firstPreviewResource) : "";
  const previewThumbnailUrl = firstPreviewResource ? getPreviewThumbnailUrl(firstPreviewResource) : "";
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
    youtubeVideoCount: youtubeVideoDurations.size,
    youtubeRuntimeSeconds,
    ...(firstPreviewVideoId ? { previewVideoId: firstPreviewVideoId } : {}),
    ...(previewThumbnailUrl ? { previewThumbnailUrl } : {}),
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
    domain: course.domain || null,
    tags: Array.isArray(course.tags) ? course.tags : [],
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
    moduleCount: Number.isFinite(Number(course.moduleCount)) ? Number(course.moduleCount) : modules.length,
    ...(course.lessonCount !== undefined ? { lessonCount: Number(course.lessonCount) || 0 } : {}),
    ...(course.enrollmentCount !== undefined ? { enrollmentCount: course.enrollmentCount } : {}),
    // Keep published review aggregates in the public course-card projection.
    ...(course.ratingAverage !== undefined ? { ratingAverage: Number(course.ratingAverage) || 0 } : {}),
    ...(course.ratingCount !== undefined ? { ratingCount: Number(course.ratingCount) || 0 } : {}),
    ...(course.ranking && typeof course.ranking === "object" ? { ranking: course.ranking } : {}),
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
          nodeType: lesson.nodeType,
          order: lesson.order,
          ...(durationSeconds > 0 ? { durationSeconds } : {})
        };
      })
    }))
  };
}

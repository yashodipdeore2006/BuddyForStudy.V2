function lessonVideos(lesson) {
  const videos = Array.isArray(lesson?.tutorial?.videos) ? lesson.tutorial.videos : [];
  return videos.flatMap((video) => Array.isArray(video?.items) && video.items.length ? video.items : [video]);
}

export function getCourseResourceMetrics(course) {
  const tutorialLessons = (course?.modules || []).flatMap((module) =>
    (module.lessons || []).filter((lesson) => lesson.type === "tutorial")
  );
  const uniqueVideos = new Map();
  let lessonsWithResources = 0;

  for (const lesson of tutorialLessons) {
    const resources = lessonVideos(lesson).filter((video) => String(video?.videoId || "").trim());
    if (resources.length) lessonsWithResources += 1;
    for (const video of resources) {
      const videoId = String(video.videoId).trim();
      if (!uniqueVideos.has(videoId)) {
        uniqueVideos.set(videoId, Math.max(0, Number(video.durationSeconds) || 0));
      }
    }
  }

  const tutorialLessonCount = tutorialLessons.length;
  const uniqueVideoCount = uniqueVideos.size;
  const videoWatchMinutes = Math.round([...uniqueVideos.values()].reduce((sum, seconds) => sum + seconds, 0) / 60);
  const coverageRatio = tutorialLessonCount ? lessonsWithResources / tutorialLessonCount : 0;

  return {
    tutorialLessonCount,
    lessonsWithResources,
    uniqueVideoCount,
    videoWatchMinutes,
    coverageRatio: Number(coverageRatio.toFixed(3))
  };
}

export function assessCourseResourceQuality(course, { completePath = false } = {}) {
  const metrics = getCourseResourceMetrics(course);
  const minimumVideos = metrics.tutorialLessonCount >= 3 ? (completePath ? 3 : 2) : 1;
  const minimumCoverage = completePath ? 0.6 : 0.5;
  const enoughCoverage = metrics.tutorialLessonCount > 0 && metrics.coverageRatio >= minimumCoverage;
  const enoughDistinctResources = metrics.uniqueVideoCount >= Math.min(minimumVideos, metrics.tutorialLessonCount);
  return {
    ...metrics,
    minimumVideos: Math.min(minimumVideos, metrics.tutorialLessonCount),
    minimumCoverage,
    acceptable: enoughCoverage && enoughDistinctResources,
    reason: !metrics.tutorialLessonCount
      ? "no_tutorial_lessons"
      : !enoughCoverage
        ? "insufficient_lesson_coverage"
        : !enoughDistinctResources
          ? "not_enough_distinct_videos"
          : null
  };
}

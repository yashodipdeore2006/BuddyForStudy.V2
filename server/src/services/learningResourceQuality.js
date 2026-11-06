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
  const plannedVideoMinutes = tutorialLessons.reduce((sum, lesson) => {
    const policy = lesson?.tutorial?.searchPolicy || lesson?.tutorial?.durationMinutes || {};
    return sum + Math.max(0, Number(policy.targetDurationMinutes ?? policy.targetMinutes) || 0);
  }, 0);

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
    plannedVideoMinutes,
    resourceRuntimeRatio: plannedVideoMinutes ? Number((videoWatchMinutes / plannedVideoMinutes).toFixed(3)) : 1,
    coverageRatio: Number(coverageRatio.toFixed(3))
  };
}

export function assessCourseResourceQuality(course, { completePath = false } = {}) {
  const metrics = getCourseResourceMetrics(course);
  // A complete path is only complete when every tutorial lesson has a resource,
  // and every lesson is backed by a distinct video. One generic video cannot
  // make several modules appear resource-complete.
  const minimumVideos = metrics.tutorialLessonCount >= 3
    ? (completePath ? Math.max(2, Math.ceil(metrics.tutorialLessonCount * 0.6)) : 2)
    : 1;
  // A personalized course remains useful when a small number of niche lessons
  // have no verified YouTube match. Do not discard the entire course for those gaps.
  const minimumCoverage = completePath ? 0.75 : 0.5;
  const enoughCoverage = metrics.tutorialLessonCount > 0 && metrics.coverageRatio >= minimumCoverage;
  const enoughDistinctResources = metrics.uniqueVideoCount >= Math.min(minimumVideos, metrics.tutorialLessonCount);
  // A complete personalized path must have meaningful video coverage, not merely
  // one tiny video attached to otherwise long scheduled study time.
  // Scheduled study time includes reading, practice and projects; it is not all video runtime.
  // Require modest real video coverage instead of 50% of the entire study schedule.
  const minimumRuntimeRatio = completePath && metrics.plannedVideoMinutes > 0 ? 0.15 : 0;
  const enoughRuntime = minimumRuntimeRatio === 0 || metrics.resourceRuntimeRatio >= minimumRuntimeRatio;
  return {
    ...metrics,
    minimumVideos: Math.min(minimumVideos, metrics.tutorialLessonCount),
    minimumCoverage,
    minimumRuntimeRatio,
    acceptable: enoughCoverage && enoughDistinctResources && enoughRuntime,
    reason: !metrics.tutorialLessonCount
      ? "no_tutorial_lessons"
      : !enoughCoverage
        ? "insufficient_lesson_coverage"
        : !enoughDistinctResources
          ? "not_enough_distinct_videos"
          : !enoughRuntime
            ? "insufficient_video_runtime"
            : null
  };
}

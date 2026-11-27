/**
 * Balanced phase grouping for automatically generated course journeys.
 * Lesson order remains intact; phases never contain synthetic or empty nodes.
 */
export function getTargetJourneyPhaseCount(totalLessons, populatedModuleCount) {
  const lessonCount = Math.max(0, Math.floor(Number(totalLessons) || 0));
  if (lessonCount === 0) return 0;
  const moduleCount = Math.max(1, Math.floor(Number(populatedModuleCount) || 1));
  return Math.min(6, lessonCount, Math.max(4, Math.min(6, moduleCount)));
}

export function groupJourneyLessons(lessons, phaseCount) {
  const source = Array.isArray(lessons) ? lessons : [];
  const count = Math.min(source.length, Math.max(0, Math.floor(Number(phaseCount) || 0)));
  if (!count) return [];

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * source.length / count);
    const end = Math.floor((index + 1) * source.length / count);
    const selected = source.slice(start, end);
    const moduleTitles = [...new Set(selected.map((lesson) => String(lesson.moduleTitle || "").trim()).filter(Boolean))];
    return {
      id: "stage-" + (index + 1),
      order: index + 1,
      title: "Phase " + (index + 1),
      sourceTitle: moduleTitles.join(" · "),
      lessonIds: selected.map((lesson) => String(lesson.id)),
      seconds: selected.reduce((sum, lesson) => sum + Math.max(0, Number(lesson.seconds) || 0), 0)
    };
  });
}

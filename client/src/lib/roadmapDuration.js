/**
 * Formats roadmap effort, schedule-based completion time and selected resource runtime.
 * These metrics intentionally remain separate: video playback time is not curriculum effort.
 *
 * @param {{estimatedStudyMinutes?: number, minutesPerDay?: number, studyDaysPerWeek?: number, videoRuntimeMinutes?: number}} input
 */
export function getRoadmapDurationSummary(input = {}) {
  const studyMinutes = Math.max(0, Number(input.estimatedStudyMinutes) || 0);
  const minutesPerDay = Math.max(0, Number(input.minutesPerDay) || 0);
  const studyDaysPerWeek = Math.max(0, Math.min(7, Number(input.studyDaysPerWeek) || 0));
  const weeklyCapacity = minutesPerDay * studyDaysPerWeek;
  const weeks = studyMinutes > 0 && weeklyCapacity > 0
    ? Math.max(1, Math.ceil(studyMinutes / weeklyCapacity))
    : null;

  const videoMinutes = Math.max(0, Math.round(Number(input.videoRuntimeMinutes) || 0));
  const videoHours = Math.floor(videoMinutes / 60);
  const remainingVideoMinutes = videoMinutes % 60;
  const videoRuntimeLabel = videoMinutes > 0
    ? [videoHours > 0 ? `${videoHours}h` : "", remainingVideoMinutes > 0 ? `${remainingVideoMinutes}m` : ""].filter(Boolean).join(" ")
    : null;

  return {
    studyHoursLabel: studyMinutes > 0 ? `${Math.round(studyMinutes / 60 * 10) / 10} hours` : null,
    weeksLabel: weeks ? `${weeks} weeks` : null,
    scheduleLabel: minutesPerDay > 0 && studyDaysPerWeek > 0
      ? `${minutesPerDay} min/day · ${studyDaysPerWeek} days/week`
      : null,
    videoRuntimeLabel
  };
}

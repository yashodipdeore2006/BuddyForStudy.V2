export const LEARNING_STATUS = Object.freeze({
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed"
});

/**
 * Classify a learner's persisted progress without depending on rounded percentages.
 * A course is complete only when every trackable lesson is complete. Opening the
 * lesson player also counts as starting, even before the first completion.
 */
export function deriveLearningStatus({
  completedCount = 0,
  totalLessons = 0,
  lastAccessedAt = null,
  lastLessonId = null,
  enrollmentStatus = ""
} = {}) {
  const total = Math.max(0, Number(totalLessons) || 0);
  const completed = Math.max(0, Number(completedCount) || 0);

  if (total > 0 && completed >= total) return LEARNING_STATUS.COMPLETED;
  if (completed > 0 || Boolean(lastAccessedAt) || Boolean(lastLessonId)) return LEARNING_STATUS.IN_PROGRESS;
  if (String(enrollmentStatus).toLowerCase() === "completed") return LEARNING_STATUS.COMPLETED;
  return LEARNING_STATUS.NOT_STARTED;
}

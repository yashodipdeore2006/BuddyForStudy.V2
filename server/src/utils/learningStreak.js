export function learningDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function previousLearningDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}

export function learningWeekKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

/**
 * Preserve one missed calendar day if a weekly streak freeze remains.
 * The caller persists streakFreezeUsedWeek only when freezeUsed is true.
 */
export function calculateStreakTransition({ lastActivityDate = "", today, currentStreak = 0, streakFreezeUsedWeek = "" }) {
  if (!today || lastActivityDate === today) {
    return { currentStreak, freezeUsed: false, streakFreezeUsedWeek };
  }

  const previousDay = previousLearningDateKey(today);
  if (lastActivityDate === previousDay) {
    return { currentStreak: currentStreak + 1, freezeUsed: false, streakFreezeUsedWeek };
  }

  const missedOneDay = lastActivityDate === previousLearningDateKey(previousDay);
  const thisWeek = learningWeekKey(today);
  if (missedOneDay && streakFreezeUsedWeek !== thisWeek && currentStreak > 0) {
    return { currentStreak: currentStreak + 1, freezeUsed: true, streakFreezeUsedWeek: thisWeek };
  }

  return { currentStreak: 1, freezeUsed: false, streakFreezeUsedWeek };
}

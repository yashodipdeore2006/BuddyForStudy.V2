import { useMemo } from "react";

export interface LearningProgressSource {
  completed_count: number;
  total_lessons: number;
  completed_today_count: number;
}

export interface LearningStatsSource {
  dailyGoalLessons?: unknown;
  currentStreak?: unknown;
  longestStreak?: unknown;
  streakFreezeUsedWeek?: unknown;
  activityDates?: unknown;
  lastActivityDate?: unknown;
  totalLessonsCompleted?: unknown;
  achievements?: unknown;
  [key: string]: unknown;
}

export function useLearningStats(
  progress: Record<string, LearningProgressSource>,
  source: LearningStatsSource | null | undefined,
) {
  const raw = useMemo(() => (source ?? {}) as LearningStatsSource, [source]);
  const metrics = useMemo(() => {
    const records = Object.values(progress);
    const completedLessons = records.reduce((sum, item) => sum + item.completed_count, 0);
    const totalLessons = records.reduce((sum, item) => sum + item.total_lessons, 0);
    const completedToday = records.reduce((sum, item) => sum + item.completed_today_count, 0);
    const dailyGoalCandidate = Number(raw.dailyGoalLessons);
    const dailyGoalLessons = Number.isInteger(dailyGoalCandidate) && dailyGoalCandidate >= 1 && dailyGoalCandidate <= 20 ? dailyGoalCandidate : 1;
    const currentStreak = Math.max(0, Number(raw.currentStreak ?? 0));
    const longestStreak = Math.max(currentStreak, Number(raw.longestStreak ?? 0));
    const activityDates = new Set(Array.isArray(raw.activityDates) ? raw.activityDates.map(String) : []);
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const sevenDayStrip = Array.from({ length: 7 }, (_unused, index) => {
      const value = new Date(todayKey + "T12:00:00Z");
      value.setUTCDate(value.getUTCDate() - (6 - index));
      const dateKey = value.toISOString().slice(0, 10);
      const weekStart = new Date(dateKey + "T12:00:00Z");
      weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
      return {
        dateKey,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(value).slice(0, 1),
        active: activityDates.has(dateKey),
        isToday: dateKey === todayKey,
        weekStartKey: weekStart.toISOString().slice(0, 10),
      };
    });
    const currentWeekStart = sevenDayStrip[6]?.weekStartKey ?? todayKey;
    const streakFreezeUsedWeek = String(raw.streakFreezeUsedWeek ?? "");
    const freezeUsedThisWeek = streakFreezeUsedWeek === currentWeekStart;
    const twoDaysAgoKey = new Date(new Date(todayKey + "T12:00:00Z").getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const freezeAvailable = !freezeUsedThisWeek && Boolean(raw.lastActivityDate) && raw.lastActivityDate === twoDaysAgoKey && currentStreak > 0;
    return {
      completedLessons,
      totalLessons,
      overallProgress: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      completedToday,
      dailyGoalLessons,
      dailyGoalPercent: Math.min(100, Math.round((completedToday / dailyGoalLessons) * 100)),
      streak: currentStreak,
      longestStreak,
      activityDates,
      todayKey,
      sevenDayStrip,
      freezeUsedThisWeek,
      freezeAvailable,
      totalLessonsCompleted: Number(raw.totalLessonsCompleted ?? completedLessons),
      achievements: Array.isArray(raw.achievements) ? raw.achievements as Array<{ key?: string }> : [],
    };
  }, [progress, raw]);
  return metrics;
}

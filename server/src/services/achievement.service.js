import { LearningStats } from "../models/LearningStats.js";

const ACHIEVEMENTS = {
  FIRST_LESSON: { key: "first_lesson", title: "First Step", description: "Complete your first lesson." },
  THREE_DAY_STREAK: { key: "three_day_streak", title: "On a Roll", description: "Maintain a 3-day learning streak." },
  SEVEN_DAY_STREAK: { key: "seven_day_streak", title: "Week Warrior", description: "Maintain a 7-day learning streak." },
  THIRTY_DAY_STREAK: { key: "thirty_day_streak", title: "Learning Machine", description: "Maintain a 30-day learning streak." },
  TEN_LESSONS: { key: "ten_lessons", title: "Getting Serious", description: "Complete 10 lessons." },
  FIRST_COURSE: { key: "first_course", title: "Course Complete", description: "Complete your first course." }
};

function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function previousDateKey(key) {
  const date = new Date(key + "T00:00:00+05:30");
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function unlock(stats, achievement) {
  if (!stats.achievements.some((item) => item.key === achievement.key)) {
    stats.achievements.push(achievement);
  }
}

export async function recordLearningActivity(userId, { lessonCompleted = false, courseCompleted = false }) {
  const stats = await LearningStats.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true }
  );

  const today = dateKey();
  const isNewDay = stats.lastActivityDate !== today;

  if (lessonCompleted) stats.totalLessonsCompleted += 1;
  if (courseCompleted) stats.totalCoursesCompleted += 1;

  if (isNewDay) {
    stats.totalActiveDays += 1;
    stats.currentStreak = stats.lastActivityDate === previousDateKey(today)
      ? stats.currentStreak + 1
      : 1;
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
    stats.lastActivityDate = today;
  }

  if (stats.totalLessonsCompleted >= 1) unlock(stats, ACHIEVEMENTS.FIRST_LESSON);
  if (stats.currentStreak >= 3) unlock(stats, ACHIEVEMENTS.THREE_DAY_STREAK);
  if (stats.currentStreak >= 7) unlock(stats, ACHIEVEMENTS.SEVEN_DAY_STREAK);
  if (stats.currentStreak >= 30) unlock(stats, ACHIEVEMENTS.THIRTY_DAY_STREAK);
  if (stats.totalLessonsCompleted >= 10) unlock(stats, ACHIEVEMENTS.TEN_LESSONS);
  if (stats.totalCoursesCompleted >= 1) unlock(stats, ACHIEVEMENTS.FIRST_COURSE);

  await stats.save();
  return stats;
}

export async function getLearningStats(userId) {
  return LearningStats.findOne({ user: userId }).lean() || {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: "",
    totalActiveDays: 0,
    totalLessonsCompleted: 0,
    totalCoursesCompleted: 0,
    achievements: []
  };
}

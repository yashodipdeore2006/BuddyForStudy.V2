import { LearningStats } from "../models/LearningStats.js";
import { calculateStreakTransition, learningDateKey } from "../utils/learningStreak.js";

const ACHIEVEMENTS = {
  FIRST_LESSON: { key: "first_lesson", title: "First Step", description: "Complete your first lesson." },
  THREE_DAY_STREAK: { key: "three_day_streak", title: "On a Roll", description: "Maintain a 3-day learning streak." },
  SEVEN_DAY_STREAK: { key: "seven_day_streak", title: "Week Warrior", description: "Maintain a 7-day learning streak." },
  THIRTY_DAY_STREAK: { key: "thirty_day_streak", title: "Learning Machine", description: "Maintain a 30-day learning streak." },
  TEN_LESSONS: { key: "ten_lessons", title: "Getting Serious", description: "Complete 10 lessons." },
  FIRST_COURSE: { key: "first_course", title: "Course Complete", description: "Complete your first course." }
};

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

  const today = learningDateKey();
  const isNewDay = stats.lastActivityDate !== today;

  if (lessonCompleted) stats.totalLessonsCompleted += 1;
  if (courseCompleted) stats.totalCoursesCompleted += 1;

  if (isNewDay) {
    const transition = calculateStreakTransition({
      lastActivityDate: stats.lastActivityDate,
      today,
      currentStreak: stats.currentStreak,
      streakFreezeUsedWeek: stats.streakFreezeUsedWeek,
    });
    stats.currentStreak = transition.currentStreak;
    if (transition.freezeUsed) stats.streakFreezeUsedWeek = transition.streakFreezeUsedWeek;
    stats.totalActiveDays += 1;
    stats.lastActivityDate = today;
    const activityDates = new Set(Array.isArray(stats.activityDates) ? stats.activityDates : []);
    activityDates.add(today);
    stats.activityDates = [...activityDates].sort().slice(-90);
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
  const stats = await LearningStats.findOne({ user: userId }).lean();
  return stats || {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: "",
    totalActiveDays: 0,
    totalLessonsCompleted: 0,
    totalCoursesCompleted: 0,
    dailyGoalLessons: 1,
    activityDates: [],
    streakFreezeUsedWeek: "",
    achievements: []
  };
}

export async function updateLearningPreferences(userId, { dailyGoalLessons }) {
  if (!Number.isInteger(dailyGoalLessons) || dailyGoalLessons < 1 || dailyGoalLessons > 20) {
    const error = new Error("Daily goal must be between 1 and 20 lessons.");
    error.status = 400;
    throw error;
  }

  const stats = await LearningStats.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId }, $set: { dailyGoalLessons } },
    { new: true, upsert: true, runValidators: true }
  );
  return stats.toObject();
}

import test from "node:test";
import assert from "node:assert/strict";
import { calculateStreakTransition, learningWeekKey, previousLearningDateKey } from "../src/utils/learningStreak.js";
import { updateLongestStreak } from "../src/services/achievement.service.js";

test("previous learning date handles month and year boundaries", () => {
  assert.equal(previousLearningDateKey("2026-01-01"), "2025-12-31");
  assert.equal(previousLearningDateKey("2026-03-01"), "2026-02-28");
});

test("a learning activity on the next calendar day continues the streak without consuming a freeze", () => {
  const result = calculateStreakTransition({
    lastActivityDate: "2026-10-19",
    today: "2026-10-20",
    currentStreak: 4,
    streakFreezeUsedWeek: "",
  });
  assert.deepEqual(result, { currentStreak: 5, freezeUsed: false, streakFreezeUsedWeek: "" });
});

test("one missed day can be covered once in a calendar week", () => {
  const result = calculateStreakTransition({
    lastActivityDate: "2026-10-17",
    today: "2026-10-19",
    currentStreak: 6,
    streakFreezeUsedWeek: "",
  });
  assert.deepEqual(result, { currentStreak: 7, freezeUsed: true, streakFreezeUsedWeek: "2026-10-19" });
});

test("a second missed-day gap in the same week resets the streak", () => {
  const result = calculateStreakTransition({
    lastActivityDate: "2026-10-14",
    today: "2026-10-16",
    currentStreak: 7,
    streakFreezeUsedWeek: "2026-10-12",
  });
  assert.deepEqual(result, { currentStreak: 1, freezeUsed: false, streakFreezeUsedWeek: "2026-10-12" });
});

test("the weekly freeze refreshes on a new Monday-based week", () => {
  assert.equal(learningWeekKey("2026-10-18"), "2026-10-12");
  assert.equal(learningWeekKey("2026-10-19"), "2026-10-19");
  const result = calculateStreakTransition({
    lastActivityDate: "2026-10-17",
    today: "2026-10-19",
    currentStreak: 6,
    streakFreezeUsedWeek: "2026-10-12",
  });
  assert.deepEqual(result, { currentStreak: 7, freezeUsed: true, streakFreezeUsedWeek: "2026-10-19" });
});


test("longest streak advances when a new streak record is reached", () => {
  const stats = { currentStreak: 8, longestStreak: 7 };
  assert.equal(updateLongestStreak(stats), 8);
  assert.equal(stats.longestStreak, 8);
});

test("longest streak never decreases when the current streak resets", () => {
  const stats = { currentStreak: 1, longestStreak: 12 };
  assert.equal(updateLongestStreak(stats), 12);
  assert.equal(stats.longestStreak, 12);
});

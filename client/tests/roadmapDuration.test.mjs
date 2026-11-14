import test from "node:test";
import assert from "node:assert/strict";
import { getRoadmapDurationSummary } from "../src/lib/roadmapDuration.js";

test("separates total learning effort, completion weeks, schedule and video runtime", () => {
  const summary = getRoadmapDurationSummary({
    estimatedStudyMinutes: 60 * 60,
    minutesPerDay: 60,
    studyDaysPerWeek: 5,
    videoRuntimeMinutes: 25 * 60
  });
  assert.deepEqual(summary, {
    studyHoursLabel: "60 hours",
    weeksLabel: "12 weeks",
    scheduleLabel: "60 min/day · 5 days/week",
    videoRuntimeLabel: "25h"
  });
});

test("rounds a partial study week up to a complete estimated week", () => {
  const summary = getRoadmapDurationSummary({
    estimatedStudyMinutes: 600,
    minutesPerDay: 90,
    studyDaysPerWeek: 4,
    videoRuntimeMinutes: 95
  });
  assert.equal(summary.weeksLabel, "2 weeks");
  assert.equal(summary.videoRuntimeLabel, "1h 35m");
});

test("does not invent a completion timeline when study availability is missing", () => {
  const summary = getRoadmapDurationSummary({
    estimatedStudyMinutes: 600,
    minutesPerDay: 0,
    studyDaysPerWeek: 0,
    videoRuntimeMinutes: 0
  });
  assert.equal(summary.studyHoursLabel, "10 hours");
  assert.equal(summary.weeksLabel, null);
  assert.equal(summary.scheduleLabel, null);
  assert.equal(summary.videoRuntimeLabel, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { getTargetJourneyPhaseCount, groupJourneyLessons } from "./courseJourneyPhases.js";

test("automatically generated journeys use four to six phases when lesson volume allows", () => {
  assert.equal(getTargetJourneyPhaseCount(20, 1), 4);
  assert.equal(getTargetJourneyPhaseCount(20, 2), 4);
  assert.equal(getTargetJourneyPhaseCount(20, 4), 4);
  assert.equal(getTargetJourneyPhaseCount(20, 5), 5);
  assert.equal(getTargetJourneyPhaseCount(20, 9), 6);
});

test("small courses do not receive empty or fabricated phases", () => {
  assert.equal(getTargetJourneyPhaseCount(1, 1), 1);
  assert.equal(getTargetJourneyPhaseCount(3, 2), 3);
  assert.equal(getTargetJourneyPhaseCount(0, 4), 0);
});

test("phase grouping is balanced, contiguous and preserves all source lesson IDs", () => {
  const lessons = Array.from({ length: 11 }, (_, index) => ({
    id: "lesson-" + (index + 1),
    moduleTitle: index < 5 ? "Foundations" : "Engineering",
    seconds: (index + 1) * 60
  }));
  const phases = groupJourneyLessons(lessons, 4);

  assert.deepEqual(phases.map((phase) => phase.lessonIds.length), [2, 3, 3, 3]);
  assert.deepEqual(phases.flatMap((phase) => phase.lessonIds), lessons.map((lesson) => lesson.id));
  assert.equal(phases.reduce((sum, phase) => sum + phase.seconds, 0), lessons.reduce((sum, lesson) => sum + lesson.seconds, 0));
});

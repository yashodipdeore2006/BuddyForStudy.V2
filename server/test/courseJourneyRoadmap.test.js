import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildJourneyStages, calculateJourneyProgress, parseDurationSeconds, regenerateCourseJourney } from "../src/services/courseJourneyRoadmap.service.js";
import { Course } from "../src/models/Course.js";

function lesson(id, duration) {
  return { id, title: "Lesson " + id, type: "tutorial", tutorial: { videos: [{ duration }] } };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); }
  finally { for (const { target, key, original } of originals.reverse()) target[key] = original; }
}

test("groups a seven-module course into between three and seven stages without splitting modules", () => {
  const modules = Array.from({ length: 7 }, (_, index) => ({ id: "m" + index, title: "Module " + (index + 1), order: index + 1, lessons: [lesson("l" + index, "30:00")] }));
  const stages = buildJourneyStages(modules);
  assert.ok(stages.length >= 3 && stages.length <= 7);
  assert.deepEqual(stages.flatMap((stage) => stage.lessonIds).sort(), modules.map((module, index) => "l" + index).sort());
});

test("splits a single playlist module into five duration-aware stages", () => {
  const modules = [{ id: "playlist", title: "Playlist", lessons: Array.from({ length: 12 }, (_, index) => lesson("l" + index, index % 2 ? "20:00" : "10:00")) }];
  const stages = buildJourneyStages(modules);
  assert.equal(stages.length, 5);
  assert.equal(stages.flatMap((stage) => stage.lessonIds).length, 12);
  assert.ok(stages.every((stage) => stage.hours >= 0));
});

test("returns no stages for a course without lessons", () => {
  assert.deepEqual(buildJourneyStages([{ title: "Empty", lessons: [] }]), []);
});

test("calculates progress from completed lessons and reports zero and full progress", () => {
  const stages = [{ lessonIds: ["a", "b"] }, { lessonIds: ["c", "d"] }];
  assert.equal(calculateJourneyProgress(stages, []).position, 0);
  assert.equal(calculateJourneyProgress(stages, ["a", "b", "c"]).position, 1.5);
  assert.equal(calculateJourneyProgress(stages, ["a", "b", "c", "d"]).position, 2);
  assert.equal(parseDurationSeconds("PT1H30M"), 5400);
});

test("uses lesson duration weights for partial stage position", () => {
  const stages = [{ lessonIds: ["a", "b"] }, { lessonIds: ["c", "d"] }];
  const result = calculateJourneyProgress(stages, ["a", "b", "c"], { a: 600, b: 600, c: 1800, d: 600 });
  assert.equal(result.stageProgress[0], 1);
  assert.equal(result.stageProgress[1], 0.75);
  assert.equal(result.position, 1.75);
});

 
test("course journey roadmap progress is gated by current entitlement, not enrollment record alone", () => {
  const service = readFileSync(new URL("../src/services/courseJourneyRoadmap.service.js", import.meta.url), "utf8");
  const start = service.indexOf("export async function getCourseJourney");
  const handler = service.slice(start);
  assert.match(handler, /Enrollment\.findOne\(\{ user: userId, course: courseId, status: \{ \$in: \["active", "completed"\] \}, revokedBy: null \}\)/);
  assert.match(handler, /if \(enrollment && await canAccessCourse\(userId, courseId\)\)/);
  assert.ok(handler.indexOf("canAccessCourse(userId, courseId)") < handler.indexOf("Progress.findOne"),
    "Must verify current entitlement before reading private progress metadata");
});


test("admin course journey regeneration persists authenticated actor provenance for the course revision", async () => {
  const actor = "507f191e810c19729de860ea";
  let saveCalls = 0;
  const course = {
    _id: "507f1f77bcf86cd799439011",
    deletedAt: null,
    title: "SQL Learning Path",
    modules: [{ _id: "module-1", title: "SQL", lessons: [{ _id: "lesson-1", title: "SQL joins" }] }],
    roadmap: { theme: "trail", stages: [] },
    $locals: {},
    async save() { saveCalls += 1; }
  };
  const stages = [{
    id: "stage-1",
    order: 1,
    title: "SQL foundations",
    hours: 1,
    lessonIds: ["lesson-1"],
    skills: ["SQL"],
    outcome: "Understand relational joins",
    emoji: "📚"
  }];

  await withMocks([[Course, { findById: async (id) => {
    assert.equal(String(id), String(course._id));
    return course;
  } }]], async () => {
    await regenerateCourseJourney(course._id, stages, {
      actor,
      source: "admin",
      reason: "Administrator edited the course journey",
      summary: "Admin edited course journey stages"
    });
  });

  assert.equal(saveCalls, 1);
  assert.deepEqual(course.$locals.revisionContext, {
    actor,
    source: "admin",
    reason: "Administrator edited the course journey",
    summary: "Admin edited course journey stages"
  });
});

test("automatic course journey regeneration leaves revision attribution as the system default", async () => {
  let saveCalls = 0;
  const course = {
    _id: "507f1f77bcf86cd799439012",
    deletedAt: null,
    title: "SQL Learning Path",
    modules: [{ _id: "module-1", title: "SQL", lessons: [{ _id: "lesson-1", title: "SQL joins" }] }],
    roadmap: { theme: "trail", stages: [] },
    $locals: {},
    async save() { saveCalls += 1; }
  };

  await withMocks([[Course, { findById: async () => course }]], async () => {
    await regenerateCourseJourney(course._id, [{
      id: "stage-1", order: 1, title: "SQL foundations", hours: 1,
      lessonIds: ["lesson-1"], skills: [], outcome: "", emoji: ""
    }]);
  });

  assert.equal(saveCalls, 1);
  assert.equal(course.$locals.revisionContext, undefined);
});

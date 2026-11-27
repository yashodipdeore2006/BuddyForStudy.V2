import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseRoadmapDocument,
  getRoadmapFilterMatches,
  parseRoadmapDurationSeconds
} from "../src/lib/courseRoadmap.js";

const course = {
  _id: "course-1",
  title: "Full-Stack Web Development",
  description: "Build production-ready web applications.",
  level: "Beginner",
  duration: "42h",
  learningOutcomes: ["Build and deploy a complete web application."],
  modules: [
    {
      _id: "module-1",
      title: "React Foundations",
      lessons: [
        { _id: "lesson-1", title: "Understand Components", type: "tutorial", durationSeconds: 3600, description: "Understand reusable UI components." },
        { _id: "lesson-2", title: "Build a React App", type: "project", durationSeconds: 7200, project: { objectives: ["Create reusable components", "Manage application state"], instructions: "Build a small React application." } }
      ]
    },
    {
      _id: "module-2",
      title: "Backend Engineering",
      lessons: [
        { _id: "lesson-3", title: "API Knowledge Check", type: "quiz", durationSeconds: 1800, quiz: { focusTopics: ["HTTP", "REST APIs"] } },
        { _id: "lesson-4", title: "Deploy the Capstone", type: "project", durationSeconds: 10800, project: { expectedOutcome: "Deploy the finished full-stack application." } }
      ]
    }
  ]
};

const roadmap = {
  courseId: "course-1",
  title: course.title,
  totalHours: 18,
  stages: [
    { id: "phase-1", order: 1, title: "Frontend Foundations", hours: 3, lessonIds: ["lesson-1", "lesson-2"], skills: ["React", "Components"], outcome: "Create an interactive interface." },
    { id: "phase-2", order: 2, title: "Backend Delivery", hours: 15, lessonIds: ["lesson-3", "lesson-4"], skills: ["APIs", "Deployment"], outcome: "Ship a working application." }
  ]
};

test("roadmap document is derived from real course lessons and existing phase assignments", () => {
  const result = buildCourseRoadmapDocument({ course, roadmap, enrolled: true, completedIds: ["lesson-1"] });
  assert.equal(result.courseMeta.title, course.title);
  assert.equal(result.courseMeta.lessonCount, 4);
  assert.equal(result.phases.length, 2);
  assert.equal(result.nodes.length, 4);
  assert.equal(result.nodes[0].status, "completed");
  assert.equal(result.nodes[1].status, "in_progress");
  assert.deepEqual(result.nodes[1].prerequisites, ["lesson-1"]);
  assert.equal(result.nodes[1].type, "project");
  assert.equal(result.nodes[3].type, "capstone");
  assert.equal(result.nodes[3].projectTask, "Deploy the finished full-stack application.");
  assert.equal(result.progress.percent, 25);
  assert.equal(result.progress.hoursRemaining, 16.5);
});

test("un-enrolled visitors see a curriculum preview without learner progress", () => {
  const result = buildCourseRoadmapDocument({ course, roadmap, enrolled: false, completedIds: ["lesson-1", "lesson-2"] });
  assert.equal(result.progress.completedCount, 0);
  assert.equal(result.progress.percent, 0);
  assert.equal(result.nodes.every((node) => node.status === "remaining"), true);
});

test("stale roadmap phase mappings append missing real lessons to the final phase", () => {
  const staleRoadmap = {
    ...roadmap,
    stages: [{ id: "old", title: "Old phase", order: 1, lessonIds: ["lesson-1"] }]
  };
  const result = buildCourseRoadmapDocument({ course, roadmap: staleRoadmap });
  assert.equal(result.nodes.length, 4);
  assert.equal(result.phases.length, 1);
  assert.deepEqual(result.phases[0].nodeIds, ["lesson-1", "lesson-2", "lesson-3", "lesson-4"]);
});

test("topic filters and searches match real node metadata", () => {
  const result = buildCourseRoadmapDocument({ course, roadmap, enrolled: true, completedIds: ["lesson-1"] });
  const project = result.nodes[1];
  assert.equal(getRoadmapFilterMatches(project, "projects"), true);
  assert.equal(getRoadmapFilterMatches(project, "foundations"), false);
  assert.equal(getRoadmapFilterMatches(project, "all", "state"), true);
  assert.equal(getRoadmapFilterMatches(project, "all", "database"), false);
  assert.equal(getRoadmapFilterMatches(result.nodes[0], "completed"), true);
  assert.equal(getRoadmapFilterMatches(result.nodes[1], "remaining"), true);
});

test("duration parsing supports ISO strings, clock values and human-readable labels", () => {
  assert.equal(parseRoadmapDurationSeconds("PT1H30M"), 5400);
  assert.equal(parseRoadmapDurationSeconds("02:15:10"), 8110);
  assert.equal(parseRoadmapDurationSeconds("1h 20m"), 4800);
});


test("lessons without optional quiz or project topic fields remain valid roadmap nodes", () => {
  const minimalCourse = {
    ...course,
    modules: [{ _id: "module-minimal", title: "Fundamentals", lessons: [
      { _id: "lesson-minimal", title: "Introduction", type: "tutorial" }
    ] }]
  };
  const minimalRoadmap = {
    totalHours: 1,
    stages: [{ id: "phase-minimal", order: 1, title: "Foundations", hours: 1, lessonIds: ["lesson-minimal"] }]
  };
  const result = buildCourseRoadmapDocument({ course: minimalCourse, roadmap: minimalRoadmap });
  assert.equal(result.nodes.length, 1);
  assert.deepEqual(result.nodes[0].subtopics, []);
  assert.equal(result.nodes[0].type, "core");
});


test("checkpoint node metadata maps to the checkpoint visual type", () => {
  const checkpointCourse = {
    ...course,
    modules: [{
      _id: "module-checkpoint",
      title: "Review",
      lessons: [{
        _id: "lesson-checkpoint",
        title: "Architecture Review",
        type: "tutorial",
        nodeType: "checkpoint"
      }]
    }]
  };
  const checkpointRoadmap = {
    stages: [{ id: "phase-review", order: 1, title: "Review", lessonIds: ["lesson-checkpoint"] }]
  };
  const result = buildCourseRoadmapDocument({ course: checkpointCourse, roadmap: checkpointRoadmap });
  assert.equal(result.nodes[0].type, "checkpoint");
});


test("module-derived fallback roadmap reads declared course duration", () => {
  const fallbackCourse = {
    ...course,
    duration: "42h",
    modules: [{ _id: "module-only", title: "All lessons", lessons: [
      { _id: "lesson-only", title: "Course overview", type: "tutorial" }
    ] }]
  };
  const result = buildCourseRoadmapDocument({ course: fallbackCourse, roadmap: { stages: [], totalHours: 0 } });
  assert.equal(result.courseMeta.totalHours, 42);
  assert.equal(result.progress.hoursRemaining, 42);
});

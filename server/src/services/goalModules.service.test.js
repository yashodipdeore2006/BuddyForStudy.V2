import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGoal,
  buildInterviewQueries,
  buildInterviewModule,
  buildEvidenceBackedRoundsSummary,
  buildExamModules,
  buildProjectModule,
  buildLearnModule,
  buildSchedule
} from "./goalModules.service.js";

test("Python for TCS interview produces an interview module without inventing rounds", () => {
  const profile = { topic: "Python", goal: "job_ready", targetCompany: "TCS", targetRole: null };
  const module = buildInterviewModule(profile, []);
  assert.equal(module.goalModule, "interview");
  assert.deepEqual(module.queryFallbackChain.map((item) => item.matchedLevel), ["company", "generic"]);
  assert.equal(module.lessons[0].tutorial.roundsSummary, null);
  assert.deepEqual(module.lessons[0].tutorial.evidenceVideoIds, []);
  assert.match(module.lessons[0].tutorial.content, /No verified interview-video evidence/);
});

test("interview company-plus-role query falls back in specificity order", () => {
  assert.deepEqual(buildInterviewQueries({ targetCompany: "TCS", targetRole: "Backend Developer", topic: "Python" }).map((item) => item.matchedLevel), ["company_role", "company", "role", "generic"]);
  const module = buildInterviewModule({ topic: "Python", targetCompany: "TCS", targetRole: "Backend Developer" }, [
    { videoId: "vid-1", title: "Backend Developer Interview Experience", description: "Candidate-described topics." }
  ]);
  assert.deepEqual(module.lessons[0].tutorial.evidenceVideoIds, ["vid-1"]);
  assert.match(module.lessons[0].tutorial.content, /Candidate-described topics/);
});

test("rounds summary returns nothing without retrieved evidence", () => {
  assert.equal(buildEvidenceBackedRoundsSummary([]), null);
  assert.equal(buildEvidenceBackedRoundsSummary([{ title: "unverified" }]), null);
});

test("exam with pasted syllabus includes only units verified verbatim in user text and adds revision and mock tests", () => {
  const syllabusText = "Unit I: Python Basics\nUnit II: Data Structures";
  const module = buildExamModules({ examName: "Certification", syllabusText, examDate: "2030-12-31" }, { syllabusUnits: ["Python Basics", "Data Structures", "Machine Learning"] });
  assert.equal(module.source, "user");
  assert.deepEqual(module.lessons.filter((item) => item.type === "tutorial").map((item) => item.title), ["Python Basics", "Data Structures"]);
  assert.ok(module.lessons.some((item) => item.id === "exam-revision-block"));
  assert.ok(module.lessons.some((item) => item.type === "quiz"));
});

test("exam without syllabus labels topics as typical, not official", () => {
  const module = buildExamModules({ examName: "Unknown exam" });
  assert.equal(module.source, "typical");
  assert.match(module.syllabusWarning, /not an official syllabus/);
  assert.ok(module.lessons.every((item) => item.source === "typical"));
});

test("project goal creates milestones from the supplied idea", () => {
  const module = buildProjectModule({ projectIdea: "Inventory tracker" });
  assert.equal(module.goalModule, "project");
  assert.equal(module.projectIdea, "Inventory tracker");
  assert.equal(module.lessons.length, 5);
  assert.ok(module.lessons.every((item) => item.source === "user"));
});

test("learn goal creates fundamentals, quizzes, and one small project", () => {
  const module = buildLearnModule({ topic: "Python" }, [{ name: "Variables" }, { name: "Functions" }]);
  assert.equal(module.goalModule, "learn");
  assert.equal(module.lessons.filter((item) => item.type === "quiz").length, 2);
  assert.equal(module.lessons.filter((item) => item.type === "project").length, 1);
});

test("legacy goals normalize and schedule computes deadline warning without mutating input", () => {
  assert.equal(normalizeGoal({ goals: ["Career or work growth"] }), "job_ready");
  const modules = [{ lessons: [{ id: "lesson", type: "tutorial", durationMinutes: 120 }] }];
  const before = JSON.stringify(modules);
  const schedule = buildSchedule(modules, { minutesPerDay: 30, deadline: "2026-10-25", now: "2026-10-24T00:00:00.000Z" });
  assert.ok(schedule.estimatedMinutes >= 120);
  assert.equal(JSON.stringify(modules), before);
});

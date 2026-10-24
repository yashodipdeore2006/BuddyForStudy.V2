import test from "node:test";
import assert from "node:assert/strict";
import { buildQuestionPlan, mapLegacyGoal, normalizeIntentQuery, parseIntent, staticIntentPlan } from "./intent.service.js";

function memoryCache() {
  const entries = new Map();
  return {
    entries,
    findOne(filter) { return { lean: async () => { const row = entries.get(filter.normalizedQuery); return row && row.expiresAt > filter.expiresAt.$gt ? row : null; } }; },
    async updateOne(filter, update) { entries.set(filter.normalizedQuery, update.$set); }
  };
}
function parsed({ goal = null, confidences = {}, profile = {}, options = {} } = {}) {
  const base = { topic: "Python", domain: "software_web", scope: "broad", goal, level: "Beginner", knownSkills: [], minutesPerDay: 60, language: "en", targetRole: null, targetCompany: null, examName: null, examDate: null, syllabusText: null, projectIdea: null, deadline: null };
  const result = { valid: true, profile: { ...base, ...profile }, confidences: { topic: 1, ...confidences }, domain: "software_web", scope: "broad", options };
  result.assumed = Boolean(goal && (result.confidences.goal ?? 0) < 0.8);
  if (result.assumed) result.inferredGoal = goal;
  result.questionPlan = buildQuestionPlan(result);
  return result;
}
const ids = (value) => value.questionPlan.map((item) => item.id);

test("Python for everything, then job-ready asks role and company in order", () => {
  const result = parsed({ goal: "job_ready", confidences: { goal: 1, targetRole: 0, targetCompany: 0 } });
  assert.deepEqual(ids(result), ["role", "company", "depth", "knownSkills", "time", "language"]);
});
test("job-ready with company already known asks role but not company again", () => {
  const result = parsed({ goal: "job_ready", confidences: { goal: 1, targetRole: 0, targetCompany: 1 }, profile: { targetCompany: "TCS" } });
  assert.deepEqual(ids(result), ["role", "depth", "knownSkills", "time", "language"]);
});
test("job-ready with free-text role asks company and keeps role editable", () => {
  const result = parsed({ goal: "job_ready", profile: { targetRole: "Backend Developer" }, confidences: { goal: 1, targetRole: 1, targetCompany: 0 } });
  assert.ok(ids(result).includes("company"));
  assert.ok(!ids(result).includes("role"));
});
test("exam with name and date only asks for missing syllabus", () => {
  const result = parsed({ goal: "exam", profile: { examName: "Certification", examDate: "2027-01-01" }, confidences: { goal: 1, examName: 1, examDate: 1, syllabusText: 0 } });
  assert.deepEqual(ids(result), ["syllabus", "depth", "knownSkills", "time", "language"]);
});
test("exam with pasted syllabus skips syllabus question", () => {
  const result = parsed({ goal: "exam", profile: { examName: "Certification", syllabusText: "Unit 1\nUnit 2" }, confidences: { goal: 1, examName: 1, examDate: 1, syllabusText: 1 } });
  assert.ok(!ids(result).includes("syllabus"));
});
test("unknown exam with no syllabus includes exam and syllabus questions", () => {
  const result = parsed({ goal: "exam", confidences: { goal: 1, examName: 0, examDate: 0, syllabusText: 0 } });
  assert.deepEqual(ids(result).slice(0, 3), ["examType", "examDate", "syllabus"]);
});
test("project asks for project idea and excludes job and exam questions", () => {
  const result = parsed({ goal: "project", confidences: { goal: 1, projectIdea: 0 } });
  assert.ok(ids(result).includes("projectIdea"));
  assert.ok(!ids(result).includes("role") && !ids(result).includes("examType"));
});
test("learn uses fundamentals flow without interview or exam questions", () => {
  const result = parsed({ goal: "learn", confidences: { goal: 1 } });
  assert.deepEqual(ids(result), ["depth", "knownSkills", "time", "language"]);
});
test("Python for TCS interview skips goal and company and keeps assumed banner", () => {
  const result = parsed({ goal: "job_ready", profile: { targetCompany: "TCS" }, confidences: { goal: 0.6, targetCompany: 0.95, targetRole: 0.3 } });
  result.assumed = true;
  assert.ok(result.assumed);
  assert.deepEqual(ids(result), ["role", "depth", "knownSkills", "time", "language"]);
});
test("all questions can be skipped and legacy goal mapping stays compatible", () => {
  assert.equal(mapLegacyGoal(["Career or work growth"]), "job_ready");
  assert.equal(mapLegacyGoal(["Exam or certification"]), "exam");
  assert.equal(mapLegacyGoal(["Create something"]), "project");
  assert.equal(mapLegacyGoal(["Build practical skills"]), "learn");
  assert.deepEqual(staticIntentPlan("Python").profile, {
    topic:"Python",domain:"general",scope:"narrow",goal:null,level:"Beginner",knownSkills:[],minutesPerDay:60,deadline:null,language:"en",targetRole:null,targetCompany:null,examName:null,examDate:null,syllabusText:null,projectIdea:null
  });
});
test("parseIntent caches valid LLM output for normalized queries and timeout returns static plan", async () => {
  const model = memoryCache();
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return {
      valid: true,
      profile: { topic: "Python", domain: "software_web", scope: "broad", goal: "learn", level: "Beginner", knownSkills: [], minutesPerDay: 60, language: "en", targetRole: null, targetCompany: null, examName: null, examDate: null, syllabusText: null, projectIdea: null, deadline: null },
      confidences: { topic: 1, goal: 1 }, domain: "software_web", scope: "broad",
      options: { roles: [], exams: [], projectIdeas: [] }
    };
  };
  const one = await parseIntent(" Python   ", { model, generate });
  const two = await parseIntent("python", { model, generate });
  assert.equal(one.valid, true);
  assert.equal(two.cached, true);
  assert.equal(calls, 1);
  const fallback = await parseIntent("Data Analytics", { model: memoryCache(), timeoutMs: 1, generate: () => new Promise(() => {}) });
  assert.equal(fallback.fallback, true);
  assert.ok(fallback.questionPlan.some((item) => item.id === "goal"));
});
test("invalid intent returns no questions, no profile, and is not cached", async () => {
  const model = memoryCache();
  const result = await parseIntent("Python", { model, generate: async () => ({ valid: false }) });
  assert.equal(result.valid, false);
  assert.equal(result.profile, null);
  assert.deepEqual(result.questionPlan, []);
  assert.equal(model.entries.size, 0);
  assert.equal(normalizeIntentQuery("  PYTHON   for   everything "), "python for everything");
});

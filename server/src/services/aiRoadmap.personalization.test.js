import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_ai_personalization_test";
process.env.JWT_SECRET ||= "ai-personalization-test-only-secret";
process.env.GEMINI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "";

const { __aiRoadmapTestHooks } = await import("./aiRoadmap.service.js");

test("broad Python requests produce a multi-stage curriculum", () => {
  assert.equal(__aiRoadmapTestHooks.isBroadPythonTopic("Python"), true);
  assert.equal(__aiRoadmapTestHooks.isBroadPythonTopic("Python for beginners"), true);
  assert.equal(__aiRoadmapTestHooks.isBroadPythonTopic("Python complete course"), true);
  assert.equal(__aiRoadmapTestHooks.isBroadPythonTopic("Python list comprehension"), false);
  const skills = __aiRoadmapTestHooks.ensurePythonStages([], "Python", []);
  assert.equal(skills.length, 7);
  assert.ok(skills.every((skill) => skill.topics.length >= 5));
  assert.ok(skills.every((skill) => skill.searchQueries.length > 0));
  assert.ok(skills.every((skill) => skill.courseDuration.targetMinutes >= 60));
});

test("known Python foundation is skipped without removing later Python modules", () => {
  const skills = __aiRoadmapTestHooks.ensurePythonStages([], "Python", ["Python"]);
  assert.equal(skills.length, 6);
  assert.equal(skills.some((skill) => skill.id === "python-foundations"), false);
  assert.ok(skills.some((skill) => skill.id === "python-control-flow-functions"));
});

test("specific Python subtopics do not get expanded into a generic full curriculum", () => {
  const skills = [{ id: "python-list-comprehension", name: "Python List Comprehensions", topics: ["list comprehensions"] }];
  const result = __aiRoadmapTestHooks.ensurePythonStages(skills, "Python list comprehension", []);
  assert.deepEqual(result, skills);
});

test("fallback builder keeps broad Python personalized and cyber fallback valid", () => {
  const python = __aiRoadmapTestHooks.buildTopicFallback("Python", "Beginner", {
    knownSkills: ["Python"],
    language: "en",
    studyTimeMinutesPerDay: 90
  });
  assert.equal(python.course.title, "Python Complete Learning Path");
  assert.equal(python.course.modules.length, 6);
  assert.equal(python.course.modules.some((module) => module.title === "Python Foundations and Environment"), false);
  assert.ok(python.course.modules.every((module) => module.lessons[0].tutorial.searchPolicy.preferredLanguage === "en"));

  const cyber = __aiRoadmapTestHooks.buildTopicFallback("Cybersecurity", "Beginner");
  assert.equal(cyber.course.category, "Cybersecurity");
  assert.equal(cyber.course.modules.length, 6);
});


test("quiz template fallback produces the requested count with one valid correct option per question", () => {
  const questions = __aiRoadmapTestHooks.buildTemplateQuizQuestions({
    module: { title: "Python Functions" },
    lesson: { title: "Function Parameters", quiz: { focusTopics: ["positional arguments", "keyword arguments"] } },
    courseTitle: "Python",
    requestedCount: 5
  });
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map((item) => item.id)).size, 5);
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.equal(question.options.filter((option) => option.id === question.correctOptionId).length, 1);
    assert.ok(question.question.includes(question.topic));
    assert.ok(question.explanation.length > 0);
  }
  assert.equal(__aiRoadmapTestHooks.validateQuizQuestions(questions, 5).length, 5);
});

test("quiz schema validator rejects malformed options and missing answer keys", () => {
  assert.throws(() => __aiRoadmapTestHooks.validateQuizQuestions([
    { id: "q1", question: "Bad question", options: [{ id: "a", text: "Only one" }], correctOptionId: "a" }
  ], 1), /fewer valid quiz questions/i);
});


test("Gemini daily free-tier quota errors become actionable provider-unavailable errors", () => {
  const providerError = Object.assign(new Error(JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota. Generate content requests per day limit exceeded on Free Tier."
    }
  })), { status: 429 });
  const normalized = __aiRoadmapTestHooks.normalizeGeminiProviderError(providerError);
  assert.notEqual(normalized, providerError);
  assert.equal(normalized.status, 503);
  assert.equal(normalized.code, "AI_PROVIDER_QUOTA_EXHAUSTED");
  assert.equal(normalized.provider, "gemini");
  assert.match(normalized.message, /daily generation quota/i);
  assert.doesNotMatch(normalized.message, /RESOURCE_EXHAUSTED|Free Tier|current quota/i);

  const unrelatedRateLimit = Object.assign(new Error("Too many requests"), { status: 429 });
  assert.equal(__aiRoadmapTestHooks.normalizeGeminiProviderError(unrelatedRateLimit), unrelatedRateLimit);
});

test("shared curriculum template cache ignores learner-specific personalization fields", () => {
  const first = __aiRoadmapTestHooks.buildSharedRoadmapTemplateProfile({
    topic: "React and Node.js Full Stack",
    level: "Intermediate",
    language: "en",
    goal: "job_ready",
    outcome: "Prepare for a backend developer role",
    preferences: { targetRole: "Backend Developer", learningScope: "broad" }
  });
  const second = __aiRoadmapTestHooks.buildSharedRoadmapTemplateProfile({
    topic: "React and Node.js Full Stack",
    level: "Intermediate",
    language: "en",
    goal: "project",
    outcome: "Build a SaaS product",
    preferences: { projectIdea: "Inventory system", learningScope: "narrow" }
  });
  assert.deepEqual(first, second);
  assert.equal(first.goal, "learn");
  assert.deepEqual(first.preferences, {});
  assert.equal(first.outcome, "");
});

test("synchronous Build with AI preserves curriculum only for confirmed YouTube quota exhaustion", () => {
  const weakCoverage = {
    tutorialLessonCount: 12,
    lessonsWithResources: 2,
    uniqueVideoCount: 2,
    coverageRatio: 2 / 12,
    acceptable: false
  };

  const exhausted = __aiRoadmapTestHooks.evaluateResourceAvailability(weakCoverage, {
    state: "exhausted",
    units: 9000,
    budget: 9000,
    resetDay: "2026-11-07"
  });
  assert.equal(exhausted.acceptable, true);
  assert.equal(exhausted.quotaLimited, true);
  assert.equal(exhausted.resourceAvailability.status, "partial_quota_limited");
  assert.equal(exhausted.resourceAvailability.quotaUnits, 9000);
  assert.equal(exhausted.resourceAvailability.quotaResetDay, "2026-11-07");

  for (const state of ["ok", "degraded", "unknown"]) {
    const rejected = __aiRoadmapTestHooks.evaluateResourceAvailability(weakCoverage, { state });
    assert.equal(rejected.acceptable, false, `weak coverage must remain blocked when quota state is ${state}`);
    assert.equal(rejected.quotaLimited, false);
  }
});

test("resource availability distinguishes verified coverage from a curriculum without tutorial resources", () => {
  const verified = __aiRoadmapTestHooks.evaluateResourceAvailability({
    tutorialLessonCount: 4,
    lessonsWithResources: 4,
    uniqueVideoCount: 5,
    coverageRatio: 1,
    acceptable: true
  }, { state: "ok", units: 200, budget: 9000 });
  assert.equal(verified.acceptable, true);
  assert.equal(verified.resourceAvailability.status, "verified");

  const notRequired = __aiRoadmapTestHooks.evaluateResourceAvailability({
    tutorialLessonCount: 0,
    lessonsWithResources: 0,
    uniqueVideoCount: 0,
    coverageRatio: 1,
    acceptable: false
  }, { state: "ok" });
  assert.equal(notRequired.acceptable, true);
  assert.equal(notRequired.resourceAvailability.status, "not_required");
});


test("complete Data Science path contains prerequisite-ordered foundations through deployment and capstone", () => {
  assert.equal(__aiRoadmapTestHooks.isDataScienceTopic("Data Science"), true);
  assert.equal(__aiRoadmapTestHooks.isDataScienceTopic("Data Science and Machine Learning"), true);
  assert.equal(__aiRoadmapTestHooks.isDataScienceTopic("Data Analytics"), false);
  assert.equal(__aiRoadmapTestHooks.isDataScienceTopic("Machine Learning"), false);

  const ai = {};
  const stages = __aiRoadmapTestHooks.ensureDataScienceStages([], "Data Science", ai);
  const totalMinutes = stages.reduce((sum, stage) => sum + stage.courseDuration.targetMinutes, 0);
  assert.equal(stages.length, 14);
  assert.ok(totalMinutes >= 4200, `expected at least 70 hours, got ${totalMinutes / 60}`);
  assert.ok(totalMinutes <= 6000, `expected a focused 70–100 hour path, got ${totalMinutes / 60}`);
  assert.equal(totalMinutes, 4800);
  assert.equal(stages[0].prerequisites.length, 0);
  for (let index = 1; index < stages.length; index += 1) {
    assert.deepEqual(stages[index].prerequisites, [stages[index - 1].id]);
  }
  const names = stages.map((stage) => stage.name).join(" | ").toLowerCase();
  for (const required of ["statistics", "python", "sql", "wrangling", "exploratory", "visualization", "machine learning", "supervised", "unsupervised", "feature engineering", "deep learning", "deployment", "capstone"]) {
    assert.ok(names.includes(required), `missing Data Science curriculum area: ${required}`);
  }
  assert.equal(ai.title, "Data Science Complete Learning Path");
  assert.equal(ai.capstoneProjects?.[0]?.title, "End-to-End Data Science Capstone");
});

test("course depth prompt instructions distinguish short, medium and comprehensive paths", () => {
  const short = __aiRoadmapTestHooks.buildCourseDepthPromptInstructions("short", "Python").join(" ");
  const medium = __aiRoadmapTestHooks.buildCourseDepthPromptInstructions("medium", "Python").join(" ");
  const complete = __aiRoadmapTestHooks.buildCourseDepthPromptInstructions("complete", "MERN Stack").join(" ");
  const dataScience = __aiRoadmapTestHooks.buildCourseDepthPromptInstructions("complete", "Data Science").join(" ");

  assert.match(short, /8–15 hours/);
  assert.match(short, /fundamentals/i);
  assert.match(medium, /25–45 hours/);
  assert.match(medium, /guided practice/i);
  assert.match(complete, /prerequisite-ordered/i);
  assert.match(complete, /relevant subject-specific tools/i);
  assert.match(dataScience, /70–100 hours/);
  assert.match(dataScience, /responsible AI/i);
});


test("short and medium course depth enforce bounded stage counts and total study-hour targets", () => {
  const skills = Array.from({ length: 12 }, (_, index) => ({
    id: `skill-${index + 1}`,
    name: `Skill ${index + 1}`,
    courseDuration: { minMinutes: 120, targetMinutes: 300, maxMinutes: 480 }
  }));

  const short = __aiRoadmapTestHooks.applyCourseDepthPlan(skills, "short");
  const medium = __aiRoadmapTestHooks.applyCourseDepthPlan(skills, "medium");
  const complete = __aiRoadmapTestHooks.applyCourseDepthPlan(skills, "complete");

  assert.equal(short.length, 5);
  assert.equal(short.reduce((sum, skill) => sum + skill.courseDuration.targetMinutes, 0), 720);
  assert.ok(short.every((skill) => skill.courseDuration.minMinutes <= skill.courseDuration.targetMinutes && skill.courseDuration.targetMinutes <= skill.courseDuration.maxMinutes));
  assert.equal(medium.length, 9);
  assert.equal(medium.reduce((sum, skill) => sum + skill.courseDuration.targetMinutes, 0), 2100);
  assert.ok(medium.every((skill) => skill.courseDuration.minMinutes <= skill.courseDuration.targetMinutes && skill.courseDuration.targetMinutes <= skill.courseDuration.maxMinutes));
  assert.equal(complete.length, skills.length);
  assert.equal(complete, skills);
});

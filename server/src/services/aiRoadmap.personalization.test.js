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

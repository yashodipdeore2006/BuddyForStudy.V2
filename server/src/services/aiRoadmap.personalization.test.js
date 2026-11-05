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

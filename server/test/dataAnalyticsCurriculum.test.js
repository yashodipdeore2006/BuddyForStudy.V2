import test from "node:test";
import assert from "node:assert/strict";
import { buildCourse } from "../src/services/aiRoadmap.service.js";

const canonicalize = async (name) => {
  const id = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { id, name };
};

test("complete Data Analytics curriculum includes separate Power BI, Tableau and AI analysis modules", async () => {
  const result = await buildCourse({
    title: "Data Analytics Complete Career Path",
    canonicalTopic: "Data Analytics",
    description: "Complete data analytics curriculum",
    category: "Data Analytics",
    learningOutcomes: ["Analyze data and communicate business insights"],
    skills: [
      { id: "excel", name: "Excel for Data Analysis", topics: ["pivot tables", "formulas"], prerequisites: [], searchQueries: ["Excel data analysis course"], courseDuration: { minMinutes: 120, targetMinutes: 180, maxMinutes: 240 }, quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 4, passingScore: 70 }, projectPlacement: "none" },
      { id: "sql", name: "SQL Fundamentals", topics: ["joins", "aggregation"], prerequisites: [], searchQueries: ["SQL analytics course"], courseDuration: { minMinutes: 120, targetMinutes: 180, maxMinutes: 240 }, quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 4, passingScore: 70 }, projectPlacement: "none" }
    ],
    capstoneProjects: []
  }, {
    topic: "Data Analytics Complete Career Path",
    level: "Beginner",
    studyTimeMinutesPerDay: 60,
    goals: [],
    knownSkills: [],
    language: "en",
    intentProfile: { goal: "learn", scope: "broad", preferences: { courseDepth: "complete" } }
  }, { resolveSkill: canonicalize, logger: { info() {} } });

  const titles = result.course.modules.map((module) => module.title.toLowerCase());
  assert.ok(titles.some((title) => title.includes("power bi")), "Power BI must be a dedicated module");
  assert.ok(titles.some((title) => title.includes("tableau")), "Tableau must be a dedicated module");
  assert.ok(titles.some((title) => title.includes("ai-powered data analysis")), "AI-powered analysis must be a dedicated module");
  assert.equal(new Set(titles).size, titles.length, "module titles must not be duplicated");
  assert.ok(!titles.some((title) => title === "data analytics learning path" || title === "learn: data analytics"), "the duplicate short learning-path module must not be appended");
});

test("complete Data Analytics modules contain lesson-specific resource search context", async () => {
  const result = await buildCourse({
    title: "Data Analytics Complete Career Path",
    canonicalTopic: "Data Analytics",
    description: "Complete data analytics curriculum",
    category: "Data Analytics",
    learningOutcomes: ["Analyze data"],
    skills: [],
    capstoneProjects: []
  }, {
    topic: "Data Analytics",
    level: "Beginner",
    studyTimeMinutesPerDay: 60,
    goals: [],
    knownSkills: [],
    language: "en",
    intentProfile: { goal: "learn", scope: "broad", preferences: { courseDepth: "complete" } }
  }, { resolveSkill: canonicalize, logger: { info() {} } });

  const powerBi = result.course.modules.find((module) => /power bi/i.test(module.title));
  const tableau = result.course.modules.find((module) => /tableau/i.test(module.title));
  for (const module of [powerBi, tableau]) {
    assert.ok(module, "expected dedicated BI module");
    const tutorial = module.lessons.find((lesson) => lesson.type === "tutorial");
    assert.ok(tutorial?.tutorial?.searchQuery);
    assert.ok(tutorial.tutorial.requiredTopics?.length);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
// Node 24's built-in type stripping runs this erasable TypeScript module directly.
import {
  getNicheDisclaimer,
  getNichePackName,
  getNicheQuestions,
  getPurposeQuestions,
  getSkillChecklist,
} from "../src/data/buildWithAiQuestionPacks.ts";

test("Python prior-skill checklist matches canonical learning knowledge-base stage names", () => {
  assert.deepEqual(getSkillChecklist("Python"), [
    "Python",
    "Python Control Flow and Functions",
    "Python Data Structures and Problem Solving",
    "Object-Oriented Python",
    "Python Files, Exceptions and Modules",
    "Python Tooling, Testing and APIs",
    "Python Automation and Practical Applications",
  ]);
});

test("MERN prior-skill checklist uses canonical HTML, CSS, JavaScript and stack names", () => {
  const checklist = getSkillChecklist("MERN Stack");
  assert.ok(checklist.includes("HTML"));
  assert.ok(checklist.includes("CSS"));
  assert.ok(checklist.includes("JavaScript"));
  assert.ok(checklist.includes("React"));
  assert.ok(checklist.includes("Node.js"));
  assert.ok(checklist.includes("Express.js"));
  assert.ok(checklist.includes("MongoDB"));
  assert.ok(checklist.includes("Git & GitHub"));
});

test("programming and personal-finance topics combine matching question packs without duplicate IDs", () => {
  const questions = getNicheQuestions("Python personal finance");
  const ids = questions.map((question) => question.id);
  assert.ok(ids.includes("buildTarget"));
  assert.ok(ids.includes("dsaNeeded"));
  assert.ok(ids.includes("marketRegion"));
  assert.ok(ids.includes("investingStyle"));
  assert.equal(new Set(ids).size, ids.length);
});

test("finance and fitness packs include education-only safety notes", () => {
  assert.match(getNicheDisclaimer("personal finance investing") || "", /not financial advice/i);
  assert.match(getNicheDisclaimer("fitness workout") || "", /qualified health professional/i);
});

test("purpose packs are specific and optional for each supported learning purpose", () => {
  for (const purpose of ["career", "freelance", "career_switch", "exam", "project", "hobby"]) {
    const questions = getPurposeQuestions(purpose);
    assert.ok(questions.length > 0, purpose + " purpose pack should exist");
    assert.ok(questions.every((question) => question.optional));
  }
});
test("purpose packs mirror the Roadmap Studio demo's career, exam, freelance, hobby and switch questions", () => {
  const career = getPurposeQuestions("career");
  assert.equal(career[0].id, "targetRole");
  assert.equal(career[0].text, "What is your target role and company type?");
  assert.equal(career[0].allowText, true);
  assert.equal(career[1].id, "jobTimeline");

  assert.deepEqual(getPurposeQuestions("exam").map((question) => question.id), ["examPreparationType", "examTimeline"]);
  assert.deepEqual(getPurposeQuestions("freelance").map((question) => question.id), ["freelanceClient", "freelancePortfolio"]);
  assert.deepEqual(getPurposeQuestions("hobby").map((question) => question.id), ["hobbyFocus"]);
  assert.deepEqual(getPurposeQuestions("career_switch").map((question) => question.id), ["currentBackground"]);
  assert.ok(getPurposeQuestions("career_switch")[0].allowText);
});

test("niche detection exposes the demo's domain labels and safe unknown-domain fallback label", () => {
  assert.equal(getNichePackName("React and Node.js"), "Programming & Web Dev");
  assert.equal(getNichePackName("LLM engineering"), "AI, Data & Machine Learning");
  assert.equal(getNichePackName("Stock Market Investing in India"), "Personal Finance & Investing");
  assert.equal(getNichePackName("Calisthenics and mobility"), "Health, Fitness & Wellness");
  assert.equal(getNichePackName("Unmapped subject: beekeeping"), "AI Custom Domain Pack");
});

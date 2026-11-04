import test from "node:test";
import assert from "node:assert/strict";
import { resolveLearningPath, getSkill } from "../src/data/learningKnowledgeBase.js";

test("Python resolves to a complete multi-stage curriculum rather than a single-video skill", () => {
  for (const query of ["Python", "Python course", "Python for beginners", "Python programming course", "Python for a TCS interview"]) {
    const resolved = resolveLearningPath(query);
    assert.equal(resolved?.type, "career", query);
    assert.equal(resolved.path.id, "python");
    assert.ok(resolved.path.skillOrder.length >= 7);
    assert.ok(resolved.path.capstone);
  }
});

test("Python curriculum stages have distinct topics, projects and substantial duration bounds", () => {
  const resolved = resolveLearningPath("Python");
  const skills = resolved.path.skillOrder.map((id) => getSkill(id));
  assert.ok(skills.every(Boolean));
  assert.equal(new Set(skills.map((item) => item.id)).size, skills.length);
  assert.ok(skills.every((item) => item.topics.length >= 6));
  assert.ok(skills.every((item) => item.practiceProject));
  assert.ok(skills.every((item) => item.durationMinutes.min >= 60));
  assert.ok(skills.every((item) => item.durationMinutes.max >= item.durationMinutes.min));
  assert.deepEqual(skills.slice(1).map((item) => item.prerequisites[0]), skills.slice(0, -1).map((item) => item.id));
});

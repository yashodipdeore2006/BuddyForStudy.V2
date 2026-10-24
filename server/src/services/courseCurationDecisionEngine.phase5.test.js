import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCurationHardGates } from "./courseCurationDecisionEngine.service.js";

const interviewCandidate = {
  title: "Python Interview Questions",
  description: "Questions and answers for a Python interview",
  videoId: "evidence-1",
  sourceType: "video",
  privacyStatus: "public",
  embeddable: true,
  durationSeconds: 1200,
  publishedAt: new Date().toISOString(),
  queryTermStats: { relevance: 90, titleRelevance: 90 },
  hasChapters: false,
  hasSyllabus: false
};

const profile = {
  query: "Python interview questions",
  normalizedQuery: "python interview questions",
  mode: "quick_reference",
  level: "Beginner",
  language: "en",
  minVideoSeconds: 60,
  maxVideoSeconds: 5400,
  minPlaylistSeconds: 60,
  minPlaylistItems: 1,
  halfLifeDays: 540,
  category: "software"
};

test("interview node may relax only the video structure-evidence gate", () => {
  assert.deepEqual(evaluateCurationHardGates(interviewCandidate, profile), { passed: false, reason: "no_structure_evidence" });
  assert.deepEqual(evaluateCurationHardGates(interviewCandidate, { ...profile, nodeType: "interview" }), { passed: true, reason: "" });
});

test("interview node still enforces safety and other hard gates", () => {
  assert.equal(evaluateCurationHardGates({ ...interviewCandidate, embeddable: false }, { ...profile, nodeType: "interview" }).reason, "not_embeddable");
  assert.equal(evaluateCurationHardGates({ ...interviewCandidate, isShort: true }, { ...profile, nodeType: "interview" }).reason, "short_form");
  assert.equal(evaluateCurationHardGates({ ...interviewCandidate, durationSeconds: 10 }, { ...profile, nodeType: "interview" }).reason, "runtime_outside_mode");
});

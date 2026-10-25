import test from "node:test";
import assert from "node:assert/strict";
import { gradeQuizSubmission, toPublicQuiz, toPublicQuizQuestion } from "../src/utils/quizSecurity.js";

const questions = [
  {
    id: "q1", topic: "JavaScript", question: "Which value is boolean true?",
    options: [{ id: "a", text: "false" }, { id: "b", text: "true" }],
    correctOptionId: "b", explanation: "The literal true is boolean."
  },
  {
    id: "q2", question: "Which is an array?",
    options: [{ id: "a", text: "{}" }, { id: "b", text: "[]" }],
    correctOptionId: "b", explanation: "Square brackets create an array."
  }
];

test("learner quiz projections never expose answer keys or explanations before submission", () => {
  const publicQuestion = toPublicQuizQuestion(questions[0]);
  assert.deepEqual(Object.keys(publicQuestion).sort(), ["id", "options", "question", "topic"]);
  assert.equal("correctOptionId" in publicQuestion, false);
  assert.equal("explanation" in publicQuestion, false);
  assert.equal(publicQuestion.options[1].text, "true");

  const publicQuiz = toPublicQuiz({ title: "Basics", passingScore: 70, questions });
  assert.equal(publicQuiz.questions.length, 2);
  assert.equal("correctOptionId" in publicQuiz.questions[0], false);
  assert.equal("explanation" in publicQuiz.questions[0], false);
});

test("quiz grading derives scores only from server-side answer keys and valid option IDs", () => {
  const graded = gradeQuizSubmission(questions, { q1: "b", q2: "not-a-real-option", extra: "b" }, 50);
  assert.equal(graded.correctCount, 1);
  assert.equal(graded.questionCount, 2);
  assert.equal(graded.score, 50);
  assert.equal(graded.passed, true);
  assert.deepEqual(graded.results.map((item) => item.isCorrect), [true, false]);
  assert.deepEqual(graded.results.map((item) => item.correctOptionId), ["b", "b"]);
  assert.equal(graded.results[1].explanation, "Square brackets create an array.");
});

test("quiz scoring treats omitted answers as incorrect and invalid passing thresholds safely", () => {
  const graded = gradeQuizSubmission(questions, {}, Number.NaN);
  assert.equal(graded.correctCount, 0);
  assert.equal(graded.score, 0);
  assert.equal(graded.passed, false);
  assert.equal(gradeQuizSubmission(questions, { q1: "b", q2: "b" }, 100).passed, true);
});

 
test("all quiz questions require a real selected option before grading", async () => {
  const { normalizeQuizAnswers } = await import("../src/utils/quizSecurity.js");
  assert.deepEqual(normalizeQuizAnswers(questions, { q1: "b", q2: "b" }), {
    valid: true, answers: { q1: "b", q2: "b" }
  });
  assert.deepEqual(normalizeQuizAnswers(questions, { q1: "b" }), { valid: false, questionId: "q2" });
  assert.deepEqual(normalizeQuizAnswers(questions, { q1: "not-an-option", q2: "b" }), { valid: false, questionId: "q1" });
  assert.deepEqual(normalizeQuizAnswers(questions, { "bank-q1": "b", "bank-q2": "a" }, "bank-"), {
    valid: true, answers: { q1: "b", q2: "a" }
  });
});

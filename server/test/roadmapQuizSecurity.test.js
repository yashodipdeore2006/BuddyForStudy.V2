import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLearningRoadmap } from "../src/utils/roadmapSecurity.js";

const fixture = () => ({
  _id: "roadmap-1",
  course: {
    title: "JavaScript",
    modules: [
      {
        title: "Basics",
        quiz: {
          questions: [
            { question: "1 + 1?", options: ["1", "2"], answer: 1, explanation: "Two." },
            { question: "2 + 2?", options: ["3", "4"], answer: 1, explanation: "Four." }
          ]
        }
      },
      {
        title: "Advanced",
        quiz: {
          questions: [
            { question: "Which is async?", options: ["Promise", "Number"], answer: 0, explanation: "Promises represent async results." }
          ]
        }
      }
    ]
  },
  quizAttempts: [],
});

test("saved personalized roadmap quiz responses omit answers and explanations before submission", () => {
  const roadmap = sanitizeLearningRoadmap(fixture());
  assert.equal("answer" in roadmap.course.modules[0].quiz.questions[0], false);
  assert.equal("correctOptionId" in roadmap.course.modules[0].quiz.questions[0], false);
  assert.equal("explanation" in roadmap.course.modules[0].quiz.questions[0], false);
  assert.equal(roadmap.course.modules[0].quiz.questions[0].options[1], "2");
});

test("roadmap quiz review is revealed only for modules with a saved quiz attempt", () => {
  const source = fixture();
  source.quizAttempts.push({ moduleIndex: 0, answers: [1, 1], score: 2, total: 2 });
  const roadmap = sanitizeLearningRoadmap(source);
  assert.equal(roadmap.course.modules[0].quiz.questions[0].answer, 1);
  assert.equal(roadmap.course.modules[0].quiz.questions[0].explanation, "Two.");
  assert.equal("answer" in roadmap.course.modules[1].quiz.questions[0], false);
  assert.equal("explanation" in roadmap.course.modules[1].quiz.questions[0], false);
});

test("sanitizing a plain saved roadmap does not mutate the database-shaped source object", () => {
  const source = fixture();
  sanitizeLearningRoadmap(source);
  assert.equal(source.course.modules[0].quiz.questions[0].answer, 1);
  assert.equal(source.course.modules[0].quiz.questions[0].explanation, "Two.");
});

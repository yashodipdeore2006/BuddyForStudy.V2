import test from "node:test";
import assert from "node:assert/strict";
import { LearningRoadmap } from "../src/models/LearningRoadmap.js";
import * as roadmapService from "../src/services/roadmap.service.js";

function makeRoadmap(input, userId) {
  return {
    _id: "roadmap-1",
    user: userId,
    query: input.query,
    canonicalTopic: input.canonicalTopic,
    intent: input.intent || "",
    careerOutcome: input.careerOutcome || "",
    level: input.level || "Beginner",
    course: input.course,
    skillGraph: input.skillGraph || [],
    personalization: input.personalization || {},
    adaptiveState: {},
    lessons: input.lessons || [],
    completedLessonIds: [],
    quizAttempts: [],
    lastLessonId: null,
    status: "active",
    startedAt: new Date("2026-10-01T00:00:00.000Z"),
    lastAccessedAt: new Date("2026-10-01T00:00:00.000Z"),
    completedAt: null,
    saveCount: 0,
    async save() { this.saveCount += 1; return this; },
    markModified() {},
    toObject() {
      return {
        _id: this._id,
        user: this.user,
        query: this.query,
        canonicalTopic: this.canonicalTopic,
        intent: this.intent,
        careerOutcome: this.careerOutcome,
        level: this.level,
        course: structuredClone(this.course),
        skillGraph: structuredClone(this.skillGraph),
        personalization: structuredClone(this.personalization),
        adaptiveState: structuredClone(this.adaptiveState),
        lessons: structuredClone(this.lessons),
        completedLessonIds: [...this.completedLessonIds],
        quizAttempts: structuredClone(this.quizAttempts),
        lastLessonId: this.lastLessonId,
        status: this.status,
        startedAt: this.startedAt,
        lastAccessedAt: this.lastAccessedAt,
        completedAt: this.completedAt
      };
    }
  };
}

test("saved roadmap can be continued, completed, quizzed, and deleted only by its owner", async () => {
  const originals = {
    create: LearningRoadmap.create,
    findOne: LearningRoadmap.findOne,
    findOneAndDelete: LearningRoadmap.findOneAndDelete
  };
  let stored = null;
  let generationCalls = 0;
  const input = {
    query: "Node.js backend",
    canonicalTopic: "Node.js backend",
    level: "Beginner",
    course: {
      title: "Node.js backend",
      description: "Build backend applications",
      modules: [{
        title: "Node basics",
        lessons: [{ _id: "lesson-1", title: "HTTP APIs", type: "tutorial" }],
        quiz: {
          title: "HTTP basics",
          questions: [
            { question: "Which protocol powers web APIs?", options: ["HTTP", "CSV"], answer: 0, explanation: "HTTP is used for web APIs." }
          ]
        }
      }]
    },
    lessons: [{ lessonId: "lesson-1", title: "HTTP APIs", type: "tutorial", moduleTitle: "Node basics", order: 1 }]
  };

  LearningRoadmap.create = async (payload) => {
    stored = makeRoadmap(payload, String(payload.user));
    return stored;
  };
  LearningRoadmap.findOne = async (filter) => {
    if (stored && String(filter._id) === String(stored._id) && String(filter.user) === String(stored.user)) return stored;
    return null;
  };
  LearningRoadmap.findOneAndDelete = async (filter) => {
    if (stored && String(filter._id) === String(stored._id) && String(filter.user) === String(stored.user)) {
      const deleted = stored;
      stored = null;
      return deleted;
    }
    return null;
  };

  try {
    const saved = await roadmapService.saveRoadmap("learner-a", input);
    assert.equal(saved.progress.totalLessons, 1);
    assert.equal(saved.progress.completedCount, 0);
    assert.equal(saved.progress.percentage, 0);

    const continued = await roadmapService.getRoadmap("learner-a", "roadmap-1");
    assert.equal(continued.course.title, "Node.js backend");
    assert.equal(continued.progress.percentage, 0);
    assert.equal("answer" in continued.course.modules[0].quiz.questions[0], false);

    await assert.rejects(
      roadmapService.getRoadmap("learner-b", "roadmap-1"),
      (error) => error.status === 404
    );

    const quiz = await roadmapService.generateModuleQuizForRoadmap("learner-a", "roadmap-1", 0);
    assert.equal(quiz.course.modules[0].quiz.questions.length, 1);
    assert.equal("answer" in quiz.course.modules[0].quiz.questions[0], false);
    assert.equal(generationCalls, 0, "an already saved quiz should be reused without provider calls");

    const graded = await roadmapService.submitQuiz("learner-a", "roadmap-1", 0, [0]);
    assert.equal(graded.quizAttempts.length, 1);
    assert.equal(graded.quizAttempts[0].score, 1);
    assert.equal(graded.progress.percentage, 0);
    assert.equal(graded.course.modules[0].quiz.questions[0].answer, 0);
    assert.equal(graded.course.modules[0].quiz.questions[0].explanation, "HTTP is used for web APIs.");

    const completed = await roadmapService.completeLesson("learner-a", "roadmap-1", "lesson-1");
    assert.deepEqual(completed.completedLessonIds, ["lesson-1"]);
    assert.equal(completed.status, "completed");
    assert.equal(completed.progress.completedCount, 1);
    assert.equal(completed.progress.percentage, 100);

    await assert.rejects(
      roadmapService.deleteRoadmap("learner-b", "roadmap-1"),
      (error) => error.status === 404
    );
    assert.ok(stored, "another learner must not delete this roadmap");

    const deleted = await roadmapService.deleteRoadmap("learner-a", "roadmap-1");
    assert.equal(deleted.id, "roadmap-1");
    assert.equal(stored, null);
  } finally {
    LearningRoadmap.create = originals.create;
    LearningRoadmap.findOne = originals.findOne;
    LearningRoadmap.findOneAndDelete = originals.findOneAndDelete;
  }
});

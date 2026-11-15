import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.BUILD_WITH_AI_SELECTOR_MOCK = "true";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy-test";
process.env.JWT_SECRET ||= "test-only-secret";

const { createDraft } = await import("../src/controllers/asyncRoadmap.controller.js");
const { queueNextLessonQuiz } = await import("../src/controllers/ai.controller.js");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

test("async roadmap rejects unknown nested intentProfile fields before queueing", async () => {
  const res = responseRecorder();
  let queued = false;

  await createDraft(
    {
      user: { userId: "learner-1" },
      body: {
        profile: {
          topic: "Node.js",
          intentProfile: {
            topic: "Node.js",
            injectedAdminOverride: true
          }
        }
      }
    },
    res,
    (error) => { throw error; },
    {
      authorize: async () => true,
      createRoadmapDraft: async () => {
        queued = true;
        return { draftId: "draft-1", status: "queued" };
      }
    }
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(queued, false);
});

test("async roadmap maps only validated intent fields into the queued profile", async () => {
  const res = responseRecorder();
  let queuedProfile = null;

  await createDraft(
    {
      user: { userId: "learner-1" },
      body: {
        profile: {
          topic: "JavaScript",
          level: "Beginner",
          studyTimeMinutesPerDay: 30,
          intentProfile: {
            topic: "Node.js",
            level: "Advanced",
            goal: "job_ready",
            minutesPerDay: 90,
            knownSkills: ["JavaScript"],
            language: "en"
          }
        }
      }
    },
    res,
    (error) => { throw error; },
    {
      authorize: async () => true,
      createRoadmapDraft: async ({ profile }) => {
        queuedProfile = profile;
        return { draftId: "draft-2", status: "queued" };
      }
    }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(queuedProfile.topic, "Node.js");
  assert.equal(queuedProfile.level, "Advanced");
  assert.equal(queuedProfile.studyTimeMinutesPerDay, 90);
  assert.deepEqual(queuedProfile.knownSkills, ["JavaScript"]);
  assert.deepEqual(queuedProfile.goals, ["Career or work growth"]);
});

test("practice quiz queue fails closed when the learner ID is missing", async () => {
  await assert.rejects(
    queueNextLessonQuiz("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"),
    /learner ID is required/
  );
});

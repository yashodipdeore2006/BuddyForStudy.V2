import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/progress-idempotency-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { Course } = await import("../src/models/Course.js");
const { Enrollment } = await import("../src/models/Enrollment.js");
const { Progress } = await import("../src/models/Progress.js");
const { LearningStats } = await import("../src/models/LearningStats.js");
const { completeItem } = await import("../src/services/progress.service.js");

function query(value) {
  return {
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

test("repeated completion of the same lesson is idempotent and records learning activity once", async () => {
  const userId = "507f191e810c19729de860ea";
  const courseId = "507f1f77bcf86cd799439011";
  const lessonId = "507f1f77bcf86cd799439012";
  const otherLessonId = "507f1f77bcf86cd799439013";
  const course = {
    _id: courseId,
    title: "Progress idempotency fixture",
    isPublished: true,
    deletedAt: null,
    status: "published",
    visibility: "public",
    pricing: { mode: "free" },
    modules: [{
      _id: "507f1f77bcf86cd799439014",
      lessons: [
        { _id: lessonId, title: "Quiz lesson", type: "quiz" },
        { _id: otherLessonId, title: "Second lesson", type: "tutorial" }
      ]
    }]
  };
  const enrollment = { user: userId, course: courseId, status: "active", revokedBy: null, accessSource: "self" };
  let storedProgress = null;
  let progressSaveCalls = 0;
  let activitySaveCalls = 0;
  let lessonActivityCalls = 0;
  let enrollmentUpdateCalls = 0;

  const stats = {
    user: userId,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: "",
    totalActiveDays: 0,
    totalLessonsCompleted: 0,
    totalCoursesCompleted: 0,
    dailyGoalLessons: 1,
    activityDates: [],
    streakFreezeUsedWeek: "",
    achievements: [],
    save: async () => { activitySaveCalls += 1; }
  };

  const original = {
    courseFindById: Course.findById,
    courseFindOne: Course.findOne,
    enrollmentFindOne: Enrollment.findOne,
    enrollmentUpdateOne: Enrollment.updateOne,
    progressFindOne: Progress.findOne,
    progressSave: Progress.prototype.save,
    statsFindOneAndUpdate: LearningStats.findOneAndUpdate
  };

  Course.findById = async (id) => {
    assert.equal(String(id), courseId);
    return course;
  };
  Course.findOne = (filter) => {
    assert.equal(String(filter._id), courseId);
    return query(course);
  };
  Enrollment.findOne = (filter) => {
    assert.equal(String(filter.user), userId);
    assert.equal(String(filter.course), courseId);
    return query(enrollment);
  };
  Enrollment.updateOne = async (filter) => {
    assert.equal(String(filter.user), userId);
    assert.equal(String(filter.course), courseId);
    enrollmentUpdateCalls += 1;
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Progress.findOne = async (filter) => {
    assert.equal(String(filter.user), userId);
    assert.equal(String(filter.course), courseId);
    return storedProgress;
  };
  Progress.prototype.save = async function saveProgress() {
    progressSaveCalls += 1;
    storedProgress = this;
    return this;
  };
  LearningStats.findOneAndUpdate = async (filter) => {
    assert.equal(String(filter.user), userId);
    lessonActivityCalls += 1;
    return stats;
  };

  try {
    const first = await completeItem(userId, courseId, lessonId);
    const second = await completeItem(userId, courseId, lessonId);

    assert.equal(first, second);
    assert.equal(second.completedLessons.length, 1);
    assert.equal(String(second.completedLessons[0].lessonId), lessonId);
    assert.equal(second.completedCount, 1);
    assert.equal(second.totalLessons, 2);
    assert.equal(second.percentage, 50);
    assert.equal(progressSaveCalls, 2, "progress can be safely re-saved for repeated requests");
    assert.equal(lessonActivityCalls, 1, "learning stats are only updated on the first completion");
    assert.equal(activitySaveCalls, 1, "learning activity is persisted exactly once");
    assert.equal(stats.totalLessonsCompleted, 1);
    assert.equal(enrollmentUpdateCalls, 2, "enrollment status stays synchronized on each request");
  } finally {
    Course.findById = original.courseFindById;
    Course.findOne = original.courseFindOne;
    Enrollment.findOne = original.enrollmentFindOne;
    Enrollment.updateOne = original.enrollmentUpdateOne;
    Progress.findOne = original.progressFindOne;
    Progress.prototype.save = original.progressSave;
    LearningStats.findOneAndUpdate = original.statsFindOneAndUpdate;
  }
});

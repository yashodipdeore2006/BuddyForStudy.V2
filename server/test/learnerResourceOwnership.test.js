import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/learner-resource-ownership-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { Enrollment } = await import("../src/models/Enrollment.js");
const { Course } = await import("../src/models/Course.js");
const enrollmentService = await import("../src/services/enrollment.service.js");
const progressService = await import("../src/services/progress.service.js");

test("enrollment detail lookup is scoped to the authenticated learner and enrollment ID", () => {
  const originalFindOne = Enrollment.findOne;
  const filters = [];
  Enrollment.findOne = (filter) => {
    filters.push(filter);
    return { populate() { return this; } };
  };

  try {
    enrollmentService.getOne("learner-b", "enrollment-owned-by-a");
    assert.deepEqual(filters, [{
      _id: "enrollment-owned-by-a",
      user: "learner-b"
    }]);
  } finally {
    Enrollment.findOne = originalFindOne;
  }
});

test("another learner receives no course enrollment and cannot infer its existence", async () => {
  const originalFindOne = Enrollment.findOne;
  const ownerEnrollment = {
    user: "learner-a",
    course: "507f1f77bcf86cd799439011",
    status: "active",
    revokedBy: null,
    courseDocument: { _id: "507f1f77bcf86cd799439011" }
  };
  const filters = [];

  Enrollment.findOne = (filter) => {
    filters.push(filter);
    const matchesOwner = String(filter.user) === ownerEnrollment.user &&
      String(filter.course) === ownerEnrollment.course;
    return {
      populate: async () => matchesOwner
        ? { ...ownerEnrollment, course: ownerEnrollment.courseDocument }
        : null
    };
  };

  try {
    const result = await enrollmentService.getForCourse(
      "learner-b",
      "507f1f77bcf86cd799439011"
    );
    assert.equal(result, null);
    assert.deepEqual(filters, [{
      user: "learner-b",
      course: "507f1f77bcf86cd799439011",
      status: { $in: ["active", "completed"] },
      revokedBy: null
    }]);
  } finally {
    Enrollment.findOne = originalFindOne;
  }
});

test("another learner cannot cancel an enrollment they do not own", async () => {
  const originalFindOneAndUpdate = Enrollment.findOneAndUpdate;
  const filters = [];
  let writes = 0;
  Enrollment.findOneAndUpdate = async (filter, update) => {
    filters.push({ filter, update });
    const belongsToLearnerB = filter.user === "learner-b";
    if (!belongsToLearnerB) return null;
    writes += 1;
    return { _id: "enrollment-b", ...filter, ...update };
  };

  try {
    const result = await enrollmentService.cancel(
      "learner-b",
      "507f1f77bcf86cd799439011"
    );
    assert.equal(result, null, "a non-owner must not receive or mutate learner A's enrollment");
    assert.equal(writes, 0);
    assert.deepEqual(filters, [{
      filter: {
        user: "learner-b",
        course: "507f1f77bcf86cd799439011",
        status: { $ne: "cancelled" }
      },
      update: { status: "cancelled" }
    }]);
  } finally {
    Enrollment.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("progress service rejects a learner without an enrollment before reading or writing progress", async () => {
  const originalCourseFindById = Course.findById;
  const originalEnrollmentFindOne = Enrollment.findOne;
  let enrollmentFilter;
  Course.findById = async (courseId) => ({ _id: String(courseId), modules: [] });
  Enrollment.findOne = async (filter) => {
    enrollmentFilter = filter;
    // Simulate a course enrolled by learner A but not learner B.
    return null;
  };

  try {
    await assert.rejects(
      progressService.getProgress(
        "learner-b",
        "507f1f77bcf86cd799439011"
      ),
      (error) => error.status === 403 && /enrollment required/i.test(error.message)
    );
    assert.deepEqual(enrollmentFilter, {
      user: "learner-b",
      course: "507f1f77bcf86cd799439011",
      status: { $in: ["active", "completed"] },
      revokedBy: null
    });
  } finally {
    Course.findById = originalCourseFindById;
    Enrollment.findOne = originalEnrollmentFindOne;
  }
});

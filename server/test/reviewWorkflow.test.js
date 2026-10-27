import test from "node:test";
import assert from "node:assert/strict";
import { Enrollment } from "../src/models/Enrollment.js";
import { Course } from "../src/models/Course.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { Review } from "../src/models/Review.js";
import * as reviewController from "../src/controllers/review.controller.js";
import * as reviewService from "../src/services/review.service.js";

const COURSE_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f191e810c19729de860ea";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function queryReturning(value) {
  return {
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

test("review endpoint rejects malformed course IDs, out-of-range ratings and oversized comments before persistence", async (t) => {
  await t.test("malformed course ID", async () => {
    let lookups = 0;
    await withMocks([[Enrollment, { exists: async () => { lookups += 1; return true; } }]], async () => {
      const res = responseRecorder();
      await reviewController.upsert({
        params: { courseId: "not-an-object-id" },
        body: { rating: 5, comment: "Helpful" },
        user: { userId: USER_ID }
      }, res, (error) => assert.fail("Unexpected error: " + error));
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /invalid courseId/i);
      assert.equal(lookups, 0);
    });
  });

  for (const input of [
    { name: "rating below one", body: { rating: 0, comment: "Bad" } },
    { name: "rating above five", body: { rating: 6, comment: "Bad" } },
    { name: "fractional rating", body: { rating: 4.5, comment: "Bad" } },
    { name: "numeric string rating", body: { rating: "5", comment: "Bad" } },
    { name: "non-string comment", body: { rating: 5, comment: 12 } },
    { name: "oversized comment", body: { rating: 5, comment: "x".repeat(1001) } }
  ]) {
    await t.test(input.name, async () => {
      let writes = 0;
      await withMocks([[Review, { findOneAndUpdate: () => { writes += 1; throw new Error("Invalid input must not write"); } }]], async () => {
        const res = responseRecorder();
        await reviewController.upsert({
          params: { courseId: COURSE_ID },
          body: input.body,
          user: { userId: USER_ID }
        }, res, (error) => assert.fail("Unexpected controller error: " + error));
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "Validation failed");
        assert.equal(writes, 0);
      });
    });
  }

  await t.test("valid comment is trimmed by the schema", async () => {
    const { z } = await import("zod");
    const { reviewSchema } = await import("../src/utils/reviewValidation.js");
    assert.deepEqual(reviewSchema.parse({ rating: 5, comment: "  Useful review  " }), {
      rating: 5,
      comment: "Useful review"
    });
    assert.equal(z.ZodError.name, "ZodError");
  });
});

test("a learner must be enrolled before a course review can be created or updated", async () => {
  let writes = 0;
  await withMocks([
    [Enrollment, { exists: async () => false }],
    [PlatformSetting, { findOne: () => queryReturning({ value: "automatic" }) }],
    [Course, { findById: () => queryReturning({ _id: COURSE_ID }) }],
    [Review, { findOneAndUpdate: () => { writes += 1; throw new Error("Unenrolled learner must not write"); } }]
  ], async () => {
    await assert.rejects(
      reviewService.upsertReview(USER_ID, COURSE_ID, 5, "Helpful"),
      (error) => error.status === 403 && /must be enrolled/i.test(error.message)
    );
  });
  assert.equal(writes, 0);
});

test("review upsert keys by learner/course, updates existing review and holds manual-mode reviews for moderation", async () => {
  const review = { _id: "review-1", user: USER_ID, course: COURSE_ID, rating: 4, comment: "Useful" };
  let capturedFilter;
  let capturedUpdate;
  let capturedOptions;
  await withMocks([
    [Enrollment, { exists: async (filter) => {
      assert.deepEqual(filter, { user: USER_ID, course: COURSE_ID, status: { $in: ["active", "completed"] } });
      return true;
    } }],
    [PlatformSetting, { findOne: () => queryReturning({ value: "manual" }) }],
    [Course, { findById: () => queryReturning({ _id: COURSE_ID }) }],
    [Review, { findOneAndUpdate: (filter, update, options) => {
      capturedFilter = filter; capturedUpdate = update; capturedOptions = options;
      return { populate: async () => review };
    } }]
  ], async () => {
    const result = await reviewService.upsertReview(USER_ID, COURSE_ID, 4, "Useful");
    assert.equal(result, review);
  });

  assert.deepEqual(capturedFilter, { user: USER_ID, course: COURSE_ID });
  assert.deepEqual(capturedOptions, { new: true, upsert: true, runValidators: true });
  assert.deepEqual(capturedUpdate.$set, {
    rating: 4,
    comment: "Useful",
    moderationStatus: "pending",
    moderationNote: "",
    moderatedBy: null,
    moderatedAt: null,
    isHidden: false
  });
});

test("automatic review moderation approves a review and timestamps the moderation decision", async () => {
  let capturedUpdate;
  await withMocks([
    [Enrollment, { exists: async () => true }],
    [PlatformSetting, { findOne: () => queryReturning({ value: "automatic" }) }],
    [Course, { findById: () => queryReturning({ _id: COURSE_ID }) }],
    [Review, { findOneAndUpdate: (_filter, update) => {
      capturedUpdate = update;
      return { populate: async () => ({ ...update.$set, _id: "review-auto" }) };
    } }]
  ], async () => {
    const result = await reviewService.upsertReview(USER_ID, COURSE_ID, 5, "Excellent");
    assert.equal(result.moderationStatus, "approved");
  });

  assert.equal(capturedUpdate.$set.moderationStatus, "approved");
  assert.match(capturedUpdate.$set.moderationNote, /automatically approved/i);
  assert.ok(capturedUpdate.$set.moderatedAt instanceof Date);
});

test("public review listing queries approved visible reviews only and calculates safe aggregate stats", async () => {
  const rows = [
    { _id: "r1", rating: 5, comment: "Excellent", user: { name: "Learner One" } },
    { _id: "r2", rating: 3, comment: "Useful", user: { name: "Learner Two" } }
  ];
  let capturedFilter;
  const query = {
    populate() { return this; },
    sort(value) { assert.deepEqual(value, { createdAt: -1 }); return this; },
    lean: async () => rows
  };
  await withMocks([[Review, { find: (filter) => { capturedFilter = filter; return query; } }]], async () => {
    const result = await reviewService.listReviews(COURSE_ID);
    assert.deepEqual(result.stats, {
      count: 2,
      average: 4,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }
    });
    assert.equal(result.reviews.length, 2);
  });

  assert.deepEqual(capturedFilter, {
    course: COURSE_ID,
    isHidden: { $ne: true },
    moderationStatus: "approved"
  });
});

test("review model enforces one review per learner/course pair at the database index", () => {
  const uniquePairIndex = Review.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.course === 1 && options.unique === true
  );
  assert.ok(uniquePairIndex, "a unique user/course index must prevent duplicate review rows");
});

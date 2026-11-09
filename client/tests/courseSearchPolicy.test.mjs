import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCourseSearchFallbackResults,
  isBroadCourseSearch,
  MIN_COMPLETE_COURSE_PLAYLIST_ITEMS,
  MIN_COMPLETE_COURSE_VIDEO_SECONDS,
} from "../src/lib/courseSearchPolicy.ts";
import { getCheckoutSubscriptionPlans, formatPlanLimit } from "../src/lib/subscriptionPlans.ts";

test("broad Python searches require full-course videos or structured playlists", () => {
  const result = filterCourseSearchFallbackResults(
    "Python",
    [
      { id: "short", durationSeconds: 30 * 60 },
      { id: "full", durationSeconds: 4 * 60 * 60 },
    ],
    [
      { id: "short-playlist", itemCount: 3 },
      { id: "course-playlist", itemCount: 24 },
    ],
  );

  assert.equal(result.requiresCompleteCourse, true);
  assert.deepEqual(result.videos.map((item) => item.id), ["full"]);
  assert.deepEqual(result.playlists.map((item) => item.id), ["course-playlist"]);
  assert.equal(MIN_COMPLETE_COURSE_VIDEO_SECONDS, 10800);
  assert.equal(MIN_COMPLETE_COURSE_PLAYLIST_ITEMS, 8);
});

test("broad beginner course queries keep the complete-course policy", () => {
  assert.equal(isBroadCourseSearch("Python for beginners"), true);
  assert.equal(isBroadCourseSearch("Python full course"), true);
});

test("specific Python skill searches can still return focused tutorials", () => {
  const result = filterCourseSearchFallbackResults(
    "Python list comprehension",
    [{ id: "focused", durationSeconds: 12 * 60 }],
    [{ id: "focused-playlist", itemCount: 2 }],
  );

  assert.equal(result.requiresCompleteCourse, false);
  assert.equal(result.videos.length, 1);
  assert.equal(result.playlists.length, 1);
});


test("pricing and upgrade screens share active recurring plans in backend admin order", () => {
  const plans = [
    { _id: "starter", sortOrder: 1, price: 99, billingInterval: "monthly", isActive: true },
    { _id: "pro", sortOrder: 2, price: 999, billingInterval: "yearly", isActive: true },
    { _id: "one-time", sortOrder: 3, price: 49, billingInterval: "one_time", isActive: true },
    { _id: "inactive", sortOrder: 4, price: 0, billingInterval: "monthly", isActive: false },
  ];

  const visible = getCheckoutSubscriptionPlans(plans);
  assert.deepEqual(visible.map((plan) => plan._id), ["starter", "pro"]);
  assert.deepEqual(visible.map((plan) => plan.sortOrder), [1, 2]);
  assert.deepEqual(getCheckoutSubscriptionPlans(null), []);
});

test("subscription usage limits use shared labels and unlimited/zero formatting", () => {
  assert.equal(formatPlanLimit(-1), "Unlimited");
  assert.equal(formatPlanLimit(0), "Not included");
  assert.equal(formatPlanLimit(10), "10 / month");
  assert.equal(formatPlanLimit(undefined), "Not configured");
});

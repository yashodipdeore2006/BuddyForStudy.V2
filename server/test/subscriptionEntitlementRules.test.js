import test from "node:test";
import assert from "node:assert/strict";
import {
  isSubscriptionPeriodCurrent,
  isCourseAccessAllowed,
  readPlanLimit,
  resolveFeature,
} from "../src/services/subscriptionEntitlement.service.js";
import { normalizeSubscriptionFeatures } from "../src/config/subscriptionFeatures.js";

test("subscription period boundary expires exactly at currentPeriodEnd", () => {
  const end = new Date("2026-10-18T12:00:00.000Z");
  assert.equal(isSubscriptionPeriodCurrent({ currentPeriodEnd: end }, end.getTime() - 1), true);
  assert.equal(isSubscriptionPeriodCurrent({ currentPeriodEnd: end }, end.getTime()), false);
  assert.equal(isSubscriptionPeriodCurrent({ currentPeriodEnd: end }, end.getTime() + 1), false);
});

test("missing period end remains compatible with legacy subscriptions", () => {
  assert.equal(isSubscriptionPeriodCurrent({ currentPeriodEnd: null }, Date.now()), true);
  assert.equal(isSubscriptionPeriodCurrent({}, Date.now()), true);
});

test("malformed subscription period end fails closed", () => {
  assert.equal(isSubscriptionPeriodCurrent({ currentPeriodEnd: "not-a-date" }, Date.now()), false);
});

test("an all-published-courses subscription entitlement grants paid-course access while active", () => {
  assert.equal(isCourseAccessAllowed({ isPaidCourse: true, planEntitled: true, hasIndividualAccess: false }), true);
  assert.equal(isCourseAccessAllowed({ isPaidCourse: true, planEntitled: false, hasIndividualAccess: true }), true);
  assert.equal(isCourseAccessAllowed({ isPaidCourse: false, planEntitled: true, hasIndividualAccess: false }), true);
  assert.equal(isCourseAccessAllowed({ isPaidCourse: false, planEntitled: false, hasIndividualAccess: false }), false);
});

test("subscription-origin free enrollments require a current published-course entitlement", async () => {
  const { isEnrollmentCourseAccessAllowed } = await import("../src/services/subscriptionEntitlement.service.js");
  const enrollment = { status: "active", accessSource: "subscription" };
  const course = { pricing: { mode: "free" }, isPublished: true };
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course, userId: "u1", planEntitled: false }), false);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course, userId: "u1", planEntitled: true }), true);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment: { ...enrollment, accessSource: "self" }, course, userId: "u1", planEntitled: false }), true);
});

test("paid-course access accepts current plan entitlement or verified individual payment, but fails closed otherwise", async () => {
  const { isEnrollmentCourseAccessAllowed } = await import("../src/services/subscriptionEntitlement.service.js");
  const enrollment = { status: "active", accessSource: "self" };
  const course = { pricing: { mode: "paid" }, isPublished: true };
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course, userId: "u1", planEntitled: true }), true);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course, userId: "u1", hasIndividualPayment: true }), true);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course, userId: "u1" }), false);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment: { ...enrollment, accessSource: "admin" }, course, userId: "u1" }), true);
  assert.equal(isEnrollmentCourseAccessAllowed({ enrollment, course: { ...course, pricing: { mode: "missing" } }, userId: "u1", planEntitled: true }), false);
});

test("plan limits handle maps, plain objects, missing values, and invalid values", () => {
  assert.equal(readPlanLimit({ limits: new Map([["monthly", 5]]) }, "monthly"), 5);
  assert.equal(readPlanLimit({ limits: { monthly: 3 } }, "monthly"), 3);
  assert.equal(readPlanLimit({ limits: {} }, "monthly"), -1);
  assert.equal(readPlanLimit({ limits: { monthly: "invalid" } }, "monthly", 0), 0);
});

test("unknown entitlement keys fail closed and known feature aliases resolve", () => {
  assert.equal(resolveFeature("not_a_real_feature"), null);
  assert.equal(resolveFeature("published_courses")?.key, "published_courses");
  assert.equal(resolveFeature("Access published courses")?.key, "published_courses");
});

test("legacy plan feature labels normalize to the canonical feature set without duplicates", () => {
  assert.deepEqual(normalizeSubscriptionFeatures([
    "Everything in Free",
    "Access published courses",
    "Advanced AI learning paths",
    "not-a-feature",
  ]), [
    "Access published courses",
    "Normal course search",
    "Basic learning progress tracking",
    "Advanced AI learning assistant (summary, notes & lesson Q&A)",
  ]);
});

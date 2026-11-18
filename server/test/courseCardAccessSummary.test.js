import test from "node:test";
import assert from "node:assert/strict";
import { resolveCourseCardAccess } from "../src/services/subscriptionEntitlement.service.js";

const userId = "learner-1";
const paidCourse = { pricing: { mode: "paid", price: 299 }, visibility: "public", isPublished: true };
const freeCourse = { pricing: { mode: "free", price: 0 }, visibility: "public", isPublished: true };

test("paid course covered by an active plan is marked as included", () => {
  const access = resolveCourseCardAccess({ course: paidCourse, userId, planEntitled: true, planName: "Pro" });
  assert.equal(access.status, "PLAN_INCLUDED");
  assert.equal(access.source, "subscription");
  assert.equal(access.planName, "Pro");
  assert.equal(access.isEnrolled, false);
});

test("paid course without plan coverage or a verified payment remains paid", () => {
  const access = resolveCourseCardAccess({ course: paidCourse, userId });
  assert.equal(access.status, "PAID");
  assert.equal(access.source, "none");
});

test("verified individual purchase takes precedence over plan inclusion", () => {
  const access = resolveCourseCardAccess({ course: paidCourse, userId, planEntitled: true, planName: "Pro", hasIndividualPayment: true });
  assert.equal(access.status, "PURCHASED");
  assert.equal(access.source, "individual");
});

test("a free course remains free until the learner enrolls", () => {
  const access = resolveCourseCardAccess({ course: freeCourse, userId, planEntitled: true });
  assert.equal(access.status, "FREE");
  assert.equal(access.isEnrolled, false);
});

test("active free-course enrollment is surfaced as enrolled", () => {
  const access = resolveCourseCardAccess({ course: freeCourse, userId, enrollment: { status: "active", accessSource: "self" } });
  assert.equal(access.status, "ENROLLED");
  assert.equal(access.source, "self");
  assert.equal(access.isEnrolled, true);
});

test("subscription-backed enrollment is expired when the entitlement ends", () => {
  const access = resolveCourseCardAccess({ course: paidCourse, userId, enrollment: { status: "active", accessSource: "subscription" } });
  assert.equal(access.status, "ACCESS_EXPIRED");
  assert.equal(access.isEnrolled, false);
});

test("completed subscription course retains its plan source and label", () => {
  const access = resolveCourseCardAccess({
    course: paidCourse, userId, planEntitled: true, planName: "Pro",
    enrollment: { status: "completed", accessSource: "subscription" }
  });
  assert.equal(access.status, "COMPLETED");
  assert.equal(access.source, "subscription");
  assert.equal(access.isCompleted, true);
  assert.equal(access.planName, "Pro");
});

test("administrator-revoked enrollment is never presented as accessible", () => {
  const access = resolveCourseCardAccess({
    course: paidCourse, userId, planEntitled: true,
    enrollment: { status: "active", accessSource: "subscription", revokedBy: "admin-1" }
  });
  assert.equal(access.status, "ACCESS_REVOKED");
  assert.equal(access.isEnrolled, false);
});

test("unknown pricing fails closed instead of appearing free", () => {
  const access = resolveCourseCardAccess({ course: { pricing: {} }, userId });
  assert.equal(access.status, "PRICE_UNAVAILABLE");
});

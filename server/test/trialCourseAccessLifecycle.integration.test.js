import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

import { grant as grantTrial } from "../src/controllers/adminTrials.controller.js";
import { getEntitlement, canAccessCourse } from "../src/services/subscriptionEntitlement.service.js";
import { enroll, getCourseAccessForUser } from "../src/services/enrollment.service.js";
import { User } from "../src/models/User.js";
import { SubscriptionPlan } from "../src/models/SubscriptionPlan.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { TrialGrant } from "../src/models/TrialGrant.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Payment } from "../src/models/Payment.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";

const canRun = Boolean(process.env.MONGO_URI);
const dbName = `buddyforstudy_trial_lifecycle_${process.pid}_${Date.now()}`;

before(async () => {
  if (!canRun) return;
  await mongoose.connect(process.env.MONGO_URI, { dbName });
  await Promise.all([
    User.init(),
    SubscriptionPlan.init(),
    UserSubscription.init(),
    TrialGrant.init(),
    Course.init(),
    Enrollment.init(),
    Payment.init(),
    AuditLog.init(),
    AuditOutbox.init()
  ]);
}, { timeout: 30_000 });

after(async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

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
      return this;
    }
  };
}

async function grantTrialToLearner({ learner, admin, plan, nonce }) {
  const req = {
    body: {
      planId: String(plan._id),
      campaignName: `Lifecycle integration ${nonce.slice(0, 8)}`,
      reason: "Automated trial lifecycle integration test",
      trialDays: 7,
      filters: {
        emailExact: learner.email,
        status: "active",
        role: "user",
        emailVerified: "yes",
        authProvider: "any",
        phoneVerified: "any",
        marketingConsent: "any",
        profileSetup: "any",
        subscriptionStatus: "none",
        priorTrial: "never"
      },
      confirm: true,
      idempotencyKey: `trial-lifecycle-${nonce}`
    },
    user: { user: { _id: admin._id } },
    ip: "127.0.0.1",
    get: () => "BuddyForStudy trial lifecycle integration test"
  };
  const res = responseRecorder();
  let nextError = null;
  await grantTrial(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
}

test("trial grant lifecycle: trial access expires after maintenance and an individual purchase survives", {
  skip: !canRun && "MONGO_URI is not configured; trial lifecycle integration test skipped",
  timeout: 30_000
}, async () => {
  const nonce = crypto.randomUUID();

  const learner = await User.create({
    name: "Trial Lifecycle Learner",
    email: `trial-lifecycle-${nonce}@example.test`,
    role: "user",
    isActive: true,
    emailVerified: true,
    authProvider: "local"
  });
  const admin = await User.create({
    name: "Trial Lifecycle Admin",
    email: `trial-admin-${nonce}@example.test`,
    role: "admin",
    isActive: true,
    emailVerified: true
  });

  await SubscriptionPlan.create({
    name: "Free",
    slug: "free",
    price: 0,
    currency: "INR",
    features: [],
    isActive: true,
    sortOrder: 0
  });
  const trialPlan = await SubscriptionPlan.create({
    name: "Lifecycle Pro Trial",
    slug: `lifecycle-pro-trial-${nonce}`,
    price: 299,
    currency: "INR",
    billingInterval: "monthly",
    features: ["Access published courses"],
    isActive: true,
    sortOrder: 1
  });
  const course = await Course.create({
    title: "Trial Lifecycle Test Course",
    slug: `trial-lifecycle-course-${nonce}`,
    description: "A paid course used only by the isolated lifecycle integration test.",
    category: "Testing",
    level: "Beginner",
    duration: "1 hour",
    isPublished: true,
    status: "published",
    visibility: "public",
    pricing: { mode: "paid", price: 299, currency: "INR" },
    enrollmentEnabled: true
  });

  // Grant using the same admin controller used by the application.
  const grantResponse = await grantTrialToLearner({ learner, admin, plan: trialPlan, nonce });
  assert.equal(grantResponse.body?.success, true);
  assert.equal(grantResponse.body?.granted, 1);
  assert.equal(await Payment.countDocuments({ user: learner._id }), 0, "granting a trial must not initiate or record a payment");

  const grant = await TrialGrant.findOne({ user: learner._id }).lean();
  const subscription = await UserSubscription.findOne({ user: learner._id }).lean();
  assert.equal(grant.status, "trialing");
  assert.equal(subscription.status, "trialing");
  assert.equal(subscription.provider, "manual");
  assert.equal(subscription.providerSubscriptionId, "");

  const activeEntitlement = await getEntitlement(learner._id, "published_courses");
  assert.equal(activeEntitlement.allowed, true);
  assert.equal(activeEntitlement.isTrial, true);

  const trialCard = await getCourseAccessForUser(learner._id, course._id);
  assert.equal(trialCard.access.status, "TRIAL_INCLUDED");
  assert.equal(trialCard.access.source, "trial");

  const trialEnrollment = await enroll(learner._id, course._id);
  assert.equal(trialEnrollment.accessSource, "subscription");
  assert.equal(await canAccessCourse(learner._id, course._id), true);

  // Match the persisted state produced by maintenanceOrchestrator after the
  // grant end time: both documents transition to status "expired".
  const expiredAt = new Date(Date.now() - 1_000);
  await Promise.all([
    UserSubscription.updateOne(
      { user: learner._id, status: "trialing" },
      { $set: { status: "expired", currentPeriodEnd: expiredAt } }
    ),
    TrialGrant.updateOne(
      { user: learner._id, status: "trialing" },
      { $set: { status: "expired", endsAt: expiredAt } }
    )
  ]);

  const expiredGrant = await TrialGrant.findOne({ user: learner._id }).lean();
  const expiredSubscription = await UserSubscription.findOne({ user: learner._id }).lean();
  assert.equal(expiredGrant.status, "expired");
  assert.equal(expiredSubscription.status, "expired");

  const expiredEntitlement = await getEntitlement(learner._id, "published_courses");
  assert.equal(expiredEntitlement.allowed, false);
  assert.equal(expiredEntitlement.trialExpired, true);

  const expiredCard = await getCourseAccessForUser(learner._id, course._id);
  assert.equal(expiredCard.access.status, "ACCESS_EXPIRED");
  assert.equal(expiredCard.enrollment, null);
  assert.equal(await canAccessCourse(learner._id, course._id), false);

  // This row represents a payment already verified by the payment provider.
  // The test writes directly to its isolated MongoDB database; it never calls
  // Razorpay or creates a live order/charge.
  await Payment.create({
    user: learner._id,
    course: course._id,
    amount: 299,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: `pay_test_${nonce}`,
    providerOrderId: `order_test_${nonce}`,
    status: "paid",
    paidAt: new Date()
  });

  const purchasedEnrollment = await enroll(learner._id, course._id);
  assert.equal(purchasedEnrollment.accessSource, "self");
  assert.equal(await canAccessCourse(learner._id, course._id), true);

  const purchasedCard = await getCourseAccessForUser(learner._id, course._id);
  assert.equal(purchasedCard.access.status, "PURCHASED");
  assert.equal(purchasedCard.access.source, "individual");
  assert.equal(purchasedCard.enrollment.accessSource, "self");
  assert.equal((await UserSubscription.findOne({ user: learner._id })).status, "expired");
});

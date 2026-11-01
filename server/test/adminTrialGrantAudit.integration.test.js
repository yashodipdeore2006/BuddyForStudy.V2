import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { grant as grantTrial } from "../src/controllers/adminTrials.controller.js";
import { User } from "../src/models/User.js";
import { SubscriptionPlan } from "../src/models/SubscriptionPlan.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { TrialGrant } from "../src/models/TrialGrant.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";

const canRun = Boolean(process.env.MONGO_URI);

function isolatedMongoUri(value) {
  const uri = new URL(value);
  uri.pathname = "/buddyforstudy_trial_grant_audit_test";
  return uri.toString();
}

async function prepareModels() {
  await Promise.all([
    User.init(),
    SubscriptionPlan.init(),
    UserSubscription.init(),
    TrialGrant.init(),
    AuditLog.init(),
    AuditOutbox.init(),
  ]);
}

before(async () => {
  if (!canRun) return;
  await mongoose.connect(isolatedMongoUri(process.env.MONGO_URI));
  await prepareModels();
}, { timeout: 30_000 });

after(async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createScenario(label) {
  const nonce = crypto.randomUUID();
  const learner = await User.create({
    name: "Trial Grant Learner",
    email: "trial-" + nonce + "@example.test",
    role: "user",
    isActive: true,
    emailVerified: true,
    authProvider: "local",
  });
  const admin = await User.create({
    name: "Trial Grant Admin",
    email: "admin-" + nonce + "@example.test",
    role: "admin",
    isActive: true,
    emailVerified: true,
  });
  const plan = await SubscriptionPlan.create({
    name: "Integration Trial " + label,
    slug: "integration-trial-" + nonce,
    price: 0,
    currency: "INR",
    billingInterval: "monthly",
    isActive: true,
  });

  return {
    learner,
    admin,
    plan,
    campaignName: "Integration " + label + " " + nonce.slice(0, 8),
    idempotencyKey: "trial-grant-" + nonce,
    request() {
      return {
        body: {
          planId: String(plan._id),
          campaignName: this.campaignName,
          reason: "Approved integration test trial grant",
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
            priorTrial: "never",
          },
          confirm: true,
          idempotencyKey: this.idempotencyKey,
        },
        user: { user: { _id: admin._id } },
        ip: "127.0.0.1",
        get: () => "BuddyForStudy trial-grant integration test",
      };
    },
  };
}

async function invokeGrant(scenario) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextError = null;
  await grantTrial(scenario.request(), res, (error) => { nextError = error; });
  return { res, nextError };
}

test("concurrent trial grant requests create one entitlement, one subscription and one audit event", { skip: !canRun, timeout: 30_000 }, async () => {
  const scenario = await createScenario("concurrency");
  const results = await Promise.all([invokeGrant(scenario), invokeGrant(scenario)]);

  assert.ok(results.every(({ nextError, res }) => !nextError && res.body?.success === true));
  assert.equal(results.reduce((sum, item) => sum + Number(item.res.body.granted || 0), 0), 1);

  const grants = await TrialGrant.find({ user: scenario.learner._id }).lean();
  const subscriptions = await UserSubscription.find({ user: scenario.learner._id }).lean();
  assert.equal(grants.length, 1);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].status, "trialing");

  const auditEvents = await AuditLog.find({
    action: "trial.granted",
    targetType: "TrialGrant",
    targetId: String(grants[0]._id),
  }).lean();
  assert.equal(auditEvents.length, 1);

  const replay = await invokeGrant(scenario);
  assert.equal(replay.nextError, null);
  assert.equal(replay.res.body.success, true);
  assert.equal(await TrialGrant.countDocuments({ user: scenario.learner._id }), 1);
  assert.equal(await UserSubscription.countDocuments({ user: scenario.learner._id }), 1);
});

test("a trial grant is compensated when both audit persistence and the retry outbox fail", { skip: !canRun, timeout: 30_000 }, async () => {
  const scenario = await createScenario("audit-failure");
  const originalAuditCreate = AuditLog.create;
  const originalOutboxCreate = AuditOutbox.create;
  AuditLog.create = async () => { throw new Error("simulated audit collection outage"); };
  AuditOutbox.create = async () => { throw new Error("simulated audit outbox outage"); };

  let result;
  try {
    result = await invokeGrant(scenario);
  } finally {
    AuditLog.create = originalAuditCreate;
    AuditOutbox.create = originalOutboxCreate;
  }

  assert.ok(result.nextError);
  assert.match(result.nextError.message, /rolled back because its audit record could not be persisted/i);
  assert.equal(await TrialGrant.countDocuments({ user: scenario.learner._id }), 0);
  assert.equal(await UserSubscription.countDocuments({ user: scenario.learner._id }), 0);
  assert.equal(await AuditOutbox.countDocuments({ "event.action": "trial.granted" }), 0);
});

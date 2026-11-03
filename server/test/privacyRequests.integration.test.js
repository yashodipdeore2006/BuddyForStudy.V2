import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  exportMyData,
  createMyPrivacyRequest,
  listMyPrivacyRequests,
  updateAdminPrivacyRequest,
} from "../src/controllers/privacyRequests.controller.js";
import "../src/models/Course.js";
import "../src/models/SubscriptionPlan.js";
import "../src/models/AIQuestionAnswer.js";
import { User } from "../src/models/User.js";
import { Progress } from "../src/models/Progress.js";
import { Payment } from "../src/models/Payment.js";
import { Notification } from "../src/models/Notification.js";
import { DataPrivacyRequest } from "../src/models/DataPrivacyRequest.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";

const canRun = Boolean(process.env.MONGO_URI);

function isolatedMongoUri(value) {
  const uri = new URL(value);
  uri.pathname = "/buddyforstudy_privacy_requests_test";
  return uri.toString();
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(values) { Object.assign(this.headers, values); return this; },
    json(body) { this.body = body; return this; },
  };
}

async function createUser(label) {
  const nonce = crypto.randomUUID();
  return User.create({
    name: "Privacy " + label,
    email: "privacy-" + label + "-" + nonce + "@example.test",
    role: "user",
    isActive: true,
    emailVerified: true,
    authProvider: "local",
    password: "must-not-export-" + nonce,
    authTokenVersion: 7,
    phoneNumber: "+911234567890",
    city: "Pune",
    learningGoal: "Learn backend development",
  });
}

before(async () => {
  if (!canRun) return;
  await mongoose.connect(isolatedMongoUri(process.env.MONGO_URI));
  await Promise.all([
    User.init(), Progress.init(), Payment.init(), Notification.init(),
    DataPrivacyRequest.init(), AuditLog.init(), AuditOutbox.init(),
  ]);
}, { timeout: 30_000 });

after(async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("account export is scoped to the authenticated user and excludes credentials and provider internals", {
  skip: !canRun,
  timeout: 30_000,
}, async () => {
  const owner = await createUser("owner");
  const other = await createUser("other");
  const ownerPayment = await Payment.create({
    user: owner._id,
    amount: 499,
    currency: "INR",
    status: "paid",
    provider: "razorpay",
    providerPaymentId: "private-provider-payment-reference",
    providerOrderId: "private-provider-order-reference",
  });
  await Payment.create({ user: other._id, amount: 999, currency: "INR", status: "paid" });
  await Progress.create({
    user: owner._id,
    course: new mongoose.Types.ObjectId(),
    completedLessons: [],
    completedCount: 0,
    totalLessons: 4,
    percentage: 0,
  });
  await Progress.create({
    user: other._id,
    course: new mongoose.Types.ObjectId(),
    completedLessons: [],
    completedCount: 0,
    totalLessons: 9,
    percentage: 0,
  });
  await Notification.create({
    user: owner._id,
    title: "Your learning update",
    message: "Your course progress changed.",
    type: "learning",
  });

  const res = response();
  await exportMyData({ user: { userId: String(owner._id) } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Disposition"], /attachment; filename="buddyforstudy-account-export-/);
  assert.match(res.headers["Cache-Control"], /no-store/);
  assert.equal(res.body.format, "buddyforstudy.account-export.v1");
  assert.equal(res.body.account.id, String(owner._id));
  assert.equal(res.body.data.courseProgress.length, 1);
  assert.equal(res.body.data.payments.length, 1);
  assert.equal(res.body.data.payments[0]._id.toString(), String(ownerPayment._id));
  assert.equal(res.body.data.notifications.length, 1);
  assert.equal("password" in res.body.account.profile, false);
  assert.equal("authTokenVersion" in res.body.account.profile, false);
  assert.equal("providerPaymentId" in res.body.data.payments[0], false);
  assert.equal("providerOrderId" in res.body.data.payments[0], false);
  assert.equal(res.body.exportCoverage, "partial_repository_inventory");
  assert.ok(res.body.knownLimitations.some((item) => item.includes("local storage")));
});

test("learner privacy requests are owner-scoped, idempotent and auditable", {
  skip: !canRun,
  timeout: 30_000,
}, async () => {
  const owner = await createUser("requester");
  const other = await createUser("other-requester");
  const request = {
    user: { userId: String(owner._id) },
    body: {
      type: "deletion",
      description: "Please review and process my account deletion request.",
      dataCategories: ["profile", "learning", "payments"],
    },
    ip: "127.0.0.1",
    get: () => "Privacy integration test",
  };

  const first = response();
  await createMyPrivacyRequest(request, first, (error) => { throw error; });
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.request.status, "identity_pending");
  assert.equal(first.body.executionAvailable, false);

  const replay = response();
  await createMyPrivacyRequest(request, replay, (error) => { throw error; });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.request.requestId, first.body.request.requestId);
  assert.equal(await DataPrivacyRequest.countDocuments({ user: owner._id }), 1);

  const otherResponse = response();
  await listMyPrivacyRequests({ user: { userId: String(other._id) } }, otherResponse, (error) => { throw error; });
  assert.equal(otherResponse.body.requests.length, 0);

  const ownerResponse = response();
  await listMyPrivacyRequests({ user: { userId: String(owner._id) } }, ownerResponse, (error) => { throw error; });
  assert.equal(ownerResponse.body.requests.length, 1);
  assert.equal(ownerResponse.body.requests[0].requestId, first.body.request.requestId);

  const audit = await AuditLog.findOne({ action: "privacy.requested", targetId: first.body.request.requestId }).lean();
  assert.ok(audit);
});

test("privacy review requires identity verification before approval and persists audited state changes", {
  skip: !canRun,
  timeout: 30_000,
}, async () => {
  const owner = await createUser("reviewer-target");
  const admin = await createUser("reviewer-admin");
  const created = await DataPrivacyRequest.create({
    user: owner._id,
    type: "correction",
    description: "Please correct the city value on my profile.",
    dataCategories: ["profile"],
    status: "identity_pending",
    activeRequestKey: String(owner._id) + ":correction",
  });

  const deniedApproval = response();
  await updateAdminPrivacyRequest({
    user: { userId: String(admin._id) },
    params: { requestId: created.requestId },
    body: { status: "in_review", reviewerNote: "Move to review without identity verification." },
    ip: "127.0.0.1",
    get: () => "Privacy integration test",
  }, deniedApproval, (error) => { throw error; });
  assert.equal(deniedApproval.statusCode, 400);
  assert.equal((await DataPrivacyRequest.findById(created._id)).status, "identity_pending");

  const verified = response();
  await updateAdminPrivacyRequest({
    user: { userId: String(admin._id) },
    params: { requestId: created.requestId },
    body: {
      status: "in_review",
      identityVerified: true,
      reviewerNote: "Identity was verified using the approved account-control procedure.",
    },
    ip: "127.0.0.1",
    get: () => "Privacy integration test",
  }, verified, (error) => { throw error; });

  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body.request.status, "in_review");
  const persisted = await DataPrivacyRequest.findById(created._id).lean();
  assert.ok(persisted.identityVerifiedAt);
  assert.equal(String(persisted.identityVerifiedBy), String(admin._id));
  assert.ok(await AuditLog.findOne({ action: "privacy.request_status_changed", targetId: created.requestId }));
});

test("privacy request validation rejects extra user IDs and underspecified deletion requests", {
  skip: !canRun,
  timeout: 30_000,
}, async () => {
  const owner = await createUser("validation");
  for (const body of [
    { type: "deletion", description: "Please delete my account.", userId: "attacker-selected-id" },
    { type: "deletion", description: "Delete me" },
  ]) {
    const res = response();
    await createMyPrivacyRequest({
      user: { userId: String(owner._id) },
      body,
      ip: "127.0.0.1",
      get: () => "Privacy integration test",
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);
  }
});

test("denying a privacy request releases its active slot so the learner can submit a new one", {
  skip: !canRun,
  timeout: 30_000,
}, async () => {
  const owner = await createUser("denied-retry");
  const admin = await createUser("denied-reviewer");
  const requestBody = {
    type: "deletion",
    description: "Please review my account deletion request.",
    dataCategories: ["profile", "learning"],
  };
  const first = response();
  await createMyPrivacyRequest({
    user: { userId: String(owner._id) }, body: requestBody, ip: "127.0.0.1",
    get: () => "Privacy integration test",
  }, first, (error) => { throw error; });
  assert.equal(first.statusCode, 201);

  const denied = response();
  await updateAdminPrivacyRequest({
    user: { userId: String(admin._id) },
    params: { requestId: first.body.request.requestId },
    body: { status: "denied", reviewerNote: "Please provide additional proof of account ownership." },
    ip: "127.0.0.1",
    get: () => "Privacy integration test",
  }, denied, (error) => { throw error; });
  assert.equal(denied.statusCode, 200);
  assert.equal(denied.body.request.status, "denied");

  const closed = await DataPrivacyRequest.findOne({ requestId: first.body.request.requestId }).lean();
  assert.equal(closed.activeRequestKey, undefined);

  const second = response();
  await createMyPrivacyRequest({
    user: { userId: String(owner._id) }, body: requestBody, ip: "127.0.0.1",
    get: () => "Privacy integration test",
  }, second, (error) => { throw error; });
  assert.equal(second.statusCode, 201);
  assert.notEqual(second.body.request.requestId, first.body.request.requestId);
  assert.equal(await DataPrivacyRequest.countDocuments({ user: owner._id, type: "deletion" }), 2);
});


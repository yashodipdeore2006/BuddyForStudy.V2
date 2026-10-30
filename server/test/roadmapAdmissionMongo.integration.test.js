import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { roadmapAdmissionLeaseSchema } from "../src/models/RoadmapAdmissionLease.js";
import { roadmapAdmissionRateWindowSchema } from "../src/models/RoadmapAdmissionRateWindow.js";
import { RoadmapDraft } from "../src/models/RoadmapDraft.js";
import {
  consumeRoadmapRequestAllowance,
  reserveRoadmapAdmission,
  renewRoadmapAdmission,
  releaseRoadmapAdmission,
  recoverExpiredRoadmapAdmissions
} from "../src/services/roadmapAdmission.service.js";

const enabled = Boolean(process.env.MONGO_URI);

test("MongoDB enforces atomic roadmap global/user slots, rate windows, renewal and recovery", {
  skip: !enabled && "MONGO_URI is not configured; MongoDB admission integration test skipped"
}, async (t) => {
  const connection = mongoose.createConnection(process.env.MONGO_URI, {
    dbName: `roadmap_admission_it_${process.pid}_${Date.now()}`
  });
  await connection.asPromise();

  const LeaseModel = connection.model("RoadmapAdmissionLease", roadmapAdmissionLeaseSchema);
  const RateWindowModel = connection.model("RoadmapAdmissionRateWindow", roadmapAdmissionRateWindowSchema);
  const DraftModel = connection.model("RoadmapDraft", RoadmapDraft.schema);
  await Promise.all([LeaseModel.init(), RateWindowModel.init(), DraftModel.init()]);

  t.after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  const userId = new mongoose.Types.ObjectId();
  const sameUserAttempts = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) => reserveRoadmapAdmission({
      userId,
      draftId: `same-user-${index}`,
      maxGlobal: 8,
      maxPerUser: 2,
      LeaseModel
    }))
  );
  const sameUserGranted = sameUserAttempts.filter((result) => result.status === "fulfilled");
  assert.equal(sameUserGranted.length, 2, "unique user slots must cap concurrent admissions at two");
  assert.equal(await LeaseModel.countDocuments({ userId }), 2);
  assert.equal(
    sameUserAttempts.filter((result) => result.status === "rejected" && result.reason?.code === "ROADMAP_USER_QUEUE_LIMIT").length,
    10
  );

  await releaseRoadmapAdmission({ ...sameUserGranted[0].value, LeaseModel });
  const afterRelease = await reserveRoadmapAdmission({
    userId, draftId: "same-user-after-release", maxGlobal: 8, maxPerUser: 2, LeaseModel
  });
  assert.ok(afterRelease.leaseToken);

  await LeaseModel.deleteMany({});
  const globalAttempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, index) => reserveRoadmapAdmission({
      userId: new mongoose.Types.ObjectId(),
      draftId: `global-${index}`,
      maxGlobal: 3,
      maxPerUser: 2,
      LeaseModel
    }))
  );
  assert.equal(globalAttempts.filter((result) => result.status === "fulfilled").length, 3,
    "unique global slots must cap concurrent admissions across users");
  assert.equal(await LeaseModel.countDocuments({}), 3);
  assert.equal(
    globalAttempts.filter((result) => result.status === "rejected" && result.reason?.code === "ROADMAP_QUEUE_FULL").length,
    7
  );

  const rateUser = new mongoose.Types.ObjectId();
  const rateAttempts = await Promise.allSettled(
    Array.from({ length: 12 }, () => consumeRoadmapRequestAllowance({
      userId: rateUser, maxRequests: 5, RateWindowModel
    }))
  );
  assert.equal(rateAttempts.filter((result) => result.status === "fulfilled").length, 5,
    "atomic rate-window increments must admit exactly the configured request count");
  assert.equal(await RateWindowModel.countDocuments({ userId: rateUser }), 1);
  assert.equal((await RateWindowModel.findOne({ userId: rateUser })).count, 12);

  const lease = globalAttempts.find((result) => result.status === "fulfilled").value;
  const renewalAt = new Date(lease.expiresAt.getTime() - 30_000);
  assert.equal(await renewRoadmapAdmission({
    draftId: lease.draftId, leaseToken: lease.leaseToken, now: renewalAt, LeaseModel
  }), true);
  assert.equal(await renewRoadmapAdmission({
    draftId: lease.draftId, leaseToken: lease.leaseToken,
    now: new Date(lease.expiresAt.getTime() + 1), LeaseModel
  }), false);

  const expiredAt = new Date(Date.now() - 10_000);
  const expiredUser = new mongoose.Types.ObjectId();
  const expiredDraftId = "expired-roadmap-draft";
  const expiredToken = "expired-lease-token";
  await DraftModel.create({
    draftId: expiredDraftId,
    userId: expiredUser,
    query: "MongoDB",
    profile: { topic: "MongoDB" },
    status: "building",
    admissionLeaseToken: expiredToken
  });
  await LeaseModel.create({
    draftId: expiredDraftId,
    userId: expiredUser,
    globalSlot: 9,
    userSlot: 0,
    leaseToken: expiredToken,
    heartbeatAt: expiredAt,
    expiresAt: expiredAt
  });
  const recovered = await recoverExpiredRoadmapAdmissions({
    now: new Date(),
    LeaseModel,
    DraftModel,
    CourseModel: { updateOne: async () => ({ modifiedCount: 0 }) }
  });
  assert.equal(recovered, 1);
  const failedDraft = await DraftModel.findOne({ draftId: expiredDraftId });
  assert.equal(failedDraft.status, "failed");
  assert.equal(failedDraft.errorCode, "ROADMAP_ADMISSION_LEASE_EXPIRED");
  assert.equal(await LeaseModel.countDocuments({ draftId: expiredDraftId }), 0);
});

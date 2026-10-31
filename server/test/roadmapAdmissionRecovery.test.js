import test from "node:test";
import assert from "node:assert/strict";
import { recoverExpiredRoadmapAdmissions } from "../src/services/roadmapAdmission.service.js";

test("expired async roadmap lease preserves records and archives only a partial course", async () => {
  const now = new Date("2026-10-31T10:00:00.000Z");
  const lease = {
    _id: "lease-1",
    draftId: "draft-1",
    userId: "user-1",
    leaseToken: "lease-token-1"
  };
  const draft = {
    draftId: lease.draftId,
    userId: lease.userId,
    roadmapId: "course-1",
    status: "building",
    admissionLeaseToken: lease.leaseToken
  };
  const calls = [];
  const LeaseModel = {
    findOne(filter) {
      assert.deepEqual(filter, { expiresAt: { $lte: now } });
      return { sort: async () => lease };
    },
    async deleteOne(filter) {
      calls.push(["lease.deleteOne", filter]);
      return { deletedCount: 1 };
    }
  };
  const DraftModel = {
    findOne(filter) {
      assert.deepEqual(filter, {
        draftId: lease.draftId,
        admissionLeaseToken: lease.leaseToken,
        status: { $in: ["queued", "building"] }
      });
      return { lean: async () => draft };
    },
    async updateOne(filter, update) {
      calls.push(["draft.updateOne", filter, update]);
      return { modifiedCount: 1 };
    }
  };
  const CourseModel = {
    async updateOne(filter, update) {
      calls.push(["course.updateOne", filter, update]);
      return { modifiedCount: 1 };
    }
  };

  const recovered = await recoverExpiredRoadmapAdmissions({
    now,
    LeaseModel,
    DraftModel,
    CourseModel
  });

  assert.equal(recovered, 1);
  assert.deepEqual(calls.map(([name]) => name), [
    "course.updateOne",
    "draft.updateOne",
    "lease.deleteOne"
  ]);
  assert.deepEqual(calls[0][1], { _id: "course-1", createdForUser: "user-1" });
  assert.deepEqual(calls[0][2], {
    $set: { status: "archived", isPublished: false, visibility: "private" }
  });
  assert.equal(calls[1][2].$set.status, "failed");
  assert.equal(calls[1][2].$set.errorCode, "ROADMAP_ADMISSION_LEASE_EXPIRED");
  assert.equal(calls[1][2].$set.roadmapId, null);
  assert.equal(calls[1][2].$set.result, null);
  assert.equal(calls[1][2].$push.events.state, "failed");
  assert.deepEqual(calls[2][1], { _id: "lease-1", expiresAt: { $lte: now } });
});

test("expired lease recovery leaves completed drafts and courses untouched", async () => {
  const now = new Date("2026-10-31T10:00:00.000Z");
  let draftUpdates = 0;
  let courseUpdates = 0;
  let leaseDeleted = 0;
  const LeaseModel = {
    findOne: () => ({ sort: async () => ({
      _id: "lease-ready",
      draftId: "draft-ready",
      userId: "user-1",
      leaseToken: "token-ready"
    }) }),
    deleteOne: async () => { leaseDeleted += 1; return { deletedCount: 1 }; }
  };
  const DraftModel = {
    findOne: () => ({ lean: async () => null }),
    updateOne: async () => { draftUpdates += 1; return { modifiedCount: 0 }; }
  };
  const CourseModel = {
    updateOne: async () => { courseUpdates += 1; return { modifiedCount: 0 }; }
  };

  assert.equal(await recoverExpiredRoadmapAdmissions({
    now, LeaseModel, DraftModel, CourseModel
  }), 1);
  assert.equal(draftUpdates, 1);
  assert.equal(courseUpdates, 0);
  assert.equal(leaseDeleted, 1);
});

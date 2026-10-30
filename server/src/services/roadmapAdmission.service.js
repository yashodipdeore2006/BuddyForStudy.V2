import { randomUUID } from "node:crypto";
import { RoadmapAdmissionLease } from "../models/RoadmapAdmissionLease.js";
import { RoadmapAdmissionRateWindow } from "../models/RoadmapAdmissionRateWindow.js";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { Course } from "../models/Course.js";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const LEASE_DURATION_MS = 2 * 60 * 1000;

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function capacityError(code) {
  const errors = {
    ROADMAP_USER_QUEUE_LIMIT: ["You already have the maximum number of active roadmap builds.", 429],
    ROADMAP_QUEUE_FULL: ["Roadmap build capacity is temporarily full. Please retry shortly.", 503]
  };
  const [message, status] = errors[code];
  return Object.assign(new Error(message), { code, status });
}

export async function consumeRoadmapRequestAllowance({
  userId,
  now = new Date(),
  maxRequests = 5,
  RateWindowModel = RoadmapAdmissionRateWindow
}) {
  const windowStart = new Date(Math.floor(now.getTime() / RATE_WINDOW_MS) * RATE_WINDOW_MS);
  const expiresAt = new Date(windowStart.getTime() + RATE_WINDOW_MS + 60_000);
  const filter = { userId, windowStart };
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } };
  let bucket;
  try {
    bucket = await RateWindowModel.findOneAndUpdate(filter, update, {
      upsert: true, new: true, setDefaultsOnInsert: true
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    bucket = await RateWindowModel.findOneAndUpdate(filter, { $inc: { count: 1 } }, { new: true });
    if (!bucket) throw error;
  }
  if (bucket.count > maxRequests) {
    throw Object.assign(
      new Error("Too many roadmap build requests. Please wait before starting another build."),
      { code: "ROADMAP_USER_RATE_LIMIT", status: 429 }
    );
  }
  return bucket.count;
}

export async function recoverExpiredRoadmapAdmissions({
  now = new Date(),
  LeaseModel = RoadmapAdmissionLease,
  DraftModel = RoadmapDraft,
  CourseModel = Course
} = {}) {
  let recovered = 0;
  while (true) {
    // Mark the draft terminal before deleting its expired lease. If the process
    // crashes between these writes, the next recovery pass can safely finish
    // deleting the same expired lease without reviving the draft.
    const lease = await LeaseModel.findOne({ expiresAt: { $lte: now } }).sort({ expiresAt: 1 });
    if (!lease) break;
    const draft = await DraftModel.findOneAndUpdate(
      { draftId: lease.draftId, admissionLeaseToken: lease.leaseToken, status: { $in: ["queued", "building"] } },
      {
        $set: {
          status: "failed",
          errorCode: "ROADMAP_ADMISSION_LEASE_EXPIRED",
          roadmapId: null,
          result: null,
          updatedAt: now
        },
        $push: {
          events: {
            type: "error",
            state: "failed",
            message: "Roadmap build stopped unexpectedly. Please retry.",
            at: now.toISOString()
          }
        }
      },
      { new: false }
    );
    if (draft?.roadmapId) {
      await CourseModel.updateOne(
        { _id: draft.roadmapId, createdForUser: draft.userId },
        { $set: { status: "archived", isPublished: false, visibility: "private" } }
      ).catch(() => {});
    }
    await LeaseModel.deleteOne({ _id: lease._id, expiresAt: { $lte: now } });
    recovered += 1;
  }
  return recovered;
}

export async function reserveRoadmapAdmission({
  userId,
  draftId,
  maxGlobal,
  maxPerUser = 2,
  now = new Date(),
  LeaseModel = RoadmapAdmissionLease
}) {
  await recoverExpiredRoadmapAdmissions({ now, LeaseModel });
  const leaseToken = randomUUID();
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  for (let globalSlot = 0; globalSlot < maxGlobal; globalSlot += 1) {
    for (let userSlot = 0; userSlot < maxPerUser; userSlot += 1) {
      try {
        await LeaseModel.create({
          draftId, userId, globalSlot, userSlot, leaseToken,
          heartbeatAt: now, expiresAt
        });
        return { draftId, leaseToken, expiresAt, globalSlot, userSlot };
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
  }

  const userActive = await LeaseModel.countDocuments({ userId, expiresAt: { $gt: now } });
  if (userActive >= maxPerUser) throw capacityError("ROADMAP_USER_QUEUE_LIMIT");
  throw capacityError("ROADMAP_QUEUE_FULL");
}

export async function renewRoadmapAdmission({
  draftId,
  leaseToken,
  now = new Date(),
  LeaseModel = RoadmapAdmissionLease
}) {
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const result = await LeaseModel.updateOne(
    { draftId, leaseToken, expiresAt: { $gt: now } },
    { $set: { heartbeatAt: now, expiresAt } }
  );
  return result.matchedCount === 1;
}

export async function releaseRoadmapAdmission({
  draftId,
  leaseToken,
  LeaseModel = RoadmapAdmissionLease
}) {
  const result = await LeaseModel.deleteOne({ draftId, leaseToken });
  return result.deletedCount === 1;
}

export async function releaseQueuedRoadmapAdmission({
  draftId,
  userId,
  LeaseModel = RoadmapAdmissionLease
}) {
  const result = await LeaseModel.deleteOne({ draftId, userId });
  return result.deletedCount === 1;
}

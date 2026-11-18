import crypto from "node:crypto";
import { JobLease } from "../models/JobLease.js";

export const DEFAULT_JOB_LEASE_DURATION_MS = 2 * 60 * 1000;
export const DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS = 30 * 1000;
export const MAX_JOB_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;

export const JOB_LEASE_KEYS = Object.freeze({
  BACKGROUND_MAINTENANCE: "background-maintenance",
  ANNOUNCEMENT_DISPATCH: "announcement-dispatch",
  YOUTUBE_CURATION: "youtube-curation"
});

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new RangeError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalized;
}

function normalizeNow(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date.");
  }
  return now;
}

function normalizeLeaseDuration(leaseDurationMs) {
  const duration = Number(leaseDurationMs);
  if (!Number.isSafeInteger(duration) || duration < 1000 || duration > MAX_JOB_LEASE_DURATION_MS) {
    throw new RangeError(
      `leaseDurationMs must be an integer between 1000 and ${MAX_JOB_LEASE_DURATION_MS}.`
    );
  }
  return duration;
}

function normalizeIdentity({ jobKey, ownerId, leaseToken }) {
  return {
    jobKey: requireText(jobKey, "jobKey", 120),
    ownerId: requireText(ownerId, "ownerId", 128),
    leaseToken: requireText(leaseToken, "leaseToken", 128)
  };
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.code === "11000";
}

/**
 * Atomically acquires a lease if it does not exist or its previous owner has
 * expired. A duplicate-key race means another process won the first insert.
 *
 * Returns the acquired lease, or null when another live owner holds it.
 */
export async function acquireJobLease({
  jobKey,
  ownerId,
  leaseDurationMs = DEFAULT_JOB_LEASE_DURATION_MS,
  now = new Date()
}) {
  const normalizedJobKey = requireText(jobKey, "jobKey", 120);
  const normalizedOwnerId = requireText(ownerId, "ownerId", 128);
  const currentTime = normalizeNow(now);
  const duration = normalizeLeaseDuration(leaseDurationMs);
  const leaseToken = crypto.randomUUID();

  try {
    return await JobLease.findOneAndUpdate(
      {
        jobKey: normalizedJobKey,
        $or: [
          { leaseUntil: { $lte: currentTime } },
          { leaseUntil: null }
        ]
      },
      {
        $set: {
          ownerId: normalizedOwnerId,
          leaseToken,
          leaseUntil: new Date(currentTime.getTime() + duration),
          acquiredAt: currentTime,
          renewedAt: currentTime
        },
        // $inc initializes a new document at 1 and advances the generation
        // on every later acquisition of this same job key.
        $inc: { fencingToken: 1 }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: false
      }
    );
  } catch (error) {
    // Concurrent upserts can race on the unique jobKey index. Only that
    // expected duplicate-key outcome is contention; all other errors surface.
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

/**
 * Renews only a still-live lease owned by the exact owner/token pair.
 * An expired owner cannot resurrect its lease after another process may claim it.
 */
export async function renewJobLease({
  jobKey,
  ownerId,
  leaseToken,
  leaseDurationMs = DEFAULT_JOB_LEASE_DURATION_MS,
  now = new Date()
}) {
  const identity = normalizeIdentity({ jobKey, ownerId, leaseToken });
  const currentTime = normalizeNow(now);
  const duration = normalizeLeaseDuration(leaseDurationMs);

  return JobLease.findOneAndUpdate(
    {
      ...identity,
      leaseUntil: { $gt: currentTime }
    },
    {
      $set: {
        leaseUntil: new Date(currentTime.getTime() + duration),
        renewedAt: currentTime
      }
    },
    {
      new: true,
      runValidators: true
    }
  );
}

/**
 * Expires a lease only when the supplied owner and token still match.
 * A stale process cannot release a successor's lease.
 */
export async function releaseJobLease({ jobKey, ownerId, leaseToken, now = new Date() }) {
  const identity = normalizeIdentity({ jobKey, ownerId, leaseToken });
  const currentTime = normalizeNow(now);

  const released = await JobLease.findOneAndUpdate(
    identity,
    {
      $set: {
        leaseUntil: currentTime,
        renewedAt: currentTime
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  return Boolean(released);
}

/**
 * Checks current ownership. Call before claiming another batch or performing
 * a side effect that is safe to guard at this boundary.
 */
export async function isJobLeaseOwned({ jobKey, ownerId, leaseToken, now = new Date() }) {
  const identity = normalizeIdentity({ jobKey, ownerId, leaseToken });
  const currentTime = normalizeNow(now);

  const lease = await JobLease.exists({
    ...identity,
    leaseUntil: { $gt: currentTime }
  });

  return Boolean(lease);
}

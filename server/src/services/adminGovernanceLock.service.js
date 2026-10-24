import crypto from "node:crypto";
import { PlatformSetting } from "../models/PlatformSetting.js";

const LOCK_KEY = "internal_admin_role_change_lock";
const LOCK_LEASE_MS = 2 * 60 * 1000;

/**
 * Acquire a database-backed lease to serialize administrator role changes.
 * A unique key plus atomic findOneAndUpdate prevents multiple app instances
 * from concurrently passing the last-Super-Admin count check.
 */
export async function acquireAdminGovernanceLock() {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_LEASE_MS);

  try {
    const lock = await PlatformSetting.findOneAndUpdate(
      {
        key: LOCK_KEY,
        $or: [
          { "value.expiresAt": { $exists: false } },
          { "value.expiresAt": null },
          { "value.expiresAt": { $lte: now } }
        ]
      },
      {
        $set: {
          value: { token, expiresAt },
          description: "Internal lock for serialized administrator role changes",
          isPublic: false
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return lock?.value?.token === token ? token : null;
  } catch (error) {
    // When another process owns the active lock, an upsert can race against
    // the unique setting key. That means contention, not an application error.
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function releaseAdminGovernanceLock(token) {
  if (typeof token !== "string" || !token) return;
  await PlatformSetting.updateOne(
    { key: LOCK_KEY, "value.token": token },
    { $set: { value: null } }
  );
}

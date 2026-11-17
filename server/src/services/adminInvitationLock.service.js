import crypto from "node:crypto";
import { PlatformSetting } from "../models/PlatformSetting.js";

const LOCK_PREFIX = "internal_admin_invitation_lock_";
const LOCK_LEASE_MS = 5 * 60 * 1000;

function lockKey(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return LOCK_PREFIX + crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Obtain a database-backed per-email lease so concurrent invite replacements
 * cannot invalidate each other's single-use links across API instances.
 */
export async function acquireAdminInvitationLock(email) {
  const key = lockKey(email);
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_LEASE_MS);

  try {
    const lock = await PlatformSetting.findOneAndUpdate(
      {
        key,
        $or: [
          { "value.expiresAt": { $exists: false } },
          { "value.expiresAt": null },
          { "value.expiresAt": { $lte: now } }
        ]
      },
      {
        $set: {
          value: { token, expiresAt },
          description: "Internal lease for serialized administrator invitation replacement",
          isPublic: false
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return lock?.value?.token === token ? token : null;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function releaseAdminInvitationLock(email, token) {
  if (typeof token !== "string" || !token) return;
  await PlatformSetting.updateOne(
    { key: lockKey(email), "value.token": token },
    { $set: { value: null } }
  );
}

import crypto from "node:crypto";
import { PlatformSetting } from "../models/PlatformSetting.js";

const LOCK_LEASE_MS = 2 * 60 * 1000;
const LOCK_PREFIX = "internal_checkout_lock:";

export function checkoutLockKey(kind, userId, resourceId = "") {
  const safeKind = String(kind || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  const safeUser = String(userId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 64);
  const safeResource = String(resourceId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 64);
  if (!safeKind || !safeUser) throw new Error("A checkout lock requires a kind and user ID");
  return LOCK_PREFIX + safeKind + ":" + safeUser + (safeResource ? ":" + safeResource : "");
}

export async function acquireCheckoutLock(key) {
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
          description: "Internal lease for checkout serialization",
          isPublic: false
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return lock?.value?.token === token ? token : null;
  } catch (error) {
    // A competing upsert against the unique key means another process owns
    // the lease, not that the checkout request itself is malformed.
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function releaseCheckoutLock(key, token) {
  if (typeof key !== "string" || !key || typeof token !== "string" || !token) return;
  await PlatformSetting.updateOne({ key, "value.token": token }, { $set: { value: null } });
}

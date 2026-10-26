import { randomUUID } from "node:crypto";
import { CheckoutLock } from "../models/CheckoutLock.js";

const LOCK_LEASE_MS = 2 * 60 * 1000;

export function checkoutLockKey(kind, userId, resourceId = "") {
  return [String(kind || "").trim(), String(userId || "").trim(), String(resourceId || "").trim()].join(":");
}

export async function acquireCheckoutLock(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) throw new TypeError("Checkout lock key is required");
  const now = new Date();
  const token = randomUUID();
  try {
    const lock = await CheckoutLock.findOneAndUpdate(
      { key: normalizedKey, expiresAt: { $lte: now } },
      { $set: { token, expiresAt: new Date(now.getTime() + LOCK_LEASE_MS) } },
      { new: true }
    );
    if (lock) return token;
    await CheckoutLock.create({
      key: normalizedKey,
      token,
      expiresAt: new Date(now.getTime() + LOCK_LEASE_MS)
    });
    return token;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function releaseCheckoutLock(key, token) {
  if (!key || !token) return;
  await CheckoutLock.deleteOne({ key: String(key), token: String(token) });
}

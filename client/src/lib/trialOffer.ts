export const TRIAL_OFFER_DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = "bfs-trial-offer-dismissed-v1";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function trialOfferDismissalStorageKey(userId: string, campaignId: string): string {
  return STORAGE_KEY_PREFIX + ":" + encodeURIComponent(userId.trim()) + ":" + encodeURIComponent(campaignId.trim());
}
function resolveStorage(storage?: StoragePort | null): StoragePort | null {
  if (storage) return storage;
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
}
export function getTrialOfferDismissalRemainingMs(userId: string, campaignId: string, now = Date.now(), storage?: StoragePort | null): number {
  if (!userId.trim() || !campaignId.trim()) return 0;
  const target = resolveStorage(storage);
  if (!target) return 0;
  const key = trialOfferDismissalStorageKey(userId, campaignId);
  try {
    const stored = target.getItem(key);
    if (!stored) return 0;
    const expiresAt = Number(stored);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      target.removeItem(key);
      return 0;
    }
    return expiresAt - now;
  } catch { return 0; }
}
export function isTrialOfferDismissed(userId: string, campaignId: string, now = Date.now(), storage?: StoragePort | null): boolean {
  return getTrialOfferDismissalRemainingMs(userId, campaignId, now, storage) > 0;
}
export function rememberTrialOfferDismissal(userId: string, campaignId: string, now = Date.now(), storage?: StoragePort | null): void {
  if (!userId.trim() || !campaignId.trim()) return;
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.setItem(trialOfferDismissalStorageKey(userId, campaignId), String(now + TRIAL_OFFER_DISMISSAL_COOLDOWN_MS));
  } catch {
    // Storage only suppresses repeated UI prompts; it never grants or denies entitlement.
  }
}
export function createTrialClaimIdempotencyKey(): string {
  try {
    const value = globalThis.crypto?.randomUUID?.();
    if (value) return value;
  } catch {
    // Use a random opaque key when Web Crypto is unavailable.
  }
  return "trial-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}

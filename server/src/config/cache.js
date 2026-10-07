import { createClient, commandOptions } from "redis";

const CACHE_TIMEOUT_MS = 250;

let client = null;
let connecting = null;

function getClient() {
  if (!process.env.REDIS_URL) return null;

  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: CACHE_TIMEOUT_MS,
        reconnectStrategy: false,
      },
      disableOfflineQueue: true,
    }).on("error", () => {});
  }

  if (!connecting && !client.isOpen) {
    connecting = client.connect().catch(() => {
      connecting = null;
      return false;
    });
  }

  return client;
}

async function withTimeout(promise, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), CACHE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function cacheGet(key) {
  const c = getClient();
  if (!c || !c.isReady) return null;

  try {
    return await withTimeout(
      c.get(commandOptions({ signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) }), key)
        .then((value) => (value ? JSON.parse(value) : null)),
      null
    );
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  const c = getClient();
  if (!c || !c.isReady) return false;

  try {
    await withTimeout(
      c.set(key, JSON.stringify(value), { EX: ttlSeconds }),
      false
    );
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelete(key) {
  const c = getClient();
  if (!c || !c.isReady) return false;

  try {
    await withTimeout(c.del(key), false);
    return true;
  } catch {
    return false;
  }
}

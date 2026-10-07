import { createClient } from "redis";

const CACHE_TIMEOUT_MS = 750;

let client = null;
let connecting = null;

function getClient() {
  if (!process.env.REDIS_URL) return null;

  if (!client) {
    client = createClient({ url: process.env.REDIS_URL }).on("error", () => {});
  }

  if (!connecting) {
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
  try {
    const c = getClient();
    if (!c || !connecting) return null;

    const connected = await withTimeout(connecting, false);
    if (connected === false && !c.isReady) return null;

    return await withTimeout(
      c.get(key).then((value) => (value ? JSON.parse(value) : null)),
      null
    );
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    const c = getClient();
    if (!c || !connecting) return false;

    const connected = await withTimeout(connecting, false);
    if (connected === false && !c.isReady) return false;

    return await withTimeout(
      c.set(key, JSON.stringify(value), { EX: ttlSeconds }).then(() => true),
      false
    );
  } catch {
    return false;
  }
}

export async function cacheDelete(key) {
  try {
    const c = getClient();
    if (!c || !connecting) return false;

    const connected = await withTimeout(connecting, false);
    if (connected === false && !c.isReady) return false;

    return await withTimeout(c.del(key).then(() => true), false);
  } catch {
    return false;
  }
}

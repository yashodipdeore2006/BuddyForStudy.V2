import { createClient } from "redis";

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
      commandOptions: { timeout: CACHE_TIMEOUT_MS },
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
      c.get(key)
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

/** Return null when Redis is not configured or unavailable. */
export async function cacheIncrementWithExpiry(key, amount, ttlSeconds) {
  const client = getClient();
  if (!client || !client.isReady) return null;
  try {
    return await withTimeout((async () => {
      const script = "local v = redis.call('INCRBY', KEYS[1], ARGV[1]); if v == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], ARGV[2]); end; return v";
      return Number(await client.eval(script, { keys: [key], arguments: [String(amount), String(ttlSeconds)] }));
    })(), null);
  } catch {
    return null;
  }
}

export async function cacheGetNumber(key) {
  const client = getClient();
  if (!client || !client.isReady) return null;
  try {
    const value = await withTimeout(client.get(key), null);
    if (value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

export async function cacheSetRaw(key, value, ttlSeconds) {
  const client = getClient();
  if (!client || !client.isReady) return false;
  try {
    return await withTimeout(client.set(key, String(value), { EX: ttlSeconds }), false) !== false;
  } catch {
    return false;
  }
}

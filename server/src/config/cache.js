import { createClient } from "redis";

let client = null;
let connecting = null;

function getClient() {
  if (!process.env.REDIS_URL) return null;
  if (!client) client = createClient({ url: process.env.REDIS_URL }).on("error", () => {});
  if (!connecting) connecting = client.connect().catch(() => { connecting = null; });
  return client;
}

export async function cacheGet(key) {
  try { const c = getClient(); if (!c) return null; await connecting; const value = await c.get(key); return value ? JSON.parse(value) : null; } catch { return null; }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  try { const c = getClient(); if (!c) return false; await connecting; await c.set(key, JSON.stringify(value), { EX: ttlSeconds }); return true; } catch { return false; }
}

export async function cacheDelete(key) {
  try { const c = getClient(); if (!c) return false; await connecting; await c.del(key); return true; } catch { return false; }
}

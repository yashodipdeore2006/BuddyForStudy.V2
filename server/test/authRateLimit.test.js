import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { AUTH_RATE_LIMIT_POLICY, createAuthLimiter } from "../src/config/rateLimiters.js";

function createMemoryTestStore() {
  const buckets = new Map();
  let windowMs = 60_000;
  return {
    init(options) { windowMs = Number(options.windowMs) || windowMs; },
    async increment(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) bucket = { totalHits: 0, resetAt: now + windowMs };
      bucket.totalHits += 1;
      buckets.set(key, bucket);
      return { totalHits: bucket.totalHits, resetTime: new Date(bucket.resetAt) };
    },
    async decrement(key) {
      const bucket = buckets.get(key);
      if (bucket && bucket.totalHits > 0) bucket.totalHits -= 1;
    },
    async resetKey(key) { buckets.delete(key); },
    async get(key) {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= Date.now()) return undefined;
      return { totalHits: bucket.totalHits, resetTime: new Date(bucket.resetAt) };
    }
  };
}

test("authentication rate limit exposes a clear bounded policy", () => {
  assert.equal(AUTH_RATE_LIMIT_POLICY.windowMs, 15 * 60 * 1000);
  assert.equal(AUTH_RATE_LIMIT_POLICY.max, 30);
  assert.equal(AUTH_RATE_LIMIT_POLICY.standardHeaders, true);
  assert.equal(AUTH_RATE_LIMIT_POLICY.legacyHeaders, false);
  assert.deepEqual(AUTH_RATE_LIMIT_POLICY.message, {
    success: false,
    message: "Too many authentication attempts. Please try again later."
  });
});

test("authentication limiter returns 429 with a safe message after the configured request budget", async () => {
  const app = express();
  app.use("/api/auth", createAuthLimiter({ store: createMemoryTestStore() }));
  app.post("/api/auth/login", (_req, res) => res.status(200).json({ success: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Test server did not bind to an ephemeral TCP port.");
  }

  try {
    let lastResponse;
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_POLICY.max + 1; attempt += 1) {
      lastResponse = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "learner@example.test", password: "synthetic-password" })
      });
    }
    assert.ok(lastResponse);
    assert.equal(lastResponse.status, 429);
    const payload = await lastResponse.json();
    assert.deepEqual(payload, AUTH_RATE_LIMIT_POLICY.message);
    assert.ok(lastResponse.headers.get("ratelimit-limit") || lastResponse.headers.get("ratelimit-policy"));
    assert.equal(JSON.stringify(payload).includes("synthetic-password"), false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

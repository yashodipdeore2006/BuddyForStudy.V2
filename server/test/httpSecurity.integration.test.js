import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const canRun = Boolean(process.env.MONGO_URI);
const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
const allowedOrigin = "https://buddyforstudy.example";

let child;
let baseUrl = "";
let childOutput = "";

async function allocatePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local test port.");
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error("Test API exited before becoming healthy. " + childOutput.slice(-4000));
    }
    try {
      const response = await fetch(baseUrl + "/health", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // The child may still be connecting to MongoDB or starting its listener.
    }
    await delay(150);
  }
  throw new Error("Test API did not become healthy in 20 seconds. " + childOutput.slice(-4000));
}

before(async () => {
  if (!canRun) return;
  const port = await allocatePort();
  baseUrl = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      CLIENT_URL: allowedOrigin,
      JWT_SECRET: process.env.JWT_SECRET || "http-http-security-integration-test-secret",
      TRUST_PROXY_HOPS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { childOutput += chunk; });
  child.stderr.on("data", (chunk) => { childOutput += chunk; });
  await waitForHealth();
}, { timeout: 25_000 });

after(async () => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(8_000).then(() => {
      if (child && child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
});

test("HTTP security headers are applied and the Express banner is disabled", { skip: !canRun }, async () => {
  const response = await fetch(baseUrl + "/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("x-frame-options"));
  assert.ok(response.headers.get("referrer-policy"));
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("CORS allows only the configured frontend origin", { skip: !canRun }, async () => {
  const allowed = await fetch(baseUrl + "/health", {
    headers: { Origin: allowedOrigin },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);

  const blocked = await fetch(baseUrl + "/health", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  assert.equal(blocked.status, 403);
});

test("JSON request bodies above 1 MB are rejected before route handling", { skip: !canRun }, async () => {
  const payload = JSON.stringify({ payload: "x".repeat(1024 * 1024) });
  const response = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  assert.equal(response.status, 413);
});

test("URL-encoded request bodies above 10 KB are rejected before route handling", { skip: !canRun }, async () => {
  const payload = "payload=" + "x".repeat(12 * 1024);
  const response = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  assert.equal(response.status, 413);
});

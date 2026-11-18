const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const render = fs.readFileSync(path.join(root, "..", "render.yaml"), "utf8");
const apiClient = fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8");

test("production frontend requires an explicit deployed API origin", () => {
  assert.match(apiClient, /VITE_API_URL/);
  assert.match(apiClient, /if \(!import\.meta\.env\.DEV && !configuredApiUrl\)/,
    "production must fail fast when the API origin is missing");
  assert.doesNotMatch(apiClient, /VITE_API_URL \|\| ["']http:\/\/localhost:5000/,
    "production must never silently fall back to localhost");
});

test("Vercel config builds the Vite app and serves client-side routes directly", () => {
  assert.equal(vercel.framework, "vite");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.outputDirectory, "dist");
  assert.ok(vercel.rewrites.some((rule) => (
    rule.source === "/(.*)" && rule.destination === "/index.html"
  )), "Vite SPA deep links must resolve to index.html");
  const assetHeaders = vercel.headers.find((rule) => rule.source === "/assets/(.*)")?.headers || [];
  assert.ok(assetHeaders.some((header) => (
    header.key === "Cache-Control" && /immutable/.test(header.value)
  )), "hashed build assets should use immutable caching");
});

test("Render defaults to one API service with bounded inline background execution", () => {
  assert.match(render, /name: buddyforstudy-api/);
  assert.doesNotMatch(render, /name: buddyforstudy-worker/);
  assert.equal((render.match(/^\\s+- type:/gm) || []).length, 1,
    "the cost-conscious default blueprint must not create a separately billed worker");
  assert.match(render, /key: BACKGROUND_WORKER_MODE\\s+value: inline/);
  assert.match(render, /key: PAYMENTS_ENABLED\\s+value: ["']?false["']?/);
  assert.match(render, /rootDir: server/);
  assert.match(render, /buildCommand: npm ci/);
  assert.match(render, /startCommand: npm run start/);
  assert.doesNotMatch(render, /startCommand: npm run worker/);
  assert.match(render, /healthCheckPath: \\/api\\/health\\/ready/);
  assert.equal((render.match(/autoDeployTrigger: checksPass/g) || []).length, 1,
    "the API service must deploy only after linked CI checks pass");
  assert.match(render, /maxShutdownDelaySeconds: 120/,
    "the API should have a bounded shutdown window for inline maintenance");
});

test("the deployment runbook documents the standalone worker as an explicit future upgrade", () => {
  const runbook = fs.readFileSync(path.join(root, "..", "docs", "DEPLOYMENT.md"), "utf8");
  assert.match(runbook, /BACKGROUND_WORKER_MODE=standalone/);
  assert.match(runbook, /npm run worker/);
  assert.match(runbook, /Do not run API-inline and standalone scheduling against the same environment/);
});

test("Render production secrets are referenced or collected through secure fields", () => {
  const lines = render.split(/\r?\n/);
  const sensitiveKeys = new Set([
    "MONGO_URI", "JWT_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET", "SMTP_PASS", "WEB_PUSH_VAPID_PRIVATE_KEY",
    "GEMINI_API_KEY", "YOUTUBE_API_KEY", "REDIS_URL"
  ]);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*- key: ([A-Z0-9_]+)\s*$/);
    if (!match || !sensitiveKeys.has(match[1])) continue;
    const detail = lines.slice(i + 1, i + 5).join("\n");
    assert.match(detail, /sync: false|generateValue: true|fromService:/,
      `${match[1]} must not be hard-coded in render.yaml`);
  }
});

test("new Build with AI rollout flags remain opt-in in the production blueprint", () => {
  for (const key of [
    "USE_CURATION_ENGINE_FOR_AI",
    "INTENT_V2",
    "ASYNC_ROADMAP",
    "YT_COMBINED_SEARCH",
    "ENABLE_TRUSTED_CHANNELS",
    "ENABLE_CURATION_COMPLIANCE_WORKERS",
    "AI_PRIVATE_COURSES_SKIP_REVIEW"
  ]) {
    assert.match(render, new RegExp(`key: ${key}\\s+value: ["']?false["']?`),
      `${key} must remain disabled for initial production rollout`);
  }
});

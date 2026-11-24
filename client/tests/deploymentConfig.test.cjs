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
  assert.equal(vercel.buildCommand, "npm run build && npm run write:release-manifest");
  assert.equal(vercel.outputDirectory, "dist");
  assert.ok(vercel.rewrites.some((rule) => (
    rule.source === "/(.*)" && rule.destination === "/index.html"
  )), "Vite SPA deep links must resolve to index.html");
  const assetHeaders = vercel.headers.find((rule) => rule.source === "/assets/(.*)")?.headers || [];
  assert.ok(assetHeaders.some((header) => (
    header.key === "Cache-Control" && /immutable/.test(header.value)
  )), "hashed build assets should use immutable caching");
});

test("Render Blueprint includes a static frontend and one bounded inline API service", () => {
  assert.match(render, /name: buddyforstudy-api/);
  assert.match(render, /branch: buddy-for-study-v2\.2/, "Render must deploy the approved V2.2 release branch");
  assert.doesNotMatch(render, /name: buddyforstudy-worker/);
  assert.equal((render.match(/^  - type: web$/gm) || []).length, 2,
    "the cost-conscious blueprint must contain one API and one static frontend, with no worker");
  assert.match(render, /name: buddyforstudy-api[\s\S]*plan: free/,
    "the constrained API plan must be explicit rather than silently selecting a paid default");
  assert.match(render, /source: \/\*\s+destination: \/index\.html/,
    "the Render static site must support SPA deep links");
  assert.ok(render.includes("runtime: static") && render.includes("name: buddyforstudy-web"),
    "the frontend must be configured as a Render static site");
  assert.match(render, /rootDir: client/);
  assert.match(render, /staticPublishPath: dist/);
  assert.match(render, /key: VITE_API_URL[\s\S]{0,40}sync: false/);
  assert.match(render, /key: VITE_PUBLIC_SITE_URL[\s\S]{0,50}sync: false/);
  assert.equal((render.match(/branch: buddy-for-study-v2\.2/g) || []).length, 2,
    "both frontend and API must deploy the V2.2 branch");

  const modeStart = render.indexOf("key: BACKGROUND_WORKER_MODE");
  const paymentStart = render.indexOf("key: PAYMENTS_ENABLED");
  const nextEnvironmentKey = render.indexOf("key: JWT_EXPIRES_IN", paymentStart);
  assert.ok(modeStart >= 0 && render.slice(modeStart, paymentStart).includes("value: inline"));
  assert.ok(paymentStart >= 0 && render.slice(paymentStart, nextEnvironmentKey).includes('value: "false"'));

  assert.match(render, /rootDir: server/);
  assert.match(render, /buildCommand: npm ci && npm run build && npm run write:release-manifest/);
  assert.match(render, /startCommand: npm run start/);
  assert.doesNotMatch(render, /startCommand: npm run worker/);
  assert.ok(render.includes("/api/health/ready"));
  assert.equal((render.match(/autoDeployTrigger: ['"]off['"]/g) || []).length, 2,
    "the API and static frontend must not auto-deploy when V2.2 changes; release deployment is manual");
  assert.ok(render.includes("maxShutdownDelaySeconds: 120"),
    "the API should have a bounded shutdown window for inline maintenance");
});

test("the deployment runbook documents the standalone worker as an explicit future upgrade", () => {
  const runbook = fs.readFileSync(path.join(root, "..", "docs", "DEPLOYMENT.md"), "utf8");
  assert.match(render, /key: BACKGROUND_WORKER_MODE[\s\S]{0,60}value: inline/);
  assert.match(runbook, /npm run worker/);
  assert.match(runbook, /Do not run API-inline and standalone scheduling against the same environment/);
});

test("Render Free API requires an explicitly configured SMTP port", () => {
  assert.ok(render.includes("      - key: SMTP_PORT\n        sync: false"),
    "SMTP_PORT must be entered explicitly; Render Free blocks standard SMTP ports");
  assert.ok(!render.includes("      - key: SMTP_PORT\n        value: \"587\""),
    "the Blueprint must not silently configure port 587 on Render Free");
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


test("Render and Vercel static frontends apply compatible security headers", () => {
  const globalHeaders = vercel.headers.find((rule) => rule.source === "/(.*)")?.headers || [];
  const readHeader = (headers, key) => headers.find((header) => header.key === key)?.value;
  const policy = readHeader(globalHeaders, "Content-Security-Policy") || "";

  for (const key of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
  ]) {
    assert.ok(readHeader(globalHeaders, key), "Vercel must set " + key);
  }
  for (const origin of [
    "https://accounts.google.com",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ]) {
    assert.ok(policy.includes(origin), "CSP must preserve integration origin " + origin);
  }
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /connect-src 'self' https: wss:/);

  const renderFrontend = render.slice(render.indexOf("name: buddyforstudy-web"));
  for (const key of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
  ]) {
    assert.ok(renderFrontend.includes("name: " + key), "Render must set " + key);
  }
  for (const origin of [
    "https://accounts.google.com",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://checkout.razorpay.com",
  ]) {
    assert.ok(renderFrontend.includes(origin), "Render CSP must preserve " + origin);
  }
});

test("About, Contact and Help Centre remain route-split and built assets stay immutable", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  for (const statement of [
    "const About = lazy(() => import('@/pages/About'));",
    "const Contact = lazy(() => import('@/pages/Contact'));",
    "const FAQ = lazy(() => import('@/pages/FAQ'));",
  ]) {
    assert.ok(app.includes(statement), "Public page route must remain lazy-loaded: " + statement);
  }
  const renderFrontend = render.slice(render.indexOf("name: buddyforstudy-web"));
  const cacheSegment = renderFrontend.slice(renderFrontend.indexOf("path: /assets/*"), renderFrontend.indexOf("name: Content-Security-Policy"));
  assert.match(cacheSegment, /immutable/);
  const assetHeaders = vercel.headers.find((rule) => rule.source === "/assets/(.*)")?.headers || [];
  assert.ok(assetHeaders.some((header) => header.key === "Cache-Control" && /immutable/.test(header.value)));
});

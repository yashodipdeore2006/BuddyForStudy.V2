import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/public-endpoint-abuse-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const healthController = readFileSync(new URL("../src/controllers/health.controller.js", import.meta.url), "utf8");
const discoveryRoutes = readFileSync(new URL("../src/routes/discovery.routes.js", import.meta.url), "utf8");
const [notificationService, quotaService] = await Promise.all([
  import("../src/services/notification.service.js"),
  import("../src/services/quota.service.js")
]);

test("shared API rate limiter is mounted before every public and optional-auth API group", () => {
  const globalLimiterIndex = server.indexOf('app.use(rateLimit({\n  windowMs: 15 * 60 * 1000,\n  limit: 1000,');
  assert.ok(globalLimiterIndex >= 0, "Expected the shared Mongo-backed API limiter");

  for (const mount of [
    'app.use("/api/public"',
    'app.use("/api/consent"',
    'app.get("/api/auth/google/config"',
    'app.use("/api/auth"',
    'app.use("/api/courses"',
    'app.use("/api/discovery"',
    'app.use("/api/reviews"',
    'app.use("/api/billing"',
    'app.use("/api/notifications"',
    'app.use("/api/legal"',
    'app.use("/api/payments"',
    'app.use("/api/webhooks"'
  ]) {
    const index = server.indexOf(mount);
    assert.ok(index > globalLimiterIndex, mount + " must remain behind the shared API limiter");
  }
});

test("only the intentionally lightweight health probes bypass the shared limiter", () => {
  const globalLimiterIndex = server.indexOf('app.use(rateLimit({\n  windowMs: 15 * 60 * 1000,\n  limit: 1000,');
  const directHealthIndex = server.indexOf('app.get("/health"');
  const apiHealthIndex = server.indexOf('app.use("/api/health", healthRoutes)');
  assert.ok(directHealthIndex >= 0 && directHealthIndex < globalLimiterIndex);
  assert.ok(apiHealthIndex >= 0 && apiHealthIndex < globalLimiterIndex);

  assert.match(healthController, /export function health\(_req, res\)\s*\{\s*return success\(res, \{ status: "ok", service: "buddyforstudy-api", timestamp: new Date\(\)\.toISOString\(\) \}\);/);
  assert.match(healthController, /export function readiness\(_req, res\)\s*\{\s*const connected = mongoose\.connection\.readyState === 1;/);
  assert.doesNotMatch(healthController, /\.find\(|\.aggregate\(|fetch\(/);
});

test("authentication routes retain their dedicated limiter in addition to the shared API limiter", () => {
  assert.match(server, /app\.use\("\/api\/auth", authLimiter, authRoutes\)/);
  assert.match(server, /app\.get\("\/api\/auth\/google\/config", googleConfig\)/);
});

test("public discovery feedback is rate-limited before optional authentication and controller work", () => {
  assert.match(discoveryRoutes, /const curationFeedbackLimiter = rateLimit\(\{[\s\S]*?windowMs: 60 \* 60 \* 1000,[\s\S]*?limit: 120,[\s\S]*?standardHeaders: true,[\s\S]*?legacyHeaders: false/);
  assert.match(discoveryRoutes, /router\.post\("\/curation-feedback", curationFeedbackLimiter, optionalAuthMiddleware, recordCurationFeedback\)/);
});

test("YouTube quota guard fails closed when shared quota storage is unavailable", async () => {
  let providerBudgetConsumptionAttempts = 0;
  quotaService.__setQuotaTestAdapters({
    getState: async () => ({
      store: "unavailable",
      state: "degraded",
      defaultState: "degraded",
      searchState: "degraded",
      units: 0,
      searchCalls: 0
    }),
    consumeBucketWithinBudget: async () => {
      providerBudgetConsumptionAttempts += 1;
      return 1;
    }
  });

  try {
    await assert.rejects(
      quotaService.tryConsume(1, { bucket: "search" }),
      (error) => error.name === "QuotaBudgetError" && error.state === "degraded"
    );
    assert.equal(providerBudgetConsumptionAttempts, 0, "provider budget must not be consumed when shared quota storage is unavailable");
  } finally {
    quotaService.__setQuotaTestAdapters(null);
  }
});

test("email unsubscribe capability tokens reject tampering, expiry and oversized input", () => {
  const userId = "507f1f77bcf86cd799439011";
  const now = 1_900_000_000_000;
  const expiresAt = now + 60_000;
  const token = notificationService.createEmailUnsubscribeToken(userId, expiresAt);

  assert.deepEqual(notificationService.verifyEmailUnsubscribeToken(token, now), {
    userId,
    expiresAt
  });
  assert.equal(notificationService.verifyEmailUnsubscribeToken(token, expiresAt), null);
  assert.equal(notificationService.verifyEmailUnsubscribeToken(token + "tampered", now), null);
  assert.equal(notificationService.verifyEmailUnsubscribeToken("x".repeat(2049), now), null);
  assert.equal(notificationService.verifyEmailUnsubscribeToken("not-a-token", now), null);
});

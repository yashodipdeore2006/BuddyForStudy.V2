import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../src/routes/webhook.routes.js", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/controllers/webhook.controller.js", import.meta.url), "utf8");
const razorpay = readFileSync(new URL("../src/services/razorpay.service.js", import.meta.url), "utf8");

test("Razorpay webhook middleware preserves the exact raw request bytes", () => {
  assert.match(server, /if \(req\.originalUrl\.startsWith\("\/api\/webhooks\/razorpay"\)\) req\.rawBody = Buffer\.from\(buf\)/);
});

test("Razorpay webhook route is mounted behind the webhook limiter and payment availability gate", () => {
  assert.match(server, /app\.use\("\/api\/webhooks", webhookLimiter, requirePaymentsEnabled, webhookRoutes\)/);
  assert.match(router, /router\.post\("\/razorpay", controller\.razorpayWebhook\)/);
});

test("webhook signature validation rejects missing raw bytes and runs before event claiming", () => {
  const start = controller.indexOf("export async function razorpayWebhook");
  assert.ok(start >= 0, "Expected the Razorpay webhook controller");
  const handler = controller.slice(start);
  const verificationIndex = handler.indexOf("razorpay.verifyWebhookSignature");
  const claimIndex = handler.indexOf("claimEvent(req, event)");

  assert.ok(verificationIndex >= 0, "Expected provider signature validation");
  assert.ok(claimIndex > verificationIndex, "An event must not be claimed before signature validation");
  assert.match(handler, /if \(!req\.rawBody \|\| !razorpay\.verifyWebhookSignature\(req\.rawBody, signature, env\.razorpayWebhookSecret\)\)\s*\{\s*return failure\(res, "Invalid webhook signature", 400\)/);
});

test("webhook HMAC uses the raw bytes and constant-time signature comparison", () => {
  const start = razorpay.indexOf("export function verifyWebhookSignature");
  const end = razorpay.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start, "Expected verifyWebhookSignature implementation");
  const verifier = razorpay.slice(start, end);

  assert.match(verifier, /crypto\.createHmac\("sha256", webhookSecret\)\.update\(rawBody\)\.digest\("hex"\)/);
  assert.match(verifier, /crypto\.timingSafeEqual\(expectedBuffer, actualBuffer\)/);
  assert.match(verifier, /if \(!rawBody \|\| !signature \|\| !webhookSecret\) return false/);
});

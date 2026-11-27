import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const routes = read("../src/lib/routes.ts");
const app = read("../src/App.tsx");
const billing = read("../src/pages/Billing.tsx");
const details = read("../src/pages/TransactionDetails.tsx");
const settings = read("../src/pages/Settings.tsx");

test("transaction details have a canonical encoded route and protected page registration", () => {
  assert.match(routes, /paymentDetails:\s*\(paymentId: string\)\s*=>\s*`\/billing\/transactions\/\$\{encodeRouteSegment\(paymentId, "payment id"\)\}`/);
  assert.match(app, /path="\/billing\/transactions\/:paymentId" element=\{<ProtectedRoute><TransactionDetails \/><\/ProtectedRoute>\}/);
  assert.match(app, /const TransactionDetails = lazy\(\(\) => import\('@\/pages\/TransactionDetails'\)\)/);
});

test("billing transaction rows link to individual details without removing support actions", () => {
  assert.match(billing, /routes\.paymentDetails\(payment\._id\)/);
  assert.match(billing, /setRefundId/);
  assert.match(billing, /setIssueId/);
  assert.match(billing, /exportCsv/);
});

test("settings navigation groups account, security, and privacy controls", () => {
  assert.match(settings, /aria-label="Account preferences"/);
  assert.match(settings, /aria-label="Security and communication"/);
  assert.match(settings, /aria-label="Privacy controls"/);
  assert.match(settings, /Purchases & payments/);
  assert.match(settings, /id="account-deletion"/);
  assert.match(settings, /id="data-rights-request"/);
});

test("transaction detail view presents payment references and related support history", () => {
  assert.match(details, /providerPaymentId/);
  assert.match(details, /providerOrderId/);
  assert.match(details, /Refund history/);
  assert.match(details, /Payment support/);
  assert.match(details, /api\/billing\/payments/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("../src/routes/billing.routes.js", import.meta.url), "utf8");

test("transaction details endpoint validates IDs and scopes payment lookup to the authenticated owner", () => {
  const start = routeSource.indexOf('router.get("/payments/:paymentId"');
  const end = routeSource.indexOf('router.get("/payments"', start);
  assert.ok(start >= 0 && end > start, "Expected transaction detail route before the payment list route");
  const route = routeSource.slice(start, end);

  assert.match(route, /isValidObjectId\(paymentId\)/);
  assert.match(route, /Payment\.findOne\(\{\s*_id:\s*paymentId,\s*user:\s*req\.user\.userId\s*\}\)/);
  assert.match(route, /if \(!payment\) return failure\(res, "Transaction not found", 404\)/);
  assert.match(route, /\.select\("_id amount currency status provider providerPaymentId providerOrderId course plan createdAt updatedAt paidAt"\)/);
  assert.doesNotMatch(route, /\.select\([^)]*metadata|\.populate\([^)]*internalNotes/);
});

test("transaction details return only the signed-in user's related refunds and support issues", () => {
  const start = routeSource.indexOf('router.get("/payments/:paymentId"');
  const end = routeSource.indexOf('router.get("/payments"', start);
  const route = routeSource.slice(start, end);

  assert.match(route, /RefundRequest\.find\(\{\s*user:\s*req\.user\.userId,\s*payment:\s*payment\._id\s*\}\)/);
  assert.match(route, /PaymentIssue\.find\(\{\s*user:\s*req\.user\.userId,\s*payment:\s*payment\._id\s*\}\)/);
  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /success\(res, \{ payment, refunds, issues \}\)/);
  assert.doesNotMatch(route, /internalNotes|reconciliationToken|processedBy|assignedTo/);
});

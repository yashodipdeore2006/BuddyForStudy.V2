import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin API exposes payment records as read-only and has no direct payment-status mutation route", async () => {
  const routes = await read("../src/routes/adminPro.routes.js");
  assert.match(routes, /router\.get\("\/payments",\s*adminPermissionMiddleware\("billing\.read"\),\s*controller\.payments\)/);
  assert.doesNotMatch(routes, /router\.(?:put|patch|post|delete)\("\/payments\/:/i);
  assert.doesNotMatch(routes, /router\.(?:put|patch)\("\/payments"/i);
});

test("finance decision and reconciliation endpoints require a reason before mutating state", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const updateRefund = controller.slice(controller.indexOf("export async function updateRefund"), controller.indexOf("export async function reconcileRefund"));
  const reconcileRefund = controller.slice(controller.indexOf("export async function reconcileRefund"), controller.indexOf("export async function notificationAudienceOptions"));
  assert.match(updateRefund, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(updateRefund, /await audit\(req, "refund\.updated"[^]*reason\)/);
  assert.match(reconcileRefund, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(reconcileRefund, /await audit\(req, "refund\.reconciled"[^]*reason\)/);
  assert.match(reconcileRefund, /await audit\(req, "refund\.reconciliation_failed"[^]*reason\)/);
});

test("payment status is not copied from arbitrary admin request data", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  assert.doesNotMatch(controller, /payment\.status\s*=\s*req\.body(?:\?\.status|\.status)/);
  assert.doesNotMatch(controller, /Payment\.(?:findOneAndUpdate|findByIdAndUpdate|updateOne|updateMany)\([^;]*req\.body(?:\?\.status|\.status)/s);
  assert.match(controller, /payment\.status\s*=\s*paymentStatusForRemainingBalance\(/);
});

test("coupon create, update and bulk generation require an audit reason", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  for (const [start, end] of [
    ["export async function createCoupon", "export async function updateCoupon"],
    ["export async function updateCoupon", "export async function auditLogs"],
    ["export async function bulkCreateCoupons", "export async function createCoupon"],
  ]) {
    const segment = controller.slice(controller.indexOf(start), controller.indexOf(end));
    assert.match(segment, /reason\.length < 10 \|\| reason\.length > 500/);
    assert.match(segment, /await audit\(/);
  }
});

test("subscription plan create and update require a reason and audit the change", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const createPlan = controller.slice(controller.indexOf("export async function createPlan"), controller.indexOf("export async function updatePlan"));
  const updatePlan = controller.slice(controller.indexOf("export async function updatePlan"), controller.indexOf("export async function payments"));
  assert.match(createPlan, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(createPlan, /await audit\(req, "subscription_plan.created"[^]*reason\)/);
  assert.match(updatePlan, /reason.length < 10 \\|\\| reason.length > 500/);
  assert.match(updatePlan, /await audit\(req, "subscription_plan.updated"[^]*reason\)/);
});

test("support assignment and private-note changes require a reason and produce an audit event", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const updateIssue = controller.slice(controller.indexOf("export async function updatePaymentIssue"));
  assert.match(updateIssue, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(updateIssue, /assignedTo/);
  assert.match(updateIssue, /internalNotes/);
  assert.match(updateIssue, /await audit\(req, "payment_issue\.updated"[^]*reason\)/);
});

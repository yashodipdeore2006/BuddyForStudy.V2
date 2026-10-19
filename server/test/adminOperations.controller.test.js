import test from "node:test";
import assert from "node:assert/strict";
import { WebhookEvent } from "../src/models/WebhookEvent.js";
import { Payment } from "../src/models/Payment.js";
import { webhookEvents, auditOutboxItems } from "../src/controllers/adminOperations.controller.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); } finally { for (const item of originals.reverse()) item.target[item.key] = item.original; }
}
function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("failed webhook list links a matching payment and returns bounded event metadata", async () => {
  const event = { _id: "webhook-1", eventId: "evt_123", event: "payment.failed", status: "failed", providerOrderId: "order_123", providerPaymentId: "pay_123", createdAt: new Date(), updatedAt: new Date() };
  let paymentFilter;
  const payment = { _id: "payment-1", amount: 499, currency: "INR", status: "failed", provider: "razorpay", providerPaymentId: "pay_123", providerOrderId: "order_123", user: { name: "Learner" } };
  const res = responseRecorder();
  await withMocks([
    [WebhookEvent, { find: () => ({ sort() { return this; }, limit() { return this; }, lean: async () => [event] }) }],
    [Payment, { findOne: (filter) => { paymentFilter = filter; return { select() { return this; }, populate() { return this; }, lean: async () => payment }; } }]
  ], async () => {
    await webhookEvents({ query: { status: "failed", limit: "25" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.events[0].payment.id, "payment-1");
  assert.equal(res.body.events[0].payment.user.name, "Learner");
  assert.deepEqual(paymentFilter, { $or: [{ provider: "razorpay", providerPaymentId: "pay_123" }, { provider: "razorpay", providerOrderId: "order_123" }] });
});

test("audit outbox list omits the raw event payload", async () => {
  const res = responseRecorder();
  await withMocks([
    [AuditOutbox, { find: () => ({ sort() { return this; }, limit() { return this; }, lean: async () => [{ _id: "outbox-1", eventId: "evt-audit", status: "pending", attempts: 2, event: { action: "user.updated", targetType: "User", targetId: "u1", secret: "must-not-escape" }, lastError: "retry", createdAt: new Date() }] }) }]
  ], async () => {
    await auditOutboxItems({ query: { limit: "10" } }, res, (error) => { throw error; });
  });
  assert.equal(res.body.success, true);
  assert.equal(res.body.items[0].action, "user.updated");
  assert.equal("event" in res.body.items[0], false);
  assert.equal(JSON.stringify(res.body.items).includes("must-not-escape"), false);
});

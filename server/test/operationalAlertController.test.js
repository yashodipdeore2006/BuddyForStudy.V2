import test from "node:test";
import assert from "node:assert/strict";
import { OperationalAlert } from "../src/models/OperationalAlert.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { acknowledgeOperationalAlert, operationalAlerts } from "../src/controllers/operationalAlert.controller.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("acknowledging an open operational alert records the administrator and state transition", async () => {
  const alertId = "507f1f77bcf86cd799439013";
  const actorId = "507f191e810c19729de860ec";
  const alert = {
    _id: alertId,
    status: "open",
    severity: "critical",
    occurrenceCount: 3,
    acknowledgedBy: null,
    acknowledgedAt: null,
    async save() { return this; }
  };
  let auditEvent;
  const res = responseRecorder();

  await withMocks([
    [OperationalAlert, { findById: async (id) => id === alertId ? alert : null }],
    [AuditLog, { create: async (event) => { auditEvent = event; return event; } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox should not be used"); } }]
  ], async () => {
    await acknowledgeOperationalAlert({
      params: { alertId },
      user: { user: { _id: actorId } },
      ip: "192.0.2.10",
      get: (header) => header === "user-agent" ? "operations-test" : ""
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(alert.status, "acknowledged");
  assert.equal(alert.acknowledgedBy, actorId);
  assert.ok(alert.acknowledgedAt instanceof Date);
  assert.equal(res.body.auditLogRecorded, true);
  assert.equal(auditEvent.actor, actorId);
  assert.equal(auditEvent.action, "operational_alert.acknowledged");
  assert.equal(auditEvent.targetId, alertId);
  assert.deepEqual(auditEvent.before, { status: "open", severity: "critical", occurrenceCount: 3 });
  assert.deepEqual(auditEvent.after, { status: "acknowledged", severity: "critical", occurrenceCount: 3 });
});

test("resolved operational alerts cannot be acknowledged again", async () => {
  const alertId = "507f1f77bcf86cd799439014";
  const alert = {
    _id: alertId,
    status: "resolved",
    severity: "warning",
    occurrenceCount: 1,
    saveCalled: false,
    async save() { this.saveCalled = true; return this; }
  };
  const res = responseRecorder();

  await withMocks([
    [OperationalAlert, { findById: async () => alert }],
    [AuditLog, { create: async () => { throw new Error("audit should not be attempted"); } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox should not be attempted"); } }]
  ], async () => {
    await acknowledgeOperationalAlert({
      params: { alertId },
      user: { user: { _id: "507f191e810c19729de860ec" } },
      ip: "192.0.2.10",
      get: () => "operations-test"
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(alert.saveCalled, false);
});


test("operational alert list limit is an integer bounded to 1–100 with a safe default", async () => {
  const cases = [
    { input: "3.9", expected: 3 },
    { input: "999", expected: 100 },
    { input: "0", expected: 50 },
    { input: "not-a-number", expected: 50 }
  ];

  for (const { input, expected } of cases) {
    let appliedLimit;
    const query = {
      populate() { return this; },
      sort() { return this; },
      limit(value) { appliedLimit = value; return this; },
      async lean() { return []; }
    };
    const res = responseRecorder();
    await withMocks([
      [OperationalAlert, {
        find: () => query,
        countDocuments: async () => 0
      }]
    ], async () => {
      await operationalAlerts({ query: { limit: input } }, res, (error) => { throw error; });
    });
    assert.equal(appliedLimit, expected, `limit input ${input}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  }
});

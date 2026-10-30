import test from "node:test";
import assert from "node:assert/strict";
import { checkNotificationDeliveryBacklog } from "../src/services/notificationBacklog.service.js";

test("aged notification backlog opens a warning alert and resolves a cleared channel", async () => {
  const recorded = [];
  const resolved = [];
  const now = new Date("2026-10-30T12:00:00.000Z");
  const result = await checkNotificationDeliveryBacklog(now, { threshold: 100, ageMs: 15 * 60 * 1000 }, {
    countPending: async (channel, cutoff) => {
      assert.equal(cutoff.toISOString(), "2026-10-30T11:45:00.000Z");
      return channel === "email" ? 120 : 0;
    },
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });

  assert.deepEqual(result.counts, { email: 120, push: 0 });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].key, "notification-delivery-backlog-email");
  assert.equal(recorded[0].severity, "warning");
  assert.equal(resolved[0], "notification-delivery-backlog-push");
});

test("severe notification backlog is raised as a critical operational alert", async () => {
  const alerts = [];
  await checkNotificationDeliveryBacklog(new Date("2026-10-30T12:00:00.000Z"), { threshold: 100 }, {
    countPending: async (channel) => channel === "email" ? 500 : 0,
    recordAlert: async (alert) => alerts.push(alert),
    resolveAlert: async () => {}
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "critical");
  assert.match(alerts[0].message, /500 email notifications/);
});

test("notification backlog alert threshold and age remain bounded", async () => {
  let observed;
  await checkNotificationDeliveryBacklog(new Date("2026-10-30T12:00:00.000Z"), { threshold: 0, ageMs: 1 }, {
    countPending: async (_channel, cutoff) => { observed = cutoff; return 0; },
    recordAlert: async () => {},
    resolveAlert: async () => {}
  });
  assert.equal(observed.toISOString(), "2026-10-30T11:59:00.000Z");
});

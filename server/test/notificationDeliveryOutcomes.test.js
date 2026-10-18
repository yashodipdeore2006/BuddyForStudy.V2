import test from "node:test";
import assert from "node:assert/strict";
import { mailRecipientAccepted, summarizeNotificationDeliveryOutcomes } from "../src/services/notificationDeliveryOutcomes.js";

test("mail delivery requires explicit acceptance of the intended recipient", () => {
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: ["LEARNER@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [{ address: "learner@example.com" }], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [], rejected: ["learner@example.com"] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["other@example.com"], rejected: [] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ response: "250 queued" }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: ["learner@example.com"] }, "learner@example.com"), false);
});


test("worker delivery summary reports retryable and terminal delivery failures", () => {
  assert.deepEqual(summarizeNotificationDeliveryOutcomes([
    { status: "sent" },
    { status: "retrying" },
    { status: "failed" },
    { status: "skipped" },
    { status: "not_attempted" }
  ]), { attempted: 4, failures: 2 });
});

test("worker delivery summary reports partial multi-device push failures", () => {
  assert.deepEqual(summarizeNotificationDeliveryOutcomes([
    { status: "sent", partialFailure: true },
    { status: "sent", partialFailure: false },
    { status: "not_attempted" }
  ]), { attempted: 2, failures: 1 });
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  mailRecipientAccepted,
  oneSignalNotificationCreated
} from "../src/services/notificationDeliveryOutcomes.js";

test("mail delivery requires explicit acceptance of the intended recipient", () => {
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: ["LEARNER@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [{ address: "learner@example.com" }], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [], rejected: ["learner@example.com"] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["other@example.com"], rejected: [] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ response: "250 queued" }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: ["learner@example.com"] }, "learner@example.com"), false);
});

test("OneSignal acknowledgement must include a non-empty notification ID", () => {
  assert.equal(oneSignalNotificationCreated({ id: "notification-id" }), true);
  assert.equal(oneSignalNotificationCreated({ id: "  notification-id  " }), true);
  assert.equal(oneSignalNotificationCreated({ id: "" }), false);
  assert.equal(oneSignalNotificationCreated({ id: " " }), false);
  assert.equal(oneSignalNotificationCreated({ errors: ["No subscribed targets"] }), false);
  assert.equal(oneSignalNotificationCreated(null), false);
});

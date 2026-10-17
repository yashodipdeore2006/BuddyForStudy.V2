import test from "node:test";
import assert from "node:assert/strict";
import { mailRecipientAccepted } from "../src/services/notificationDeliveryOutcomes.js";

test("mail delivery requires explicit acceptance of the intended recipient", () => {
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: ["LEARNER@example.com"], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [{ address: "learner@example.com" }], rejected: [] }, "learner@example.com"), true);
  assert.equal(mailRecipientAccepted({ accepted: [], rejected: ["learner@example.com"] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["other@example.com"], rejected: [] }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ response: "250 queued" }, "learner@example.com"), false);
  assert.equal(mailRecipientAccepted({ accepted: ["learner@example.com"], rejected: ["learner@example.com"] }, "learner@example.com"), false);
});


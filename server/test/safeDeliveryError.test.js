import test from "node:test";
import assert from "node:assert/strict";
import { safeDeliveryError, safeDeliveryErrorMetadata } from "../src/utils/safeDeliveryError.js";

test("delivery error text never contains raw SMTP provider messages", () => {
  const error = Object.assign(new Error("Authentication failed for user alice@example.com with token=secret"), { code: "EAUTH" });
  const result = safeDeliveryError(error, "email");
  assert.equal(result, "Email delivery failed (EAUTH).");
  assert.equal(result.includes("alice@example.com"), false);
  assert.equal(result.includes("secret"), false);
});

test("push error messages use bounded status and known provider code only", () => {
  const error = Object.assign(new Error("subscription URL included private token"), { statusCode: 410, code: "gone" });
  assert.equal(safeDeliveryError(error, "push"), "Push subscription expired or no longer exists");
  assert.deepEqual(safeDeliveryErrorMetadata(error), { errorType: "Error", errorCode: "GONE", statusCode: 410 });
});

test("unsafe provider codes and raw message contents are not persisted", () => {
  const error = Object.assign(new Error("mongodb://admin:secret@host/db"), { code: "EAUTH; token=secret" });
  assert.equal(safeDeliveryError(error, "email"), "Email delivery failed.");
  assert.deepEqual(safeDeliveryErrorMetadata(error), { errorType: "Error" });
});

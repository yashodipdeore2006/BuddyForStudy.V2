import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail, sendNotification } from "../src/controllers/adminPro.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

async function expectReasonRejected(handler, body, messagePattern) {
  const res = makeResponse();
  await handler({
    body,
    user: { userId: "admin-test", user: { _id: "admin-test" } },
  }, res, (error) => assert.fail("Request must be rejected before downstream work: " + error));
  assert.equal(res.result.statusCode, 400);
  assert.match(res.result.body.message, messagePattern);
}

test("notification campaign rejects missing, short, and oversized audit reasons before sending", async () => {
  const base = {
    title: "Service update",
    message: "A planned maintenance window is scheduled.",
    type: "system",
    previewToken: "fixture-token",
  };
  for (const reason of [undefined, "", "too short", "x".repeat(501)]) {
    await expectReasonRejected(
      sendNotification,
      { ...base, ...(reason === undefined ? {} : { reason }) },
      /reason between 10 and 500 characters/i,
    );
  }
});

test("email campaign rejects missing, short, and oversized audit reasons before sending", async () => {
  const base = {
    subject: "Learning update",
    html: "<p>Learn something new today.</p>",
    previewToken: "fixture-token",
  };
  for (const reason of [undefined, "", "too short", "x".repeat(501)]) {
    await expectReasonRejected(
      sendEmail,
      { ...base, ...(reason === undefined ? {} : { reason }) },
      /reason between 10 and 500 characters/i,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { upsertSetting } from "../src/controllers/adminPro.controller.js";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

test("platform setting mutation rejects missing, short, and oversized reasons before database access", async () => {
  for (const reason of [undefined, "", "too short", "x".repeat(501)]) {
    const res = makeResponse();
    await upsertSetting({
      body: {
        key: "maintenance_mode",
        value: true,
        ...(reason === undefined ? {} : { reason }),
      },
      user: { userId: "admin-test", user: { _id: "admin-test" } },
    }, res, (error) => assert.fail("Invalid reason must fail before database access: " + error));
    assert.equal(res.result.statusCode, 400);
    assert.match(res.result.body.message, /reason between 10 and 500 characters/i);
  }
});

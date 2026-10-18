import test from "node:test";
import assert from "node:assert/strict";
import { Notification } from "../src/models/Notification.js";
import { list } from "../src/controllers/notification.controller.js";

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

test("notification list bounds limits to integers and defaults invalid input safely", async () => {
  const cases = [
    { input: "3.9", expected: 3 },
    { input: "999", expected: 100 },
    { input: "0", expected: 50 },
    { input: "invalid", expected: 50 }
  ];

  for (const { input, expected } of cases) {
    let appliedLimit;
    const query = {
      sort() { return this; },
      limit(value) { appliedLimit = value; return this; },
      async lean() { return []; }
    };
    const res = responseRecorder();

    await withMocks([
      [Notification, {
        find: () => query,
        countDocuments: async () => 0
      }]
    ], async () => {
      await list({ query: { limit: input }, user: { userId: "user-1" } }, res, (error) => { throw error; });
    });

    assert.equal(appliedLimit, expected, `limit input ${input}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  }
});

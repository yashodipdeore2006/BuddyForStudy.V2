import test from "node:test";
import assert from "node:assert/strict";
import { requestId } from "../src/middleware/requestId.js";
import { safeRequestLog } from "../src/utils/safeRequestLog.js";

test("request ID middleware generates a fresh server-owned ID and response header", () => {
  const req = { headers: { "x-request-id": "attacker-controlled" } };
  const headers = {};
  let nextCalls = 0;
  requestId(req, { setHeader: (name, value) => { headers[name] = value; } }, () => { nextCalls += 1; });

  assert.match(req.id, /^[0-9a-f-]{36}$/i);
  assert.equal(headers["x-request-id"], req.id);
  assert.equal(nextCalls, 1);
  assert.notEqual(req.id, req.headers["x-request-id"]);
});

test("safe request log correlates requests without recording query strings or client identifiers", () => {
  const req = { id: "b2b7d0d1-2e5b-4cc0-9c23-31e79ef1f87a", path: "/api/courses/private-id", query: { token: "secret" } };
  const res = { statusCode: 200 };
  const tokens = {
    "response-time": () => "12.5",
    status: () => "200",
    res: () => "123",
    method: () => "GET",
  };
  const record = JSON.parse(safeRequestLog(tokens, req, res));
  assert.equal(record.requestId, req.id);
  assert.equal(record.route, "/api/courses/*");
  assert.equal(JSON.stringify(record).includes("secret"), false);
  assert.equal(JSON.stringify(record).includes("private-id"), false);
});

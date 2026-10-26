import test from "node:test";
import assert from "node:assert/strict";
import { authErrorResponse } from "../src/utils/authErrorResponse.js";

function mockResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
  };
}

test("auth responses preserve marked operational 4xx messages", () => {
  const res = mockResponse();
  authErrorResponse(res, Object.assign(new Error("Invalid email or password"), { status: 401, isOperational: true }));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Invalid email or password");
});

test("unexpected errors never expose internal messages", () => {
  const res = mockResponse();
  authErrorResponse(res, new Error("Mongo connection failed: mongodb://user:private@db/password"));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Authentication service is temporarily unavailable. Please try again shortly.");
  assert.equal(res.body.message.includes("mongodb://"), false);
});

test("untrusted error messages with an HTTP status are redacted unless marked operational", () => {
  const res = mockResponse();
  authErrorResponse(res, Object.assign(new Error("database detail"), { status: 400 }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Authentication service is temporarily unavailable. Please try again shortly.");
});

test("429 responses preserve safe throttling messages and Retry-After", () => {
  const res = mockResponse();
  authErrorResponse(res, Object.assign(new Error("Please wait before requesting another OTP."), {
    status: 429, retryAfter: 23, isOperational: true
  }));
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.message, "Please wait before requesting another OTP.");
  assert.equal(res.headers["Retry-After"], "23");
});

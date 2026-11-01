import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { health, readiness } from "../src/controllers/health.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("liveness stays healthy without requiring a database connection", () => {
  const originalState = mongoose.connection.readyState;
  try {
    mongoose.connection.readyState = 0;
    const res = responseRecorder();
    health({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, "ok");
  } finally {
    mongoose.connection.readyState = originalState;
  }
});

test("readiness returns 503 while MongoDB is disconnected", () => {
  const originalState = mongoose.connection.readyState;
  try {
    mongoose.connection.readyState = 0;
    const res = responseRecorder();
    readiness({}, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Database is not ready");
  } finally {
    mongoose.connection.readyState = originalState;
  }
});

test("readiness succeeds only when MongoDB is connected", () => {
  const originalState = mongoose.connection.readyState;
  try {
    mongoose.connection.readyState = 1;
    const res = responseRecorder();
    readiness({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, "ready");
    assert.equal(res.body.database, "connected");
    assert.ok(Number.isFinite(Date.parse(res.body.timestamp)));
  } finally {
    mongoose.connection.readyState = originalState;
  }
});

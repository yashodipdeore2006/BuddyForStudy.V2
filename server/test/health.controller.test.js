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

test("liveness stays healthy and exposes the exact non-secret Render release SHA", () => {
  const originalState = mongoose.connection.readyState;
  const originalRenderSha = process.env.RENDER_GIT_COMMIT;
  const originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const releaseSha = "a".repeat(40);
  try {
    mongoose.connection.readyState = 0;
    process.env.RENDER_GIT_COMMIT = releaseSha;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = responseRecorder();
    health({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.releaseSha, releaseSha);
  } finally {
    mongoose.connection.readyState = originalState;
    if (originalRenderSha === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = originalRenderSha;
    if (originalVercelSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelSha;
  }
});

test("liveness does not expose an invalid or abbreviated build identifier as a release SHA", () => {
  const originalState = mongoose.connection.readyState;
  const originalRenderSha = process.env.RENDER_GIT_COMMIT;
  const originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalGitSha = process.env.GIT_COMMIT_SHA;
  try {
    mongoose.connection.readyState = 0;
    process.env.RENDER_GIT_COMMIT = "abc1234";
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    const res = responseRecorder();
    health({}, res);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.releaseSha, null);
  } finally {
    mongoose.connection.readyState = originalState;
    if (originalRenderSha === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = originalRenderSha;
    if (originalVercelSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelSha;
    if (originalGitSha === undefined) delete process.env.GIT_COMMIT_SHA;
    else process.env.GIT_COMMIT_SHA = originalGitSha;
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

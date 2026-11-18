import test from "node:test";
import assert from "node:assert/strict";
import { createGracefulShutdown } from "../src/utils/gracefulShutdown.js";

test("graceful shutdown stops timers, closes HTTP connections, then disconnects once", async () => {
  const calls = [];
  let closeCallback;
  const server = {
    close(callback) { calls.push("close"); closeCallback = callback; },
    closeIdleConnections() { calls.push("close-idle"); },
    closeAllConnections() { calls.push("close-all"); },
  };
  const shutdown = createGracefulShutdown({
    server,
    disconnect: async () => { calls.push("disconnect"); },
    clearTimers: () => calls.push("clear-timers"),
    timeoutMs: 1000,
  });

  const first = shutdown("SIGTERM");
  const second = shutdown("SIGINT");
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), ["clear-timers", "close", "close-idle"]);

  closeCallback();
  await first;
  assert.deepEqual(calls, ["clear-timers", "close", "close-idle", "disconnect"]);
});

test("graceful shutdown force-closes remaining connections after its deadline", async () => {
  const calls = [];
  const shutdown = createGracefulShutdown({
    server: {
      close() { calls.push("close"); },
      closeIdleConnections() { calls.push("close-idle"); },
      closeAllConnections() { calls.push("close-all"); },
    },
    disconnect: async () => { calls.push("disconnect"); },
    timeoutMs: 5,
  });

  await shutdown("SIGTERM");
  assert.deepEqual(calls, ["close", "close-idle", "close-all", "disconnect"]);
});

test("graceful shutdown rejects invalid lifecycle dependencies", () => {
  assert.throws(() => createGracefulShutdown({ server: null, disconnect() {} }), /HTTP server/);
  assert.throws(() => createGracefulShutdown({ server: { close() {} } }), /disconnect function/);
});


test("graceful shutdown stops background scheduling before closing the API", async () => {
  const calls = [];
  let closeCallback;
  const shutdown = createGracefulShutdown({
    server: {
      close(callback) { calls.push("close"); closeCallback = callback; },
      closeIdleConnections() { calls.push("close-idle"); }
    },
    clearTimers: () => calls.push("clear-timers"),
    beforeClose: async () => { calls.push("before-close"); },
    disconnect: async () => { calls.push("disconnect"); },
    timeoutMs: 1000
  });

  const pending = shutdown("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), ["clear-timers", "before-close", "close"]);
  closeCallback();
  await pending;
  assert.deepEqual(calls, ["clear-timers", "before-close", "close", "close-idle", "disconnect"]);
});


test("graceful shutdown bounds a stuck background drain before closing MongoDB", async () => {
  const calls = [];
  const logs = [];
  const shutdown = createGracefulShutdown({
    server: {
      close() { calls.push("close"); },
      closeIdleConnections() { calls.push("close-idle"); },
      closeAllConnections() { calls.push("close-all"); }
    },
    clearTimers: () => calls.push("clear-timers"),
    beforeClose: () => new Promise(() => {}),
    disconnect: async () => calls.push("disconnect"),
    timeoutMs: 5,
    logger: { warn(message) { logs.push(message); } }
  });

  await shutdown("SIGTERM");
  assert.deepEqual(calls, ["clear-timers", "close", "close-idle", "close-all", "disconnect"]);
  assert.ok(logs.some((message) => message.includes("background shutdown deadline")));
});

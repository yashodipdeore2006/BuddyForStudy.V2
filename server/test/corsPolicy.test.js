import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedClientOrigin } from "../src/config/corsPolicy.js";

const development = { nodeEnv: "development", clientUrl: "http://localhost:5173" };

test("development CORS accepts Vite localhost ports when the preferred port is occupied", () => {
  assert.equal(isAllowedClientOrigin("http://localhost:5174", development), true);
  assert.equal(isAllowedClientOrigin("http://localhost:5175", development), true);
  assert.equal(isAllowedClientOrigin("http://127.0.0.1:5174", development), true);
  assert.equal(isAllowedClientOrigin("http://[::1]:5174", development), true);
});

test("development CORS rejects unrelated remote and deceptive hostnames", () => {
  assert.equal(isAllowedClientOrigin("https://example.com", development), false);
  assert.equal(isAllowedClientOrigin("http://localhost.example.com:5174", development), false);
  assert.equal(isAllowedClientOrigin("javascript://localhost", development), false);
});

test("production CORS remains restricted to the configured client origin", () => {
  const production = { nodeEnv: "production", clientUrl: "https://app.buddyforstudy.example/path" };
  assert.equal(isAllowedClientOrigin("https://app.buddyforstudy.example", production), true);
  assert.equal(isAllowedClientOrigin("https://app.buddyforstudy.example/", production), true);
  assert.equal(isAllowedClientOrigin("http://localhost:5174", production), false);
  assert.equal(isAllowedClientOrigin("https://attacker.example", production), false);
});

test("origin-less server requests are allowed", () => {
  assert.equal(isAllowedClientOrigin(undefined, development), true);
  assert.equal(isAllowedClientOrigin("", development), true);
});

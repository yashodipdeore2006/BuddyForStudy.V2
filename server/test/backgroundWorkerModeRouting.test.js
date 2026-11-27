import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("API mode starts inline scheduling only in inline mode", async () => {
  const server = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /if \(env\.backgroundWorkerMode === "inline"\)/);
  assert.match(server, /inlineBackgroundScheduler\.start\(\)/);
  assert.match(server, /if \(env\.backgroundWorkerMode !== "disabled"\)/);
  assert.match(server, /beforeClose:\s*async \(\) => \{\s*if \(inlineBackgroundScheduler\) await inlineBackgroundScheduler\.stop\(\);/);
});

test("standalone worker refuses to start in inline or disabled mode", async () => {
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  assert.match(worker, /if \(env\.backgroundWorkerMode !== "standalone"\)/);
  assert.match(worker, /process\.exit\(1\)/);
});

test("background mode is validated and documented in the sample environment", async () => {
  const validator = await readFile(new URL("../src/config/productionConfigValidation.js", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(validator, /BACKGROUND_WORKER_MODE must be explicitly set/);
  assert.match(example, /^BACKGROUND_WORKER_MODE=standalone$/m);
});

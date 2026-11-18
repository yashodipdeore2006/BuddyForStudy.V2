import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ProgressSyncOperation } from "../src/models/ProgressSyncOperation.js";

test("progress sync receipts have a unique user-scoped operation identity", () => {
  const indexes = ProgressSyncOperation.schema.indexes();
  const unique = indexes.find(([keys, options]) =>
    options.unique === true &&
    keys.user === 1 &&
    keys.operationId === 1
  );
  assert.ok(unique, "a user + operationId unique index is required");
  assert.equal(unique[1].name, "progress_sync_user_operation_unique");

  const schemaPaths = ProgressSyncOperation.schema.paths;
  assert.equal(schemaPaths.user.isRequired, true);
  assert.equal(schemaPaths.operationId.isRequired, true);
  assert.equal(schemaPaths.requestHash.isRequired, true);
  assert.deepEqual(schemaPaths.status.enumValues, ["processing", "succeeded", "rejected", "retryable"]);
});

test("progress sync route is authenticated and protected by the learning-progress entitlement", async () => {
  const route = await readFile(new URL("../src/routes/progress.routes.js", import.meta.url), "utf8");
  const authIndex = route.indexOf("router.use(authMiddleware)");
  const syncIndex = route.indexOf('router.post("/sync"');
  assert.ok(authIndex >= 0 && syncIndex > authIndex);
  assert.match(route.slice(syncIndex), /requireFeature\\("learning_progress"\\)/);
});

test("progress sync controller derives identity from auth middleware and caps request size", async () => {
  const controller = await readFile(new URL("../src/controllers/progress.controller.js", import.meta.url), "utf8");
  const syncStart = controller.indexOf("export async function sync");
  assert.ok(syncStart >= 0);
  const syncHandler = controller.slice(syncStart);
  assert.match(syncHandler, /syncProgressOperations\\(req\.user\.userId,\s*operations\)/);
  assert.match(syncHandler, /operations\.length > MAX_PROGRESS_SYNC_BATCH_SIZE/);
  assert.doesNotMatch(syncHandler, /req\.body\.userId|req\.body\?\.userId/);
  assert.match(syncHandler, /results,\s*summary/);
});

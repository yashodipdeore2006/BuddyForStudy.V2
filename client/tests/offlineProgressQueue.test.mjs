import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isProgressOperationForAccount,
  sortProgressQueueOperations,
  selectDueProgressOperations
} from "../src/lib/offlineProgressQueue.ts";

test("offline progress operations are ordered by their account sequence", () => {
  const operations = [
    { operationId: "second", sequence: 2, createdAt: 100, accountId: "user-1" },
    { operationId: "first", sequence: 1, createdAt: 200, accountId: "user-1" },
    { operationId: "third", sequence: 3, createdAt: 50, accountId: "user-1" }
  ];
  assert.deepEqual(
    sortProgressQueueOperations(operations).map((operation) => operation.operationId),
    ["first", "second", "third"]
  );
  // The sorter must not mutate the IndexedDB read result.
  assert.equal(operations[0].operationId, "second");
});

test("offline progress operations are isolated to the authenticated account", () => {
  const operation = {
    operationId: "operation-1",
    accountId: "account-A",
    courseId: "course-1",
    itemId: "lesson-1",
    action: "complete",
    sequence: 1,
    createdAt: 100,
    updatedAt: 100,
    retryCount: 0,
    nextAttemptAt: 100,
    status: "pending"
  };

  assert.equal(isProgressOperationForAccount(operation, "account-A"), true);
  assert.equal(isProgressOperationForAccount(operation, "account-B"), false);
  assert.equal(isProgressOperationForAccount(operation, ""), false);
});

test("offline queue stores only progress action metadata and uses account-scoped IndexedDB indexes", async () => {
  const queue = await readFile(new URL("../src/lib/offlineProgressQueue.ts", import.meta.url), "utf8");
  assert.match(queue, /indexedDB\.open\(DATABASE_NAME,\s*DATABASE_VERSION\)/);
  assert.match(queue, /store\.createIndex\("accountSequence",\s*\["accountId",\s*"sequence"\]/);
  assert.match(queue, /store\.createIndex\("accountCourseSequence",\s*\["accountId",\s*"courseId",\s*"sequence"\]/);
  assert.match(queue, /operationId:\s*createOperationId\(\)/);
  assert.match(queue, /action:\s*input\.action/);
  assert.match(queue, /metadataKey = "account-sequence:" \+ accountId/);
  assert.doesNotMatch(queue, /bfs_token|Authorization|accessToken|jwt/i);
});

test("the Service Worker only wakes an open authenticated client for progress sync", async () => {
  const worker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  assert.match(worker, /BFS_PROGRESS_QUEUE_UPDATED/);
  assert.match(worker, /registration\.sync/);
  assert.match(worker, /event\.tag !== PROGRESS_SYNC_TAG/);
  assert.match(worker, /BFS_PROGRESS_SYNC_REQUESTED/);
  assert.match(worker, /self\.clients\.matchAll/);
  assert.doesNotMatch(worker, /fetch\(|Authorization|bfs_token|accessToken/i);
});

test("the app registers its Service Worker without requiring push permission", async () => {
  const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/serviceWorker.ts", import.meta.url), "utf8");
  assert.match(main, /registerApplicationServiceWorker\(\)/);
  assert.match(helper, /navigator\.serviceWorker\.register\("\/service-worker\.js"/);
  assert.doesNotMatch(helper, /Notification\.requestPermission|PushManager/);
});

test("course player restores account-scoped pending actions and saves network failures locally", async () => {
  const player = await readFile(new URL("../src/pages/CoursePlayer.tsx", import.meta.url), "utf8");
  assert.match(player, /listPendingProgressOperations\(accountId,\s*\{[\s\S]*includeDeferred:\s*true/);
  assert.match(player, /applyQueuedProgressAction\(/);
  assert.match(player, /enqueueProgressOperation\(/);
  assert.match(player, /if \(navigator\.onLine === false\)/);
  assert.match(player, /requestProgressSync\(accountId,\s*courseId\)/);
  assert.match(player, /pendingOfflineProgressCount > 0/);
});


test("a delayed retry blocks later actions for its course but not other courses", () => {
  const operations = [
    { operationId: "course-a-1", accountId: "user-1", courseId: "course-a", itemId: "lesson-1", action: "complete", sequence: 1, createdAt: 1, updatedAt: 1, retryCount: 1, nextAttemptAt: 5000, status: "pending" },
    { operationId: "course-a-2", accountId: "user-1", courseId: "course-a", itemId: "lesson-2", action: "complete", sequence: 2, createdAt: 2, updatedAt: 2, retryCount: 0, nextAttemptAt: 1000, status: "pending" },
    { operationId: "course-b-1", accountId: "user-1", courseId: "course-b", itemId: "lesson-3", action: "complete", sequence: 3, createdAt: 3, updatedAt: 3, retryCount: 0, nextAttemptAt: 1000, status: "pending" }
  ];
  assert.deepEqual(
    selectDueProgressOperations(operations, 10, 2000).map((operation) => operation.operationId),
    ["course-b-1"]
  );
  assert.deepEqual(
    selectDueProgressOperations(operations, 10, 6000).map((operation) => operation.operationId),
    ["course-a-1", "course-a-2", "course-b-1"]
  );
});

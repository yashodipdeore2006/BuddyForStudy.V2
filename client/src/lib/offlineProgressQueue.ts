export type ProgressQueueAction = "complete" | "uncomplete";
export type ProgressQueueStatus = "pending" | "blocked";

export interface ProgressQueueOperation {
  operationId: string;
  schemaVersion: 1;
  accountId: string;
  courseId: string;
  itemId: string;
  action: ProgressQueueAction;
  sequence: number;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  nextAttemptAt: number;
  status: ProgressQueueStatus;
  lastError?: string;
}

export interface EnqueueProgressOperationInput {
  accountId: string;
  courseId: string;
  itemId: string;
  action: ProgressQueueAction;
}

const DATABASE_NAME = "buddyforstudy-offline-progress";
const DATABASE_VERSION = 2;
const OPERATIONS_STORE = "progressOperations";
const METADATA_STORE = "metadata";
const BACKGROUND_SYNC_TAG = "bfs-progress-sync";
const DEFAULT_PENDING_LIMIT = 50;
const MAX_PENDING_LIMIT = 200;
const SYNC_LOCK_LEASE_MS = 2 * 60 * 1000;

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(field + " is required.");
  }
  const normalized = value.trim();
  if (normalized.length > 128) throw new RangeError(field + " is too long.");
  return normalized;
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function openProgressDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support local offline progress storage."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OPERATIONS_STORE)) {
        const store = database.createObjectStore(OPERATIONS_STORE, { keyPath: "operationId" });
        store.createIndex("accountSequence", ["accountId", "sequence"], { unique: true });
        store.createIndex("accountCourseSequence", ["accountId", "courseId", "sequence"], { unique: true });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }

      // Task 7 records predate the explicit operation schemaVersion field.
      // Upgrade them in place so an existing local queue remains synchronizable.
      if (event.oldVersion < 2 && database.objectStoreNames.contains(OPERATIONS_STORE)) {
        const transaction = request.transaction;
        const store = transaction?.objectStore(OPERATIONS_STORE);
        const cursorRequest = store?.openCursor();
        if (cursorRequest) {
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const operation = cursor.value as ProgressQueueOperation;
            if (!operation.schemaVersion) {
              operation.schemaVersion = 1;
              cursor.update(operation);
            }
            cursor.continue();
          };
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline progress storage."));
    request.onblocked = () => reject(new Error("Offline progress storage is busy in another tab. Close older BuddyForStudy tabs and retry."));
  });
}

function accountSequenceRange(accountId: string): IDBKeyRange {
  return IDBKeyRange.bound([accountId, 0], [accountId, Number.MAX_SAFE_INTEGER]);
}

function accountCourseSequenceRange(accountId: string, courseId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [accountId, courseId, 0],
    [accountId, courseId, Number.MAX_SAFE_INTEGER]
  );
}

export function sortProgressQueueOperations<T extends Pick<ProgressQueueOperation, "sequence" | "createdAt" | "operationId">>(
  operations: T[]
): T[] {
  return [...operations].sort((left, right) =>
    left.sequence - right.sequence ||
    left.createdAt - right.createdAt ||
    left.operationId.localeCompare(right.operationId)
  );
}

export function isProgressOperationForAccount(
  operation: Pick<ProgressQueueOperation, "accountId">,
  accountId: string
): boolean {
  return Boolean(accountId) && operation.accountId === accountId;
}


/**
 * Keeps each course's actions in sequence: a delayed retry blocks later
 * operations for that course only, not independent course queues.
 */
export function selectDueProgressOperations(
  operations: ProgressQueueOperation[],
  limit: number,
  now = Date.now()
): ProgressQueueOperation[] {
  const safeLimit = Math.max(1, Math.min(MAX_PENDING_LIMIT, Math.trunc(Number(limit) || DEFAULT_PENDING_LIMIT)));
  const retryBlockedCourses = new Set<string>();
  const dueOperations: ProgressQueueOperation[] = [];

  for (const operation of sortProgressQueueOperations(operations)) {
    if (operation.status === "blocked") {
      retryBlockedCourses.add(operation.courseId);
      continue;
    }
    if (operation.status !== "pending" || retryBlockedCourses.has(operation.courseId)) continue;
    if (operation.nextAttemptAt > now) {
      retryBlockedCourses.add(operation.courseId);
      continue;
    }
    dueOperations.push(operation);
    if (dueOperations.length >= safeLimit) break;
  }
  return dueOperations;
}

/**
 * Persists a learner action before any network attempt. The monotonic sequence
 * is allocated in the same IndexedDB transaction as the queue insert, so
 * multiple tabs cannot reorder actions for one account.
 */
export async function enqueueProgressOperation(
  input: EnqueueProgressOperationInput
): Promise<ProgressQueueOperation> {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const courseId = requireIdentifier(input.courseId, "courseId");
  const itemId = requireIdentifier(input.itemId, "itemId");
  if (input.action !== "complete" && input.action !== "uncomplete") {
    throw new TypeError("Progress action must be complete or uncomplete.");
  }

  const database = await openProgressDatabase();
  const now = Date.now();
  const metadataKey = "account-sequence:" + accountId;
  let createdOperation: ProgressQueueOperation | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OPERATIONS_STORE, METADATA_STORE], "readwrite");
      const operations = transaction.objectStore(OPERATIONS_STORE);
      const metadata = transaction.objectStore(METADATA_STORE);
      const currentSequenceRequest = metadata.get(metadataKey);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save offline progress."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline progress save was cancelled."));

      currentSequenceRequest.onsuccess = () => {
        const sequence = Math.max(0, Number(currentSequenceRequest.result?.value) || 0) + 1;
        createdOperation = {
          operationId: createOperationId(),
          schemaVersion: 1,
          accountId,
          courseId,
          itemId,
          action: input.action,
          sequence,
          createdAt: now,
          updatedAt: now,
          retryCount: 0,
          nextAttemptAt: now,
          status: "pending"
        };
        metadata.put({ key: metadataKey, value: sequence });
        operations.add(createdOperation);
      };
      currentSequenceRequest.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }

  if (!createdOperation) throw new Error("Offline progress operation was not saved.");
  notifyProgressQueueUpdated(accountId, courseId);
  return createdOperation;
}

export async function listPendingProgressOperations(
  accountIdValue: string,
  options: { courseId?: string; limit?: number; now?: number; includeDeferred?: boolean } = {}
): Promise<ProgressQueueOperation[]> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const limitValue = Number(options.limit ?? DEFAULT_PENDING_LIMIT);
  const limit = Math.max(1, Math.min(MAX_PENDING_LIMIT, Math.trunc(Number.isFinite(limitValue) ? limitValue : DEFAULT_PENDING_LIMIT)));
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
  const database = await openProgressDatabase();

  try {
    const operations = await new Promise<ProgressQueueOperation[]>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readonly");
      const store = transaction.objectStore(OPERATIONS_STORE);
      const index = options.courseId
        ? store.index("accountCourseSequence")
        : store.index("accountSequence");
      const range = options.courseId
        ? accountCourseSequenceRange(accountId, requireIdentifier(options.courseId, "courseId"))
        : accountSequenceRange(accountId);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as ProgressQueueOperation[]);
      request.onerror = () => reject(request.error || new Error("Unable to read pending offline progress."));
      transaction.onerror = () => reject(transaction.error || new Error("Unable to read pending offline progress."));
    });

    const accountOperations = sortProgressQueueOperations(operations).filter((operation) =>
      isProgressOperationForAccount(operation, accountId) &&
      (operation.status === "pending" || (options.includeDeferred === true && operation.status === "blocked"))
    );
    if (options.includeDeferred === true) return accountOperations.slice(0, limit);
    return selectDueProgressOperations(accountOperations, limit, now);
  } finally {
    database.close();
  }
}

export async function getBlockedProgressOperationCount(
  accountIdValue: string,
  courseId?: string
): Promise<number> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const database = await openProgressDatabase();
  try {
    const operations = await new Promise<ProgressQueueOperation[]>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readonly");
      const store = transaction.objectStore(OPERATIONS_STORE);
      const index = courseId ? store.index("accountCourseSequence") : store.index("accountSequence");
      const range = courseId
        ? accountCourseSequenceRange(accountId, requireIdentifier(courseId, "courseId"))
        : accountSequenceRange(accountId);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as ProgressQueueOperation[]);
      request.onerror = () => reject(request.error || new Error("Unable to count blocked progress actions."));
    });
    return operations.filter((operation) =>
      isProgressOperationForAccount(operation, accountId) &&
      operation.status === "blocked"
    ).length;
  } finally {
    database.close();
  }
}

export async function getPendingProgressOperationCount(
  accountIdValue: string,
  courseId?: string
): Promise<number> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const database = await openProgressDatabase();
  try {
    const operations = await new Promise<ProgressQueueOperation[]>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readonly");
      const store = transaction.objectStore(OPERATIONS_STORE);
      const index = courseId ? store.index("accountCourseSequence") : store.index("accountSequence");
      const range = courseId
        ? accountCourseSequenceRange(accountId, requireIdentifier(courseId, "courseId"))
        : accountSequenceRange(accountId);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as ProgressQueueOperation[]);
      request.onerror = () => reject(request.error || new Error("Unable to count offline progress."));
    });
    return operations.filter((operation) =>
      isProgressOperationForAccount(operation, accountId) &&
      (operation.status === "pending" || operation.status === "blocked")
    ).length;
  } finally {
    database.close();
  }
}

/** Remove only records belonging to the currently authenticated account. */
export async function removeProgressOperations(
  accountIdValue: string,
  operationIds: string[]
): Promise<number> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const ids = [...new Set(operationIds.map((id) => requireIdentifier(id, "operationId")))];
  if (!ids.length) return 0;

  const database = await openProgressDatabase();
  let removed = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OPERATIONS_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to update offline progress."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline progress update was cancelled."));

      for (const operationId of ids) {
        const request = store.get(operationId);
        request.onsuccess = () => {
          const operation = request.result as ProgressQueueOperation | undefined;
          if (!operation || !isProgressOperationForAccount(operation, accountId)) return;
          store.delete(operationId);
          removed += 1;
        };
      }
    });
  } finally {
    database.close();
  }

  if (removed) notifyProgressQueueUpdated(accountId);
  return removed;
}

export async function scheduleProgressOperationRetry(
  accountIdValue: string,
  operationIdValue: string,
  details: { retryCount: number; nextAttemptAt: number; lastError?: string }
): Promise<boolean> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const operationId = requireIdentifier(operationIdValue, "operationId");
  const database = await openProgressDatabase();
  let updated = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OPERATIONS_STORE);
      const request = store.get(operationId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to schedule offline progress retry."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline progress retry was cancelled."));
      request.onsuccess = () => {
        const operation = request.result as ProgressQueueOperation | undefined;
        if (!operation || !isProgressOperationForAccount(operation, accountId)) return;
        operation.retryCount = Math.max(0, Math.trunc(Number(details.retryCount) || 0));
        operation.nextAttemptAt = Math.max(Date.now(), Number(details.nextAttemptAt) || Date.now());
        operation.updatedAt = Date.now();
        operation.lastError = String(details.lastError || "").slice(0, 240);
        operation.status = "pending";
        store.put(operation);
        updated = true;
      };
      request.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }

  if (updated) notifyProgressQueueUpdated(accountId);
  return updated;
}

/**
 * Cross-tab account-specific lease so only one open tab drains a given queue.
 * IndexedDB serializes the read/write transaction, making acquisition atomic.
 */
export async function acquireProgressSyncLock(
  accountIdValue: string,
  ownerId: string,
  leaseMs = SYNC_LOCK_LEASE_MS
): Promise<boolean> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const owner = requireIdentifier(ownerId, "ownerId");
  const database = await openProgressDatabase();
  let acquired = false;
  const now = Date.now();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const key = "sync-lock:" + accountId;
      const request = store.get(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to acquire progress sync lock."));
      transaction.onabort = () => reject(transaction.error || new Error("Progress sync lock acquisition was cancelled."));
      request.onsuccess = () => {
        const current = request.result;
        if (current && current.ownerId !== owner && Number(current.leaseUntil) > now) return;
        store.put({
          key,
          ownerId: owner,
          leaseUntil: now + Math.max(30_000, Math.min(5 * 60_000, Number(leaseMs) || SYNC_LOCK_LEASE_MS))
        });
        acquired = true;
      };
      request.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }
  return acquired;
}

export async function renewProgressSyncLock(
  accountIdValue: string,
  ownerId: string,
  leaseMs = SYNC_LOCK_LEASE_MS
): Promise<boolean> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const owner = requireIdentifier(ownerId, "ownerId");
  const database = await openProgressDatabase();
  let renewed = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const key = "sync-lock:" + accountId;
      const request = store.get(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to renew progress sync lock."));
      transaction.onabort = () => reject(transaction.error || new Error("Progress sync lock renewal was cancelled."));
      request.onsuccess = () => {
        if (request.result?.ownerId !== owner) return;
        store.put({
          key,
          ownerId: owner,
          leaseUntil: Date.now() + Math.max(30_000, Math.min(5 * 60_000, Number(leaseMs) || SYNC_LOCK_LEASE_MS))
        });
        renewed = true;
      };
      request.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }
  return renewed;
}

export async function releaseProgressSyncLock(accountIdValue: string, ownerId: string): Promise<boolean> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const owner = requireIdentifier(ownerId, "ownerId");
  const database = await openProgressDatabase();
  let released = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const key = "sync-lock:" + accountId;
      const request = store.get(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to release progress sync lock."));
      transaction.onabort = () => reject(transaction.error || new Error("Progress sync lock release was cancelled."));
      request.onsuccess = () => {
        if (request.result?.ownerId !== owner) return;
        store.delete(key);
        released = true;
      };
      request.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }
  return released;
}

export async function markProgressOperationsBlocked(
  accountIdValue: string,
  operationIds: string[],
  details: { errorCode?: string; message?: string }
): Promise<number> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const ids = new Set(operationIds.map((id) => requireIdentifier(id, "operationId")));
  if (!ids.size) return 0;
  const database = await openProgressDatabase();
  let updated = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OPERATIONS_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to mark progress actions for review."));
      transaction.onabort = () => reject(transaction.error || new Error("Progress action update was cancelled."));
      for (const operationId of ids) {
        const request = store.get(operationId);
        request.onsuccess = () => {
          const operation = request.result as ProgressQueueOperation | undefined;
          if (!operation || !isProgressOperationForAccount(operation, accountId)) return;
          operation.status = "blocked";
          operation.lastError = String(details.message || details.errorCode || "This progress action needs attention.").slice(0, 240);
          operation.updatedAt = Date.now();
          store.put(operation);
          updated += 1;
        };
      }
    });
  } finally {
    database.close();
  }
  if (updated) notifyProgressQueueUpdated(accountId);
  return updated;
}

export async function retryBlockedProgressOperations(
  accountIdValue: string,
  courseIdValue?: string
): Promise<number> {
  const accountId = requireIdentifier(accountIdValue, "accountId");
  const courseId = courseIdValue ? requireIdentifier(courseIdValue, "courseId") : null;
  const database = await openProgressDatabase();
  let updated = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OPERATIONS_STORE);
      const index = courseId ? store.index("accountCourseSequence") : store.index("accountSequence");
      const range = courseId
        ? accountCourseSequenceRange(accountId, courseId)
        : accountSequenceRange(accountId);
      const request = index.getAll(range);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to retry blocked progress actions."));
      transaction.onabort = () => reject(transaction.error || new Error("Progress retry was cancelled."));
      request.onsuccess = () => {
        for (const operation of request.result as ProgressQueueOperation[]) {
          if (!isProgressOperationForAccount(operation, accountId) || operation.status !== "blocked") continue;
          operation.status = "pending";
          operation.nextAttemptAt = Date.now();
          operation.lastError = "";
          operation.updatedAt = Date.now();
          store.put(operation);
          updated += 1;
        }
      };
      request.onerror = () => transaction.abort();
    });
  } finally {
    database.close();
  }
  if (updated) notifyProgressQueueUpdated(accountId, courseId || undefined);
  return updated;
}

/**
 * Signals an authenticated page to flush the queue. The Service Worker never
 * reads the queue or stores the access token; it only wakes an open client.
 */
export function requestProgressSync(accountId?: string, courseId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bfs:progress-sync-requested", {
      detail: { accountId, courseId }
    }));
  }
  notifyServiceWorkerQueueChanged();
}

function notifyProgressQueueUpdated(accountId?: string, courseId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bfs:progress-queue-updated", {
      detail: { accountId, courseId }
    }));
  }
  notifyServiceWorkerQueueChanged();
}

function notifyServiceWorkerQueueChanged(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: "BFS_PROGRESS_QUEUE_UPDATED" });
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "BFS_PROGRESS_QUEUE_UPDATED" });
  }).catch(() => {
    // The foreground queue remains durable even if background sync is unavailable.
  });
}

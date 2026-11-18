import { ApiError, apiFetch, getToken } from "@/lib/api";
import {
  acquireProgressSyncLock,
  getPendingProgressOperationCount,
  listPendingProgressOperations,
  markProgressOperationsBlocked,
  releaseProgressSyncLock,
  removeProgressOperations,
  renewProgressSyncLock,
  scheduleProgressOperationRetry,
  type ProgressQueueOperation
} from "@/lib/offlineProgressQueue";

const SERVER_BATCH_LIMIT = 50;
const MAX_BATCHES_PER_RUN = 5;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

type ServerOperationResult = {
  operationId: string;
  status: "applied" | "duplicate" | "in_progress" | "retryable" | "rejected" | "conflict";
  retryAfterMs?: number;
  errorCode?: string;
  message?: string;
};

export interface ProgressSyncRunResult {
  status: "synced" | "nothing_to_sync" | "offline" | "unauthenticated" | "busy" | "partial" | "blocked" | "unavailable";
  applied: number;
  blocked: number;
  retrying: number;
  remaining: number;
}

function createSyncOwnerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return "tab-" + crypto.randomUUID();
  }
  return "tab-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
}

function retryDelay(retryCount: number, serverDelay?: number): number {
  if (Number.isFinite(serverDelay) && Number(serverDelay) > 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(1000, Number(serverDelay)));
  }
  const exponent = Math.min(10, Math.max(0, Math.trunc(retryCount)));
  const base = Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** exponent));
  return Math.min(MAX_RETRY_DELAY_MS, base + Math.floor(Math.random() * 500));
}

function emitProgressSyncStatus(detail: ProgressSyncRunResult): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bfs:progress-sync-status", { detail }));
}

async function retryBatch(
  accountId: string,
  operations: ProgressQueueOperation[],
  message: string,
  serverDelay?: number
): Promise<void> {
  await Promise.all(operations.map((operation) => {
    const retryCount = operation.retryCount + 1;
    return scheduleProgressOperationRetry(accountId, operation.operationId, {
      retryCount,
      nextAttemptAt: Date.now() + retryDelay(retryCount, serverDelay),
      lastError: message
    });
  }));
}

/**
 * Drains only the current account's due operations. The server derives userId
 * from the bearer token and deduplicates every immutable operationId.
 */
export async function syncPendingProgressForAccount(accountIdValue: string): Promise<ProgressSyncRunResult> {
  const accountId = String(accountIdValue || "").trim();
  const result: ProgressSyncRunResult = {
    status: "nothing_to_sync",
    applied: 0,
    blocked: 0,
    retrying: 0,
    remaining: 0
  };

  if (!accountId || !getToken()) {
    result.status = "unauthenticated";
    return result;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    result.status = "offline";
    return result;
  }

  const ownerId = createSyncOwnerId();
  let hasLock = false;
  let lastBatch: ProgressQueueOperation[] = [];

  try {
    hasLock = await acquireProgressSyncLock(accountId, ownerId);
    if (!hasLock) {
      result.status = "busy";
      return result;
    }

    for (let batchNumber = 0; batchNumber < MAX_BATCHES_PER_RUN; batchNumber += 1) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        result.status = "offline";
        break;
      }
      if (!await renewProgressSyncLock(accountId, ownerId)) {
        result.status = "busy";
        break;
      }

      const operations = await listPendingProgressOperations(accountId, {
        limit: SERVER_BATCH_LIMIT
      });
      if (!operations.length) break;
      lastBatch = operations;

      const payload = {
        operations: operations.map((operation) => ({
          operationId: operation.operationId,
          schemaVersion: operation.schemaVersion,
          courseId: operation.courseId,
          itemId: operation.itemId,
          action: operation.action,
          clientSequence: operation.sequence,
          createdAt: operation.createdAt
        }))
      };

      let response: { results?: ServerOperationResult[] };
      try {
        response = await apiFetch("/api/progress/sync", {
          method: "POST",
          body: JSON.stringify(payload),
          expectedAccountId: accountId
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          result.status = "unauthenticated";
          break;
        }
        if (error instanceof ApiError && error.status === 403) {
          const ids = operations.map((operation) => operation.operationId);
          await markProgressOperationsBlocked(accountId, ids, {
            errorCode: "LEARNING_PROGRESS_NOT_INCLUDED",
            message: "Learning progress synchronization is not available on the current plan. Review your plan and retry."
          });
          result.blocked += ids.length;
          result.status = "blocked";
          break;
        }
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 &&
            error.status !== 408 && error.status !== 409 && error.status !== 429) {
          const ids = operations.map((operation) => operation.operationId);
          await markProgressOperationsBlocked(accountId, ids, {
            errorCode: "PROGRESS_SYNC_REQUEST_REJECTED",
            message: "The server rejected this progress sync request. Review the saved action and retry."
          });
          result.blocked += ids.length;
          result.status = "blocked";
          break;
        }

        const message = error instanceof Error ? error.message : "Progress synchronization is temporarily unavailable.";
        await retryBatch(accountId, operations, message);
        result.retrying += operations.length;
        result.status = "partial";
        break;
      }

      const responseResults = Array.isArray(response?.results) ? response.results : [];
      const resultsById = new Map(responseResults.map((entry) => [entry.operationId, entry]));
      const removeIds: string[] = [];
      const blocked: Array<{ operationId: string; errorCode: string; message: string }> = [];
      const retrying: Array<{ operation: ProgressQueueOperation; message: string; delay?: number }> = [];

      for (const operation of operations) {
        const operationResult = resultsById.get(operation.operationId);
        if (operationResult?.status === "applied" || operationResult?.status === "duplicate") {
          removeIds.push(operation.operationId);
          continue;
        }
        if (operationResult?.status === "rejected" || operationResult?.status === "conflict") {
          blocked.push({
            operationId: operation.operationId,
            errorCode: operationResult.errorCode || "PROGRESS_ACTION_NEEDS_ATTENTION",
            message: operationResult.message || operationResult.errorCode || "This progress action needs attention."
          });
          continue;
        }
        if (operationResult?.status === "retryable" && operationResult.errorCode === "COURSE_ACCESS_DENIED") {
          blocked.push({
            operationId: operation.operationId,
            errorCode: operationResult.errorCode,
            message: operationResult.message || "Restore course access before retrying."
          });
          continue;
        }
        retrying.push({
          operation,
          message: operationResult?.message || "The server has not finished this progress action yet.",
          delay: operationResult?.retryAfterMs
        });
      }

      if (removeIds.length) {
        await removeProgressOperations(accountId, removeIds);
        result.applied += removeIds.length;
      }
      if (blocked.length) {
        for (const entry of blocked) {
          await markProgressOperationsBlocked(accountId, [entry.operationId], {
            errorCode: entry.errorCode,
            message: entry.message
          });
        }
        result.blocked += blocked.length;
      }
      if (retrying.length) {
        await Promise.all(retrying.map(({ operation, message, delay }) => {
          const retryCount = operation.retryCount + 1;
          return scheduleProgressOperationRetry(accountId, operation.operationId, {
            retryCount,
            nextAttemptAt: Date.now() + retryDelay(retryCount, delay),
            lastError: message
          });
        }));
        result.retrying += retrying.length;
      }

      if (!removeIds.length) {
        result.status = blocked.length ? "blocked" : "partial";
        // Retryable and in-progress results have a future nextAttemptAt. Avoid
        // an immediate hot loop; independent course operations can run in the
        // next browser sync opportunity.
        break;
      }
      result.status = result.blocked || result.retrying ? "partial" : "synced";
    }

    result.remaining = await getPendingProgressOperationCount(accountId);
    if (result.remaining > 0 && result.status === "nothing_to_sync") {
      result.status = "partial";
    }
    if (result.remaining > 0 && result.applied > 0) {
      // Encourage another best-effort run for batches beyond the per-run cap.
      const nextOperations = await listPendingProgressOperations(accountId, { limit: 1 });
      if (nextOperations.length && result.retrying === 0 && result.blocked === 0) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("bfs:progress-sync-requested", { detail: { accountId } }));
        }
      }
    }
    emitProgressSyncStatus(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Progress synchronization could not finish.";
    if (lastBatch.length) {
      try {
        await retryBatch(accountId, lastBatch, message);
        result.retrying += lastBatch.length;
      } catch {
        // Preserve the durable operations if the local storage write also fails.
      }
    }
    result.status = "unavailable";
    emitProgressSyncStatus(result);
    return result;
  } finally {
    if (hasLock) {
      await releaseProgressSyncLock(accountId, ownerId).catch(() => false);
    }
  }
}

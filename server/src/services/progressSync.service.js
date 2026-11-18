import { createHash, randomUUID } from "node:crypto";
import { ProgressSyncOperation } from "../models/ProgressSyncOperation.js";
import { completeItem, uncompleteItem } from "./progress.service.js";
import { isValidObjectId } from "../utils/ids.js";

export const MAX_PROGRESS_SYNC_BATCH_SIZE = 50;
export const PROGRESS_SYNC_LEASE_MS = 2 * 60 * 1000;
const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProgressSyncOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Each progress operation must be an object." };
  }

  const operationId = typeof value.operationId === "string" ? value.operationId.trim().toLowerCase() : "";
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    return { operationId: operationId.slice(0, 64), error: "A valid operationId is required." };
  }

  if (Number(value.schemaVersion) !== 1) {
    return { operationId, error: "Unsupported progress operation schema version." };
  }

  const courseId = typeof value.courseId === "string" ? value.courseId.trim().toLowerCase() : "";
  const itemId = typeof value.itemId === "string" ? value.itemId.trim().toLowerCase() : "";
  if (!isValidObjectId(courseId) || !isValidObjectId(itemId)) {
    return { operationId, error: "Invalid course or lesson identifier." };
  }

  if (value.action !== "complete" && value.action !== "uncomplete") {
    return { operationId, error: "Progress action must be complete or uncomplete." };
  }

  const clientSequence = Number(value.clientSequence);
  if (!Number.isSafeInteger(clientSequence) || clientSequence < 1) {
    return { operationId, error: "A positive clientSequence is required." };
  }

  return {
    operationId,
    schemaVersion: 1,
    courseId,
    itemId,
    action: value.action,
    clientSequence
  };
}

export function hashProgressSyncOperation(operation) {
  const canonical = JSON.stringify({
    schemaVersion: operation.schemaVersion,
    courseId: operation.courseId,
    itemId: operation.itemId,
    action: operation.action
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function publicFailureFor(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  if (status === 403) {
    // Keep the receipt retryable: the learner may restore enrollment or plan
    // access before manually retrying the same immutable operationId.
    return {
      status: "retryable",
      errorStatus: 403,
      errorCode: "COURSE_ACCESS_DENIED",
      message: "Your access to this course has changed. Restore course access before retrying."
    };
  }
  if (status === 404) {
    return {
      status: "rejected",
      errorStatus: 404,
      errorCode: "LEARNING_ITEM_NOT_FOUND",
      message: "This course or learning item is no longer available."
    };
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429) {
    return {
      status: "rejected",
      errorStatus: status,
      errorCode: "INVALID_PROGRESS_OPERATION",
      message: "This progress action could not be applied. Review the course and try again."
    };
  }
  return {
    status: "retryable",
    errorStatus: status >= 400 && status <= 599 ? status : 503,
    errorCode: "PROGRESS_SYNC_TEMPORARILY_UNAVAILABLE",
    message: "Progress synchronization is temporarily unavailable. The action is safe to retry."
  };
}

function currentStateResult(record) {
  if (!record) return { status: "retryable", retryAfterMs: 3000 };
  if (record.status === "succeeded") return { status: "duplicate" };
  if (record.status === "rejected") {
    return {
      status: "rejected",
      errorCode: record.errorCode || "PROGRESS_OPERATION_REJECTED",
      message: record.errorMessage || "This progress action could not be applied."
    };
  }
  if (record.status === "processing") return { status: "in_progress", retryAfterMs: 3000 };
  return { status: "retryable", retryAfterMs: 5000 };
}

export function createMongoProgressSyncStore(Model = ProgressSyncOperation) {
  return {
    async create(record) {
      try {
        const saved = await new Model(record).save();
        return { created: true, record: saved };
      } catch (error) {
        if (error?.code === 11000) return { created: false };
        throw error;
      }
    },

    find(userId, operationId) {
      return Model.findOne({ user: userId, operationId });
    },

    claimRetryable({ recordId, requestHash, claimToken, now, leaseUntil }) {
      return Model.findOneAndUpdate(
        {
          _id: recordId,
          requestHash,
          $or: [
            { status: "retryable" },
            { status: "processing", leaseUntil: { $lte: now } }
          ]
        },
        {
          $set: {
            status: "processing",
            leaseToken: claimToken,
            leaseUntil,
            errorStatus: null,
            errorCode: "",
            errorMessage: ""
          },
          $inc: { attempts: 1 }
        },
        { new: true }
      );
    },

    finish({ recordId, claimToken, values }) {
      return Model.findOneAndUpdate(
        { _id: recordId, status: "processing", leaseToken: claimToken },
        {
          $set: {
            ...values,
            leaseToken: null,
            leaseUntil: null
          }
        },
        { new: true }
      );
    }
  };
}

export async function processProgressSyncOperation({
  userId,
  value,
  store = createMongoProgressSyncStore(),
  applyAction = async (identity, operation) => (
    operation.action === "complete"
      ? completeItem(identity, operation.courseId, operation.itemId)
      : uncompleteItem(identity, operation.courseId, operation.itemId)
  ),
  now = () => new Date(),
  createClaimToken = randomUUID
}) {
  const normalized = normalizeProgressSyncOperation(value);
  const operationId = normalized.operationId || "";
  if (normalized.error) {
    return {
      operationId,
      status: "rejected",
      errorCode: "INVALID_PROGRESS_OPERATION",
      message: normalized.error
    };
  }

  const requestHash = hashProgressSyncOperation(normalized);
  const claimedAt = now();
  const claimToken = createClaimToken();
  const leaseUntil = new Date(claimedAt.getTime() + PROGRESS_SYNC_LEASE_MS);
  const createResult = await store.create({
    user: userId,
    operationId,
    requestHash,
    course: normalized.courseId,
    item: normalized.itemId,
    action: normalized.action,
    clientSequence: normalized.clientSequence,
    status: "processing",
    leaseToken: claimToken,
    leaseUntil,
    attempts: 1
  });

  let receipt = createResult.record;
  if (!createResult.created) {
    receipt = await store.find(userId, operationId);
    if (!receipt) return { operationId, status: "retryable", retryAfterMs: 3000 };

    if (receipt.requestHash !== requestHash) {
      return {
        operationId,
        status: "conflict",
        errorCode: "OPERATION_ID_REUSED",
        message: "This operationId was already used for a different progress action."
      };
    }

    if (receipt.status === "succeeded" || receipt.status === "rejected") {
      return { operationId, ...currentStateResult(receipt) };
    }

    if (receipt.status === "processing" && receipt.leaseUntil && new Date(receipt.leaseUntil) > claimedAt) {
      return { operationId, ...currentStateResult(receipt) };
    }

    receipt = await store.claimRetryable({
      recordId: receipt._id,
      requestHash,
      claimToken,
      now: claimedAt,
      leaseUntil
    });
    if (!receipt) {
      const latest = await store.find(userId, operationId);
      return { operationId, ...currentStateResult(latest) };
    }
  }

  try {
    await applyAction(userId, normalized);
    const saved = await store.finish({
      recordId: receipt._id,
      claimToken,
      values: {
        status: "succeeded",
        completedAt: now(),
        errorStatus: null,
        errorCode: "",
        errorMessage: ""
      }
    });
    if (!saved) return { operationId, status: "in_progress", retryAfterMs: 3000 };
    return { operationId, status: "applied" };
  } catch (error) {
    const failure = publicFailureFor(error);
    await store.finish({
      recordId: receipt._id,
      claimToken,
      values: {
        status: failure.status,
        errorStatus: failure.errorStatus,
        errorCode: failure.errorCode,
        errorMessage: failure.message
      }
    });
    return {
      operationId,
      status: failure.status,
      errorCode: failure.errorCode,
      message: failure.message,
      retryAfterMs: failure.status === "retryable" ? 5000 : undefined
    };
  }
}

export async function syncProgressOperations(userId, operations, options = {}) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_PROGRESS_SYNC_BATCH_SIZE) {
    const error = new Error("Progress sync batch must contain between 1 and " + MAX_PROGRESS_SYNC_BATCH_SIZE + " operations.");
    error.status = 400;
    throw error;
  }

  const store = options.store || createMongoProgressSyncStore();
  const results = [];
  // Preserve the browser's account sequence order within each request. Client
  // requests are bounded, so sequential processing also limits DB contention.
  for (const operation of operations) {
    results.push(await processProgressSyncOperation({
      userId,
      value: operation,
      store,
      applyAction: options.applyAction,
      now: options.now,
      createClaimToken: options.createClaimToken
    }));
  }
  return results;
}

import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/progress-sync-service-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const {
  MAX_PROGRESS_SYNC_BATCH_SIZE,
  normalizeProgressSyncOperation,
  hashProgressSyncOperation,
  processProgressSyncOperation,
  syncProgressOperations
} = await import("../src/services/progressSync.service.js");

const USER_ID = "507f191e810c19729de860ea";
const COURSE_ID = "507f1f77bcf86cd799439011";
const LESSON_ID = "507f1f77bcf86cd799439012";
const OPERATION_ID = "1a2b3c4d-1234-4234-8234-123456789abc";

function validOperation(overrides = {}) {
  return {
    operationId: OPERATION_ID,
    schemaVersion: 1,
    courseId: COURSE_ID,
    itemId: LESSON_ID,
    action: "complete",
    clientSequence: 1,
    ...overrides
  };
}

function createMemoryStore() {
  const records = new Map();
  let nextId = 1;
  return {
    records,
    async create(record) {
      if (records.has(record.operationId)) return { created: false };
      const saved = { ...record, _id: "receipt-" + nextId++ };
      records.set(record.operationId, saved);
      return { created: true, record: saved };
    },
    async find(userId, operationId) {
      const record = records.get(operationId);
      return record && String(record.user) === String(userId) ? record : null;
    },
    async findEarlierProcessing(userId, courseId, clientSequence) {
      return [...records.values()].find((record) =>
        String(record.user) === String(userId) &&
        String(record.course) === String(courseId) &&
        Number(record.clientSequence) < Number(clientSequence) &&
        record.status === "processing"
      ) || null;
    },
    async claimRetryable({ recordId, requestHash, claimToken, now, leaseUntil }) {
      const record = [...records.values()].find((entry) => entry._id === recordId);
      if (!record || record.requestHash !== requestHash) return null;
      const retryable = record.status === "retryable";
      const expired = record.status === "processing" && record.leaseUntil && new Date(record.leaseUntil) <= now;
      if (!retryable && !expired) return null;
      Object.assign(record, {
        status: "processing",
        leaseToken: claimToken,
        leaseUntil,
        attempts: record.attempts + 1,
        errorStatus: null,
        errorCode: "",
        errorMessage: ""
      });
      return record;
    },
    async finish({ recordId, claimToken, values }) {
      const record = [...records.values()].find((entry) => entry._id === recordId);
      if (!record || record.status !== "processing" || record.leaseToken !== claimToken) return null;
      Object.assign(record, values, { leaseToken: null, leaseUntil: null });
      return record;
    }
  };
}

function deterministicClock() {
  let value = new Date("2026-11-18T14:30:00.000Z");
  return () => new Date(value.getTime());
}

function deterministicTokens() {
  let count = 0;
  return () => "claim-token-" + (++count);
}

test("progress sync operation normalization enforces schema, ObjectIds, UUID and sequence", () => {
  const normalized = normalizeProgressSyncOperation(validOperation());
  assert.deepEqual(normalized, {
    operationId: OPERATION_ID,
    schemaVersion: 1,
    courseId: COURSE_ID,
    itemId: LESSON_ID,
    action: "complete",
    clientSequence: 1
  });
  assert.match(hashProgressSyncOperation(normalized), /^[0-9a-f]{64}$/);
  assert.notEqual(
    hashProgressSyncOperation(normalized),
    hashProgressSyncOperation({ ...normalized, clientSequence: 2 }),
    "the immutable sequence is part of the idempotency fingerprint"
  );
  assert.match(normalizeProgressSyncOperation(validOperation({ action: "remove" })).error, /action/i);
  assert.match(normalizeProgressSyncOperation(validOperation({ schemaVersion: 9 })).error, /schema/i);
  assert.match(normalizeProgressSyncOperation(validOperation({ clientSequence: 0 })).error, /clientSequence/i);
  assert.match(normalizeProgressSyncOperation(validOperation({ itemId: "not-an-object-id" })).error, /identifier/i);
  assert.match(normalizeProgressSyncOperation(validOperation({ operationId: "not-a-uuid" })).error, /operationId/i);
});

test("replaying a succeeded operation returns duplicate without applying progress twice", async () => {
  const store = createMemoryStore();
  let applications = 0;
  const dependencies = {
    userId: USER_ID,
    value: validOperation(),
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => { applications += 1; }
  };

  const first = await processProgressSyncOperation(dependencies);
  const replay = await processProgressSyncOperation(dependencies);

  assert.equal(first.status, "applied");
  assert.equal(replay.status, "duplicate");
  assert.equal(applications, 1);
  assert.equal(store.records.get(OPERATION_ID).status, "succeeded");
});

test("reusing an operationId for a different progress action is rejected as a conflict", async () => {
  const store = createMemoryStore();
  let applications = 0;
  const dependencies = {
    userId: USER_ID,
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => { applications += 1; }
  };

  assert.equal((await processProgressSyncOperation({ ...dependencies, value: validOperation() })).status, "applied");
  const conflict = await processProgressSyncOperation({
    ...dependencies,
    value: validOperation({ action: "uncomplete" })
  });

  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.errorCode, "OPERATION_ID_REUSED");
  assert.equal(applications, 1);
});

test("a live processing lease prevents concurrent duplicate execution", async () => {
  const store = createMemoryStore();
  let applications = 0;
  const createClaimToken = deterministicTokens();
  const now = deterministicClock();
  const normalized = normalizeProgressSyncOperation(validOperation());
  const requestHash = hashProgressSyncOperation(normalized);
  await store.create({
    user: USER_ID,
    operationId: OPERATION_ID,
    requestHash,
    status: "processing",
    leaseToken: "other-worker",
    leaseUntil: new Date("2026-11-18T14:31:00.000Z"),
    attempts: 1
  });

  const result = await processProgressSyncOperation({
    userId: USER_ID,
    value: validOperation(),
    store,
    now,
    createClaimToken,
    applyAction: async () => { applications += 1; }
  });

  assert.equal(result.status, "in_progress");
  assert.equal(applications, 0);
});

test("retryable operation receipts can be reclaimed and successfully applied", async () => {
  const store = createMemoryStore();
  let applications = 0;
  let fail = true;
  const dependencies = {
    userId: USER_ID,
    value: validOperation(),
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => {
      applications += 1;
      if (fail) {
        const error = new Error("database unavailable");
        error.status = 503;
        throw error;
      }
    }
  };

  const first = await processProgressSyncOperation(dependencies);
  fail = false;
  const second = await processProgressSyncOperation(dependencies);

  assert.equal(first.status, "retryable");
  assert.equal(second.status, "applied");
  assert.equal(applications, 2);
  assert.equal(store.records.get(OPERATION_ID).attempts, 2);
});

test("permanent missing-lesson errors stay rejected and are returned consistently on replay", async () => {
  const store = createMemoryStore();
  let applications = 0;
  const dependencies = {
    userId: USER_ID,
    value: validOperation(),
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => {
      applications += 1;
      const error = new Error("Active enrollment required");
      error.status = 404;
      throw error;
    }
  };

  const first = await processProgressSyncOperation(dependencies);
  const replay = await processProgressSyncOperation(dependencies);

  assert.equal(first.status, "rejected");
  assert.equal(first.errorCode, "LEARNING_ITEM_NOT_FOUND");
  assert.equal(replay.status, "rejected");
  assert.equal(applications, 1);
});

test("the batch processor preserves operation order and enforces the batch cap", async () => {
  const store = createMemoryStore();
  const order = [];
  const now = deterministicClock();
  const createClaimToken = deterministicTokens();
  const operations = [
    validOperation({
      operationId: "2a2b3c4d-1234-4234-8234-123456789abc",
      clientSequence: 2,
      action: "uncomplete"
    }),
    validOperation()
  ];
  const results = await syncProgressOperations(USER_ID, operations, {
    store,
    now,
    createClaimToken,
    applyAction: async (_userId, operation) => { order.push(operation.clientSequence); }
  });

  assert.deepEqual(order, [1, 2]);
  assert.deepEqual(results.map((result) => result.status), ["applied", "applied"]);
  assert.equal(MAX_PROGRESS_SYNC_BATCH_SIZE, 50);
  await assert.rejects(
    syncProgressOperations(USER_ID, Array(51).fill(validOperation()), { store }),
    /between 1 and 50/
  );
});

test("invalid operations return a terminal per-operation rejection without touching the store", async () => {
  let storeCalls = 0;
  const store = {
    async create() { storeCalls += 1; return { created: false }; },
    async find() { storeCalls += 1; return null; },
    async claimRetryable() { storeCalls += 1; return null; },
    async finish() { storeCalls += 1; return null; }
  };

  const result = await processProgressSyncOperation({
    userId: USER_ID,
    value: validOperation({ action: "toggle" }),
    store
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.errorCode, "INVALID_PROGRESS_OPERATION");
  assert.equal(storeCalls, 0);
});


test("course access failures can be retried with the same operationId after access is restored", async () => {
  const store = createMemoryStore();
  let accessRestored = false;
  let applications = 0;
  const dependencies = {
    userId: USER_ID,
    value: validOperation(),
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => {
      applications += 1;
      if (!accessRestored) {
        const error = new Error("Course access unavailable");
        error.status = 403;
        throw error;
      }
    }
  };

  const first = await processProgressSyncOperation(dependencies);
  accessRestored = true;
  const second = await processProgressSyncOperation(dependencies);

  assert.equal(first.status, "retryable");
  assert.equal(first.errorCode, "COURSE_ACCESS_DENIED");
  assert.equal(second.status, "applied");
  assert.equal(applications, 2);
});


test("an unresolved earlier operation blocks later actions for the same course in a batch", async () => {
  const store = createMemoryStore();
  const attempts = [];
  const operations = [
    validOperation(),
    validOperation({
      operationId: "2a2b3c4d-1234-4234-8234-123456789abc",
      clientSequence: 2,
      action: "uncomplete"
    }),
    validOperation({
      operationId: "3a2b3c4d-1234-4234-8234-123456789abc",
      courseId: "507f1f77bcf86cd799439099",
      clientSequence: 3,
      action: "complete"
    })
  ];

  const results = await syncProgressOperations(USER_ID, operations, {
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async (_userId, operation) => {
      attempts.push(operation.clientSequence);
      if (operation.clientSequence === 1) {
        const error = new Error("Temporary service failure");
        error.status = 503;
        throw error;
      }
    }
  });

  assert.deepEqual(attempts, [1, 3], "later same-course action must not overtake the retryable first action");
  assert.deepEqual(results.map((result) => result.status), ["retryable", "retryable", "applied"]);
  assert.equal(results[1].errorCode, "EARLIER_PROGRESS_ACTION_PENDING");
});


test("an operation waits while an earlier same-course receipt is still processing", async () => {
  const store = createMemoryStore();
  store.records.set(OPERATION_ID, {
    _id: "earlier-receipt",
    user: USER_ID,
    operationId: OPERATION_ID,
    requestHash: "a".repeat(64),
    course: COURSE_ID,
    item: LESSON_ID,
    action: "complete",
    clientSequence: 1,
    status: "processing",
    leaseToken: "earlier-owner",
    leaseUntil: new Date("2026-11-18T14:31:00.000Z"),
    attempts: 1
  });
  let applications = 0;
  const laterOperation = validOperation({
    operationId: "2a2b3c4d-1234-4234-8234-123456789abc",
    clientSequence: 2,
    action: "uncomplete"
  });

  const result = await processProgressSyncOperation({
    userId: USER_ID,
    value: laterOperation,
    store,
    now: deterministicClock(),
    createClaimToken: deterministicTokens(),
    applyAction: async () => { applications += 1; }
  });

  assert.equal(result.status, "retryable");
  assert.equal(result.errorCode, "EARLIER_PROGRESS_ACTION_PENDING");
  assert.equal(applications, 0);
  assert.equal(store.records.get(laterOperation.operationId).status, "retryable");
});

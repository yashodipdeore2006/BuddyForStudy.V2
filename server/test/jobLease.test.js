import test from "node:test";
import assert from "node:assert/strict";
import { JobLease } from "../src/models/JobLease.js";
import {
  acquireJobLease,
  isJobLeaseOwned,
  renewJobLease,
  releaseJobLease,
  DEFAULT_JOB_LEASE_DURATION_MS,
  JOB_LEASE_KEYS
} from "../src/services/jobLease.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) {
      target[key] = original;
    }
  }
}

const now = new Date("2026-11-18T12:00:00.000Z");

test("job lease schema enforces a unique job key and indexes lease expiry", () => {
  const indexes = JobLease.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.jobKey === 1 && options.unique === true && options.name === "job_lease_key_unique"
  ));
  assert.ok(indexes.some(([fields, options]) =>
    fields.leaseUntil === 1 && options.name === "job_lease_expiry_lookup"
  ));
});

test("lease acquisition atomically claims an absent or expired job and advances its fencing token", async () => {
  let captured;
  const lease = { jobKey: JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE, ownerId: "api-instance-1", fencingToken: 4 };

  await withMocks([[JobLease, {
    findOneAndUpdate: async (...args) => {
      captured = args;
      return lease;
    }
  }]], async () => {
    const result = await acquireJobLease({
      jobKey: JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE,
      ownerId: "api-instance-1",
      leaseDurationMs: 90_000,
      now
    });
    assert.equal(result, lease);
  });

  assert.equal(captured[0].jobKey, JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE);
  assert.equal(captured[0].$or[0].leaseUntil.$lte.toISOString(), now.toISOString());
  assert.equal(captured[0].$or[1].leaseUntil, null);
  assert.equal(captured[1].$set.ownerId, "api-instance-1");
  assert.match(captured[1].$set.leaseToken, /^[0-9a-f-]{36}$/i);
  assert.equal(captured[1].$set.leaseUntil.toISOString(), "2026-11-18T12:01:30.000Z");
  assert.equal(captured[1].$set.acquiredAt.toISOString(), now.toISOString());
  assert.equal(captured[1].$set.releasedAt, null);
  assert.equal(captured[1].$inc.fencingToken, 1);
  assert.equal(captured[2].upsert, true);
  assert.equal(captured[2].new, true);
  assert.equal(captured[2].setDefaultsOnInsert, false);
});

test("duplicate-key acquisition race is treated as lease contention", async () => {
  await withMocks([[JobLease, {
    findOneAndUpdate: async () => {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
  }]], async () => {
    const result = await acquireJobLease({
      jobKey: "announcement-dispatch",
      ownerId: "worker-instance-2",
      now
    });
    assert.equal(result, null);
  });
});

test("non-contention acquisition errors are propagated", async () => {
  const failure = new Error("MongoDB unavailable");
  await withMocks([[JobLease, {
    findOneAndUpdate: async () => { throw failure; }
  }]], async () => {
    await assert.rejects(
      acquireJobLease({ jobKey: "announcement-dispatch", ownerId: "worker-instance-2", now }),
      failure
    );
  });
});

test("lease renewal requires the active owner and token and extends expiry", async () => {
  let captured;
  const renewed = { jobKey: "announcement-dispatch", ownerId: "worker-instance-2" };
  await withMocks([[JobLease, {
    findOneAndUpdate: async (...args) => {
      captured = args;
      return renewed;
    }
  }]], async () => {
    const result = await renewJobLease({
      jobKey: "announcement-dispatch",
      ownerId: "worker-instance-2",
      leaseToken: "owner-token",
      leaseDurationMs: 120_000,
      now
    });
    assert.equal(result, renewed);
  });

  assert.deepEqual(captured[0], {
    jobKey: "announcement-dispatch",
    ownerId: "worker-instance-2",
    leaseToken: "owner-token",
    leaseUntil: { $gt: now }
  });
  assert.equal(captured[1].$set.leaseUntil.toISOString(), "2026-11-18T12:02:00.000Z");
  assert.equal(captured[1].$set.renewedAt.toISOString(), now.toISOString());
  assert.equal(captured[1].$set.releasedAt, null);
  assert.equal(captured[2].new, true);
});

test("an expired or replaced lease cannot be renewed", async () => {
  let captured;
  await withMocks([[JobLease, {
    findOneAndUpdate: async (...args) => {
      captured = args;
      return null;
    }
  }]], async () => {
    const result = await renewJobLease({
      jobKey: "announcement-dispatch",
      ownerId: "old-worker",
      leaseToken: "old-token",
      now
    });
    assert.equal(result, null);
  });
  assert.deepEqual(captured[0].leaseUntil, { $gt: now });
  assert.equal(captured[0].ownerId, "old-worker");
  assert.equal(captured[0].leaseToken, "old-token");
});

test("lease release expires only the matching owner-token pair", async () => {
  let captured;
  await withMocks([[JobLease, {
    findOneAndUpdate: async (...args) => {
      captured = args;
      return { jobKey: "background-maintenance" };
    }
  }]], async () => {
    const released = await releaseJobLease({
      jobKey: "background-maintenance",
      ownerId: "api-instance-1",
      leaseToken: "current-token",
      now
    });
    assert.equal(released, true);
  });

  assert.deepEqual(captured[0], {
    jobKey: "background-maintenance",
    ownerId: "api-instance-1",
    leaseToken: "current-token"
  });
  assert.equal(captured[1].$set.leaseUntil.toISOString(), now.toISOString());
  assert.equal(captured[1].$set.renewedAt.toISOString(), now.toISOString());
  assert.equal(captured[1].$set.releasedAt.toISOString(), now.toISOString());
});

test("a stale owner cannot release a successor lease", async () => {
  await withMocks([[JobLease, {
    findOneAndUpdate: async () => null
  }]], async () => {
    const released = await releaseJobLease({
      jobKey: "background-maintenance",
      ownerId: "old-instance",
      leaseToken: "old-token",
      now
    });
    assert.equal(released, false);
  });
});

test("ownership check requires a matching unexpired lease", async () => {
  const calls = [];
  await withMocks([[JobLease, {
    exists: async (filter) => {
      calls.push(filter);
      return calls.length === 1 ? { _id: "lease-id" } : null;
    }
  }]], async () => {
    assert.equal(await isJobLeaseOwned({
      jobKey: "youtube-curation",
      ownerId: "worker-1",
      leaseToken: "token-1",
      now
    }), true);
    assert.equal(await isJobLeaseOwned({
      jobKey: "youtube-curation",
      ownerId: "worker-2",
      leaseToken: "token-2",
      now
    }), false);
  });

  assert.deepEqual(calls[0], {
    jobKey: "youtube-curation",
    ownerId: "worker-1",
    leaseToken: "token-1",
    leaseUntil: { $gt: now }
  });
});

test("lease inputs reject missing identity, invalid dates, and unsafe durations", async () => {
  let databaseCalls = 0;
  await withMocks([[JobLease, {
    findOneAndUpdate: async () => {
      databaseCalls += 1;
      return null;
    }
  }]], async () => {
    await assert.rejects(
      acquireJobLease({ jobKey: "", ownerId: "worker-1", now }),
      /jobKey is required/
    );
    await assert.rejects(
      acquireJobLease({ jobKey: "job", ownerId: "worker-1", leaseDurationMs: 10, now }),
      /leaseDurationMs/
    );
    await assert.rejects(
      acquireJobLease({ jobKey: "job", ownerId: "worker-1", now: new Date("invalid") }),
      /valid Date/
    );
    await assert.rejects(
      renewJobLease({ jobKey: "job", ownerId: "worker-1", leaseToken: "", now }),
      /leaseToken is required/
    );
    await assert.rejects(
      releaseJobLease({ jobKey: "job", ownerId: "worker-1", leaseToken: "token", now: "not-a-date" }),
      /valid Date/
    );
    await assert.rejects(
      isJobLeaseOwned({ jobKey: "job", ownerId: "worker-1", leaseToken: "token", now: null }),
      /valid Date/
    );
  });
  assert.equal(databaseCalls, 0);
});

test("default lease duration is two minutes", () => {
  assert.equal(DEFAULT_JOB_LEASE_DURATION_MS, 120_000);
});

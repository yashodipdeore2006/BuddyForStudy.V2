# ADR-002 — Durable roadmap job processing

**Status:** Proposed — awaiting product-owner approval  
**Date:** 2026-11-15  
**Decision scope:** Build with AI asynchronous roadmap jobs (D-08)  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Related:** [ADR-001](ADR-001-normal-search-local-first-gemini-free.md), [Build with AI target architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md), [readiness issue #43](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)

## 1. Decision to be made

Select a durable execution model that satisfies D-08:

- Roadmap jobs and node-level progress survive API and worker restarts.
- Unfinished work resumes automatically.
- Completed curriculum and resource work is preserved.
- Reprocessing is idempotent and bounded.
- Retryable provider failures are distinguished from permanent failures.
- Permanent failures remain visible and actionable.
- The learner can reconnect to progress after a browser refresh or SSE disconnect.

This ADR compares a MongoDB-backed job queue with BullMQ on Redis-compatible infrastructure. The recommendation is to use MongoDB as both the durable job store and the initial queue, with the separate background worker as the consumer. This is a proposal, not an implementation authorization.

## 2. Verified repository and deployment baseline

The following observations were verified against `main` on 2026-11-15:

| Area | Current implementation | Consequence |
|---|---|---|
| API scheduling | `server/src/services/asyncRoadmap.service.js` pushes callbacks into a module-level `queue = []` and runs them through `pump()` | Job execution is process-local; MongoDB persistence alone does not cause another process to execute the job |
| Draft persistence | `server/src/models/RoadmapDraft.js` persists status, profile, result, idempotency key, events and admission token | Useful starting record, but it is not yet a worker-consumable durable queue contract |
| Draft retention | `createdAt` currently has a one-hour TTL | An active or recoverable job can be deleted by TTL; active jobs must not expire this way |
| Admission leases | `roadmapAdmission.service.js` persists admission capacity leases and can recover expired admissions | This is capacity accounting/recovery, not a durable execution lease; recovery currently marks queued/building drafts failed rather than resuming them |
| Worker entrypoint | `server/src/jobs/worker.js` connects to MongoDB and runs maintenance, notification, audit and curation tasks | It does not currently import or consume the async roadmap queue |
| Render manifest | `render.yaml` declares `buddyforstudy-worker` with `npm run worker`, and shares `REDIS_URL` as an optional environment variable | The manifest declares a worker process but does not declare a Redis/Key Value datastore resource |
| Live Render state | The 2026-11-14 dashboard evidence recorded in Task 02 shows only `buddyforstudy-api`; the worker was not present | Do not assume the worker is deployed or its heartbeat is healthy |
| Redis integration | `server/package.json` includes the `redis` client and `env.js` reads `REDIS_URL`; no BullMQ dependency or roadmap queue consumer was found in the inspected source tree | A Redis URL and client package do not establish that a durable queue exists |
| Feature flag | `render.yaml` defaults `ASYNC_ROADMAP=false` | Enabling the flag must wait until the durable worker path and recovery tests exist |

**Failure mode today:** the API process creates the MongoDB draft, then places the execution callback into its own memory. If that process exits before the callback finishes, a separate process cannot recover that callback from MongoDB. Current admission recovery eventually marks an expired in-progress draft as failed; it does not re-queue and resume unfinished nodes. The current local SSE listener map is also process-local, so a worker in a separate service cannot directly push events into API-held response objects.

## 3. Options evaluated

### Option A — MongoDB-backed queue and job store

Use a durable job document (the existing `RoadmapDraft` can evolve into this role) as the queue record. The API creates the job; one or more worker processes atomically claim eligible jobs from MongoDB using a lease; the worker persists stage and node progress back to MongoDB.

**Advantages**
- Uses the already-required MongoDB deployment and avoids an additional queue datastore.
- Keeps job status, result, idempotency information, node progress and learner-visible events in one durable source of truth.
- Supports atomic claim/lease transitions with single-document conditional updates. MongoDB documents single-document write atomicity and recommends including expected current state in update filters to avoid conflicting updates: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/
- Fewer deployment components and no new queue service to provision, secure, monitor and pay for.
- The repository already has a separate worker entrypoint and Mongo-backed operational heartbeat patterns.

**Costs and limitations**
- The team must build and test polling, atomic claims, leases, stale-worker fencing, backoff, retry classification, fairness and graceful shutdown.
- Polling adds database reads; compound indexes and a modest poll interval are required.
- It is less feature-rich than a mature queue library for delayed jobs, priorities, rate limiting and high-throughput fan-out.
- MongoDB becomes the queue read/write workload as well as the application system of record; monitor contention and query latency.

### Option B — BullMQ with Redis-compatible queue storage

Use BullMQ for queue delivery, scheduling, concurrency, retries and stalled-job handling. Keep MongoDB authoritative for the roadmap draft, course, learner-visible node states and completed result. A dispatcher/outbox publishes durable MongoDB jobs to BullMQ; workers consume BullMQ jobs and write authoritative progress to MongoDB.

**Advantages**
- A mature queue library provides useful worker, retry, delayed-job, concurrency and stalled-job mechanisms.
- Queue transport can be scaled independently from API and MongoDB workloads.
- Better fit if job throughput, priorities, delayed work or many job classes become operationally significant.

**Costs and limitations**
- Adds a separately provisioned and operated Redis-compatible service, plus queue-library integration and a second consistency boundary.
- A MongoDB insert and Redis enqueue are not one atomic write. Use a transactional outbox or an equivalent recoverable dispatcher; otherwise a crash between the two writes can strand a job.
- BullMQ state must not replace MongoDB's learner-visible source of truth. A Redis job completing does not, by itself, prove that the MongoDB result and node states were committed.
- The current repository has no BullMQ dependency or roadmap BullMQ integration.
- Render documents Key Value as a Redis-compatible queue/cache datastore. Its current documentation says free Key Value does not provide persistence; paid instances support disk-backed persistence, with Journal + Snapshot recommended for non-cache use. A non-persistent free datastore is therefore unsuitable as the only durable queue store: https://render.com/docs/key-value
- Render's background-worker guidance describes workers polling a task queue, commonly backed by a Redis-compatible store: https://render.com/docs/background-workers

### Option C — MongoDB source of truth plus BullMQ transport later

Start with Option A, but preserve an adapter boundary between job admission, job state and job execution. If measured scale or operational requirements justify it, add BullMQ as a delivery/dispatch layer while retaining MongoDB as the authoritative job and roadmap record.

This is the recommended evolution path. It avoids paying the complexity cost before the application demonstrates a need, without making MongoDB queue details leak into controllers or curriculum-generation logic.

## 4. Recommendation

**Recommend Option A now, with the Option C migration boundary.**

This is the lowest-infrastructure path that can satisfy D-08 for the currently observed system:

1. MongoDB is already a required datastore and already stores roadmap drafts and node results.
2. The current configured roadmap concurrency is low (`NODE_CONCURRENCY=3`), with admission caps already in place. No repository load test or observed queue throughput currently justifies a separate queue datastore.
3. A Render background-worker service is already described in `render.yaml`, although the dashboard evidence says it has not yet been created.
4. Redis is not currently demonstrated as a reachable production queue service; the manifest expects an externally supplied `REDIS_URL`, and the inspected code does not contain a BullMQ roadmap consumer.
5. MongoDB atomic single-document state transitions can support a correct claim-and-lease model, provided the implementation is explicitly engineered and failure-tested.

This recommendation is not a claim that MongoDB is always superior to BullMQ. BullMQ becomes the preferred option if measured queue throughput, scheduling complexity, latency, MongoDB contention or operational requirements justify a dedicated queue service.

## 5. Target MongoDB queue contract

### 5.1 Job record

Evolve the existing draft record (or introduce a dedicated `RoadmapJob` collection if separating learner result data from queue metadata proves cleaner). A job record should contain:

- Stable `jobId` / `draftId`, `userId`, request fingerprint and idempotency key.
- A strict, versioned build-input snapshot, without secrets.
- State: `queued`, `running`, `retry_wait`, `ready`, `failed_permanent`, `cancelled`.
- `availableAt`, `attemptCount`, `maxAttempts`, `lastErrorCode`, bounded safe error details.
- Lease: `ownerId`, random `leaseToken`, `expiresAt`, `heartbeatAt`, and a monotonically increasing claim/fencing version.
- `roadmapId`, result summary, timestamps and bounded event history.
- A terminal `expiresAt` for retention; active jobs have no expiration timestamp.

Public API states can remain compatible with existing values during migration (for example, map `running` to public `building` and `failed_permanent` to public `failed`).

### 5.2 Atomic claim and lease

A worker claims one job with a single conditional `findOneAndUpdate` operation, sorted by eligible time and creation time. The filter must match either:

- a `queued` job whose `availableAt <= now`, or
- a `retry_wait` job whose retry time has arrived, or
- a `running` job whose execution lease has expired.

The same atomic update sets `running`, assigns a fresh random lease token and worker ID, advances the fencing version, increments the attempt count and sets `lease.expiresAt`. Only one competing worker can win the same document transition because MongoDB write operations are atomic at the single-document level and the expected state is part of the filter.

All subsequent job-level and node-level writes must include the current job ID, lease token and fencing version. A worker whose lease expired must not be able to overwrite progress committed by a newer worker.

Use separate admission-capacity accounting and execution ownership. The current admission lease exists to reserve capacity; it should not be treated as the worker's execution lease.

### 5.3 Indexes and polling

Create and verify indexes from real queue query shapes. At minimum evaluate:

- `{ status: 1, availableAt: 1, createdAt: 1 }` for queued/retry-ready work.
- `{ status: 1, "lease.expiresAt": 1 }` for expired-running recovery.
- Unique idempotency scope, such as `{ userId: 1, idempotencyKey: 1 }`, with deliberate retention semantics.
- A TTL index on terminal `expiresAt`, not on `createdAt` for every draft.

Use bounded polling with a short idle delay and immediate re-poll after a successful claim. Tune the interval using observed MongoDB operation latency and queue-start latency; do not use an unbounded tight loop. Keep worker concurrency configurable and coordinated with admission capacity and provider quota.

### 5.4 Restart recovery and graceful shutdown

- On startup, immediately scan/reclaim expired execution leases; do not wait for the existing 15-minute maintenance interval.
- Workers claim only eligible jobs. Expired work is returned to the queue or reclaimed with a fresh fencing token.
- Preserve completed curriculum and node results. Resume only pending or retryable nodes; do not rebuild successful nodes unless their source input/version changed.
- On SIGTERM, stop claiming new work, allow active tasks to finish within the platform shutdown window, and safely release or let leases expire for unfinished work. Never mark a job ready before the authoritative MongoDB result is committed.
- Keep the existing worker heartbeat, but add roadmap-consumer health: last successful poll, oldest queued age, running count, expired-lease count, retry backlog and permanent-failure count.

### 5.5 Retry and idempotency

Use at-least-once execution with idempotent processing; do not promise exactly-once calls to Gemini or YouTube.

- Retry transient network/provider 5xx failures, temporary provider rate limits and recoverable database errors with bounded exponential backoff and jitter.
- For quota exhaustion, set a retry time aligned to the quota reset or expose a retryable quota-limited state; do not hot-loop.
- Treat invalid input, failed schema/semantic validation, access violations and unsupported goal/level combinations as permanent until the request changes.
- Keep cancellation terminal and fenced; a cancelled worker must not later finalize the job.
- Persist each stage/node transition. A retry should reuse completed node work and only retry unfinished eligible nodes.
- Make course creation/finalization idempotent using a stable job identity and conditional updates or unique constraints. Do not hold a MongoDB transaction open around Gemini/YouTube network calls.
- External provider calls can be repeated after a crash between the provider response and MongoDB commit. Where the provider lacks idempotency support, record this as an at-least-once cost risk and keep retries bounded.

### 5.6 Retention and event delivery

- Remove the current one-hour TTL from active roadmap drafts. Set `expiresAt` only after a terminal state and select an explicit retention period that satisfies learner history, support and privacy requirements.
- Keep the MongoDB job record as the source of truth for events and poll state.
- Since the API process and worker process do not share an in-memory listener map, the API SSE endpoint must stream persisted events through a DB-backed polling/change-notification mechanism. On reconnect, the client supplies the last event ID or receives a bounded replay; it must not depend on the worker process writing to an API-local `Map`.
- Bound event count/size and redact provider payloads, secrets and unnecessary learner data.

## 6. Target topology

~~~text
Browser
  | POST /api/ai/roadmap
  v
API service
  | validate + authorize + create durable job document
  | return draftId
  v
MongoDB  <-----------------------------+
  | durable queue state, lease,         |
  | node progress, events, result       |
  v                                     |
Dedicated Render background worker     |
  | atomic claim + lease                |
  | generate curriculum / curate nodes  |
  | persist each completed stage ------+
  |
  +--> Gemini / YouTube (bounded, policy-controlled calls)

Browser -- poll / SSE --> API service --> persisted MongoDB job and events
~~~

## 7. BullMQ migration triggers

Revisit Option B when one or more of these are demonstrated by metrics or an explicit product requirement:

- MongoDB queue polling or claim writes materially affect application query latency.
- Queue-start latency or throughput misses a defined SLO despite index and poll tuning.
- Delayed scheduling, priority queues, per-provider rate limiting, recurring tasks or large fan-out become difficult to operate safely in the Mongo-backed worker.
- Multiple independent worker pools need distinct queue policies and isolation.
- Operations prefers a managed Redis-compatible transport and can provision a persistence-enabled paid datastore with monitoring and recovery procedures.

If migrating, MongoDB remains the source of truth. Add an outbox/dispatcher so every committed MongoDB job is eventually enqueued in BullMQ. Use a persistent Redis-compatible datastore, not an ephemeral/cache-only plan, and test datastore restart/failover. Keep worker processing idempotent because a queue delivery can be repeated.

## 8. Required acceptance and failure-injection tests

| Scenario | Required result |
|---|---|
| API process exits immediately after job insert | A worker still claims and completes the job |
| API process restarts while a job is running | Work remains visible; worker continues independently |
| Worker exits after claim but before processing | Lease expires; another worker reclaims the job |
| Worker exits after some nodes complete | Completed nodes remain; only unfinished nodes resume |
| Old worker continues after lease expiry | Fencing token prevents stale writes/finalization |
| Two workers claim concurrently | Only one holds the valid lease for a job |
| Same idempotency key is submitted concurrently | One logical build is admitted; duplicate returns/reuses that job |
| Gemini/YouTube rate limit or quota exhaustion | Bounded retry/deferred state; no hot loop; completed work retained |
| Permanent schema/input failure | Terminal actionable failure; no retry loop |
| Browser refresh or SSE disconnect | Client reconstructs current state and replays events from MongoDB |
| Worker SIGTERM during active work | New claims stop; active work drains or becomes safely reclaimable |
| Active job crosses the old one-hour boundary | It is not deleted by TTL |
| MongoDB temporarily unavailable | Worker backs off, reports degraded health and resumes after DB recovery |

Before enabling `ASYNC_ROADMAP`, require the worker to be actually deployed and healthy, all critical failure-injection tests to pass, job retention to be decided, and staging evidence to be recorded.

## 9. Open decisions requiring explicit approval

1. Approve MongoDB-backed durable queue as the first implementation, with BullMQ/Redis reserved for evidence-based scale triggers.
2. Decide terminal job/event retention (proposed engineering default: 30 days for terminal job state, subject to product/privacy review; do not apply this to active work).
3. Decide whether to evolve `RoadmapDraft` or create a separate `RoadmapJob` model.
4. Confirm staging MongoDB topology supports the required atomic updates and, if later needed, transactions.
5. Confirm the pre-launch Render worker deployment and health check; dashboard evidence currently shows it is not deployed.

## 10. References

- MongoDB, [Atomicity and Transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
- MongoDB, [findOneAndUpdate](https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/).
- Render, [Background Workers](https://render.com/docs/background-workers).
- Render, [Key Value](https://render.com/docs/key-value).
- Render, [Pricing](https://render.com/pricing) — use current account/region/plan details for a later cost estimate; this ADR does not assume a specific plan price.

---

**Approval boundary:** This ADR proposes the queue architecture only. It does not authorize product-code changes, package installation, Redis provisioning, Render dashboard changes, feature-flag changes, PR merges or deployment.

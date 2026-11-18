# Hybrid Background Work Architecture

**Status:** Approved architecture for the V2.2 implementation sequence  
**Scope:** Background processing, offline learner progress synchronization, worker ownership, and low-cost deployment  
**Implementation branch:** buddy-for-study-v2.2  
**Current state:** Tasks 1–8 have implementation commits on `buddy-for-study-v2.2`; full regression and deployment verification remain pending.

## 1. Decision summary

BuddyForStudy will use a hybrid, server-authoritative architecture:

1. The browser may preserve learner progress actions locally and synchronize them when connectivity returns. Browser execution is opportunistic and is never treated as a reliable server scheduler.
2. The existing Node.js API may run bounded background batches inside the API process when configured in inline mode. This avoids requiring a second paid service for best-effort maintenance.
3. The existing standalone Node.js worker remains supported for deployments that need an independent process and more predictable execution capacity.
4. Inline and standalone schedulers must never intentionally own the same job at the same time. A MongoDB-backed distributed lease coordinates ownership across API instances and worker processes.
5. Operations that require a guaranteed execution time must use a reliable always-on scheduler/worker arrangement. An API process that can sleep or restart cannot provide that guarantee.

The backend and MongoDB remain authoritative for account identity, permissions, enrolments, billing, subscriptions, course state, and accepted progress. The browser never receives database credentials and never performs privileged state transitions.

## 2. Current implementation findings

The V2.2 starting revision already contains:

- A standalone worker started by the server package's worker script.
- A maintenance cycle that runs immediately at worker startup and then every 15 minutes.
- Scheduled-announcement processing on a 30-second interval, with at most five batches per pass.
- Nightly YouTube stale-video refresh and skill-resource-prior rebuilding behind the existing curation/compliance feature flag.
- Maintenance for roadmap-admission recovery, payment/webhook and YouTube operational checks, subscription/payment/trial expiry, audit outbox processing, notification delivery, reminder processing, and purchase/subscription notification reconciliation.
- A worker heartbeat stored in MongoDB and monitored by the API process.
- Per-process overlap flags and graceful shutdown handling in the standalone worker.
- A MongoDB batch lock and deterministic event keys in scheduled-announcement processing.

Important gaps and constraints:

- The current overlap flags only coordinate calls inside one Node.js process. They do not prevent an API instance and a separate worker process from entering the same routine.
- The API currently monitors the worker heartbeat but does not start the maintenance scheduler itself.
- The heartbeat document identifies one worker but does not yet describe execution mode or distributed lease ownership.
- The current standalone worker has no shared scheduler-level lease. Existing announcement batch locks protect announcement batches, not the entire worker schedule.
- The repository has a Service Worker file, but this audit did not establish that a durable IndexedDB progress queue and replay protocol already exist. Those are implementation tasks, not assumed capabilities.
- The existing roadmap-admission and announcement locks are domain-specific and must be preserved.

This design is additive: preserve current job contracts, per-record claim logic, notification event keys, operational alerts, retry behavior, and graceful shutdown unless a later implementation task demonstrates a necessary and tested change.

## 3. Target topology

    Browser
      - Application UI
      - IndexedDB pending-progress queue
      - Service Worker: static caching and best-effort sync trigger
      - Web Worker: optional page-session computation
                 |
                 | authenticated, idempotent progress-sync API
                 v
    Node.js / Express API  <---->  MongoDB
      - authentication and authorization
      - authoritative business operations
      - scheduler mode: inline, standalone, or disabled
      - shared job handlers and bounded batch runner
                 ^
                 |
       Standalone worker process
       (same job handlers; enabled only in standalone mode)

A future reliable scheduler may trigger a durable server-side job queue or a dedicated worker for jobs with strict timing requirements. It is not required for the initial cost-conscious inline rollout.

## 4. Explicit execution modes

Introduce one explicit runtime setting in a later implementation task:

    BACKGROUND_WORKER_MODE=inline | standalone | disabled

No mode is inferred from whether a process happens to have a timer running.

| Mode | API process | Standalone worker process | Intended use |
|---|---|---|---|
| inline | Starts bounded background scheduling after MongoDB is connected | Must not run the scheduler | Cost-conscious deployment where best-effort processing is acceptable |
| standalone | Serves API requests and monitors worker health; does not schedule jobs | Owns background scheduling | Dedicated worker deployment |
| disabled | Serves API requests; no background scheduler is expected | Must not run the scheduler | Local testing, maintenance, or an intentionally paused scheduler |

Configuration rules:

- Production deployment configuration must explicitly select a mode; do not silently infer inline mode from a missing worker heartbeat.
- In inline mode, the API process starts the shared scheduler after database initialization and stops it during graceful shutdown.
- In standalone mode, the API process does not start maintenance or announcement timers. The worker process starts only when configured as standalone.
- In disabled mode, health monitoring reports that scheduling is intentionally disabled and must not raise a false critical alert for a missing worker heartbeat.
- The standalone entry point must reject an incompatible mode rather than accidentally starting a second scheduler.
- Each API replica may initialize the inline scheduler, but only the replica that acquires the relevant MongoDB lease may execute that job pass.
- A deployment must not run inline mode and standalone mode against the same environment unless an explicit migration procedure has stopped one mode and verified that its leases are released or expired.

Recommended rollout for the current budget: use inline mode for best-effort maintenance, with the explicit understanding that it pauses while the API process is asleep or unavailable. Move to standalone mode only when there is budget and an operational need for independent worker capacity.

## 5. Job ownership and service boundaries

| Work | Browser | API request path | Inline / standalone scheduler |
|---|---|---|---|
| Cache application shell and public static assets | Yes | No | No |
| Record a learner action while offline | Store pending action only | Accept and validate on sync | No |
| Validate and persist progress | No authority | Yes | Only reconciliation that is already part of a defined server job |
| Authentication, roles, permissions, billing, subscription changes | Never | Yes | Server-side reconciliation only; never delegated to browser |
| Payment webhook processing | Never | Receive and verify provider webhook | Reconciliation/recovery only |
| Scheduled announcements | Never | Admin creates or changes schedule | Claim and process bounded batches |
| Email and push delivery | Never | Create durable notification events | Claim and deliver bounded batches |
| Audit outbox | Never | Write durable audit events | Drain bounded batches |
| Subscription/payment expiry housekeeping | Never | Enforce authoritative state during requests as required | Reconcile stored status |
| YouTube curation refresh and skill-prior rebuild | Never | Trigger only through authorized server workflows | Opt-in, quota-bounded server jobs |
| Operational monitoring and recovery checks | Never | Expose health/operations state | Run bounded checks and record alerts |

### 5.1 Browser responsibilities

The browser is a local-first delivery mechanism for learner progress, not a background server.

- Store only pending learner progress operations in IndexedDB.
- Generate a unique operation ID for every action. Keep the operation immutable when retrying.
- Scope pending records to the signed-in account locally, but derive the authoritative user identity from the authenticated server session/token. Never trust a client-supplied user ID.
- Flush on application startup, connectivity restoration, explicit user retry, and Background Sync where supported.
- Keep the visible UI responsive and show pending/synced/failed state.
- Do not store passwords, long-lived credentials, provider secrets, payment details, admin commands, or raw authorization tokens in the offline queue.
- On sign-out or account switch, do not replay one account's queue under another account. Pause and require the matching authenticated account, or offer a deliberate discard/export flow.
- Service Worker and Background Sync execution may be delayed, throttled, unsupported, or terminated by the browser. The open application must also be able to flush the queue.
- A Web Worker may offload CPU work while a page is open; it is not a substitute for server-side scheduling.

### 5.2 API responsibilities

The API validates every synchronized operation, derives the user from authentication, checks ownership/enrolment and course rules, validates payload shape and size, applies idempotency, and persists the accepted result. The API returns an explicit per-operation outcome so the client can acknowledge, retry, or resolve a conflict.

The API remains the only authority for payment state, subscription state, access rights, admin actions, curation approval, and notification consent.

### 5.3 Server scheduler responsibilities

The scheduler invokes existing server-side service functions. It must not duplicate business rules in the timer, HTTP route, browser, or Service Worker.

Each tick must be bounded by page size, batch count, concurrency, and a runtime budget. A busy API must not be forced to drain an unbounded backlog in one event-loop turn. Work that is not completed remains durable and eligible for a later pass.

## 6. Distributed MongoDB lease design

### 6.1 Why a shared lease is required

In-process booleans such as maintenanceInProgress prevent overlap only within one process. They do not coordinate two API replicas or an API and a standalone worker. A MongoDB lease provides one shared ownership decision without introducing a mandatory Redis dependency.

### 6.2 Lease record

Add a dedicated JobLease model/collection in a later task. One document represents one scheduler job key and contains:

| Field | Purpose |
|---|---|
| jobKey (unique) | Stable identity, for example background-maintenance or announcement-dispatch |
| ownerId | Unique process instance identifier |
| leaseToken | Cryptographically random token generated for each acquisition |
| leaseUntil | Lease expiration time, evaluated using UTC dates |
| acquiredAt | Time of the successful acquisition |
| renewedAt | Last successful renewal |
| fencingToken | Monotonically increasing acquisition generation |

Do not use a MongoDB TTL index as the lock-release mechanism. Lease expiry is evaluated in the atomic acquisition query; deleting a lock document asynchronously can create avoidable races.

### 6.3 Acquisition, renewal, and release

- Acquisition is one atomic find-and-update/upsert operation against the unique job key. It succeeds only when the lease is absent or expired.
- A duplicate-key result during competing first acquisitions means another process won; treat it as ordinary contention, not an application failure.
- A successful acquisition generates a new lease token and increments the fencing token.
- The owner renews before expiry, using a filter that matches job key, owner ID, lease token, and a lease that has not already expired.
- If renewal matches no document, the process has lost ownership. It must not start another batch and must stop between safe checkpoints.
- Release matches the exact job key, owner ID, and lease token. A process must never clear a lease acquired by a newer owner.
- Use UTC timestamps from synchronized server clocks across all API and worker instances. Do not rely on an unverified browser clock.
- The initial lease duration and renewal cadence should be configurable, with a conservative default such as a two-minute lease renewed every 30 seconds. Confirm real job duration and database latency with tests before finalizing production values.

### 6.4 Long-running work and duplicate protection

A lease is not an exactly-once execution guarantee. A process can pause, lose its lease, and later resume while another process has acquired the job. Therefore:

- Renew the lease while a job is running and check lease ownership between batches and before side effects where the service contract permits.
- Keep each batch small enough that normal processing completes well inside the lease duration.
- Preserve existing row/document-level claims, such as announcement batchLockToken and batchLockUntil.
- Use deterministic idempotency keys for notification creation and progress synchronization.
- Use conditional MongoDB updates so a retry cannot overwrite a newer state.
- Where a critical downstream write can be fenced, include and validate the fencing token. Do not claim fencing protection for existing routines until their writes have been updated and tested.
- Make handlers safe for at-least-once execution. Never design around an exactly-once assumption.
- If the lease is lost, stop claiming new work immediately. In-flight service calls may not be cancellable; they must remain protected by their own idempotency/claim contracts.

### 6.5 Lease boundaries

Use separate lease keys for independently scheduled work:

- background-maintenance
- announcement-dispatch
- youtube-curation (or a separate lease per independently expensive curation task if measurements justify it)

Do not hold one lease while waiting for another scheduler category. A failure in one category should not starve all other bounded work.

## 7. Heartbeat and operational health

The existing heartbeat is a liveness record, not a lock. Keep those responsibilities distinct:

- Heartbeat answers: is the configured scheduler process alive and reporting?
- Lease answers: which process currently owns this job?
- Job outcome answers: did the latest processing pass complete, fail, or skip?

Extend operational reporting to include execution mode, process instance ID, active job keys, last successful maintenance completion, last error, consecutive failures, and lease expiry/renewal state.

Health behavior must be mode-aware:

- inline: the API's scheduler heartbeat is expected while the API process is running.
- standalone: the standalone worker heartbeat is expected.
- disabled: worker heartbeat is not expected; report disabled rather than critical/stale.
- An expired lease by itself is not proof that the whole service is down; report the owning job as available for recovery.
- Keep the existing stale-heartbeat alert threshold configurable or explicitly documented and align it with the heartbeat interval.
- On shutdown, stop new ticks, wait a bounded time for active batches, release owned leases, record the final heartbeat, then close MongoDB.

## 8. Job classes and reliability tiers

### Tier A — best-effort, bounded background work

Suitable for inline execution when the API is awake:

- operational backlog checks and non-critical cleanup;
- audit outbox draining;
- notification delivery and reminder batches;
- scheduled-announcement batches;
- stale-record reconciliation that is already idempotent;
- opt-in YouTube curation refreshes, subject to quota and runtime guardrails.

A sleeping API may delay these jobs. Durable records, retries, and later replay are required.

### Tier B — server-authoritative work with request-time enforcement

These operations must remain correct even if no worker runs:

- authentication and authorization;
- payment webhook signature verification and durable event recording;
- payment and subscription access checks;
- enrolment and course-access decisions;
- progress validation and persistence;
- admin permission enforcement and notification consent.

A maintenance job may reconcile stored status, but it must not be the only mechanism that protects an entitlement or verifies a payment.

### Tier C — requires reliable scheduled execution

Examples include strict-deadline payment reconciliation, legally or contractually time-bound communication, and other jobs whose lateness is unacceptable.

Do not label inline scheduling as guaranteed for these workloads. Before adding them, provide an always-on scheduler or worker, durable queue, retry/alert policy, and an operational owner. Until then, expose the limitation and keep request/webhook paths safe.

## 9. Bounded scheduling policy

The initial implementation should preserve current business behavior while making scheduling fair and cheap:

- Maintenance cadence: retain the current 15-minute target initially.
- Announcement cadence: retain the current 30-second target initially, but process only a bounded number of batches per pass.
- Batch limits: retain existing limits where possible; do not increase recipient fan-out or provider concurrency as part of this refactor.
- Inline scheduling should use unreferenced timers where appropriate so timers do not prevent process shutdown.
- Avoid starting a new tick if the previous tick for that job key is still running.
- Stagger or jitter non-critical periodic checks across API instances to reduce synchronized load; the distributed lease remains the correctness mechanism.
- Apply provider quota checks before YouTube work.
- Do not let a backlog drain monopolize the API process. Stop at the tick budget and resume in a later pass.
- Log bounded, sanitized metadata. Do not log secrets, full provider payloads, or personal data.

These are initial operating targets, not a promise that a sleeping or restarted service will run at the scheduled instant.


### 9.1 Initial bounded inline implementation scope

The first API-side scheduler pass deliberately runs a bounded subset of the standalone maintenance work:

- expired roadmap-admission recovery: at most 10 records per maintenance pass, with a lease-ownership checkpoint between records;
- subscription, payment, and trial expiry updates: at most 25 selected records per model per pass;
- audit outbox processing: at most 25 stale locks recovered and at most 25 pending records replayed per pass;
- email and push delivery: at most 10 pending notifications per channel per maintenance pass;
- purchase and subscription-activation notification reconciliation: one page of 10 items per pass, ordered by oldest check time;
- scheduled announcements: at most one 100-recipient batch per 30-second pass, followed by at most 10 email and 10 push delivery attempts.

The initial inline pass does **not** execute the following existing standalone work:

- learning-reminder scans, because the current scan has no durable continuation cursor and a first-page-only cap would repeatedly inspect the same records;
- subscription-expiry reminder scans, until they have a fair, resumable cursor/checkpoint;
- nightly YouTube stale-video refresh and skill-resource-prior rebuilding, because these are heavier provider/curation operations and are not part of the first bounded API pass.

These jobs remain available through standalone mode. A deployment using only inline mode must understand that the omitted jobs will not run until a later implementation adds their own bounded, resumable execution contracts. Do not assume feature parity between the initial inline pass and the standalone worker.

### 9.2 Runtime mode compatibility

- Outside production, an omitted `BACKGROUND_WORKER_MODE` defaults to `standalone` to preserve the existing local worker command.
- Production must explicitly set `BACKGROUND_WORKER_MODE` to `inline`, `standalone`, or `disabled`.
- The standalone worker process refuses to start unless the configured mode is `standalone`.
- The API starts the inline scheduler only when the configured mode is `inline`; it does not start scheduled jobs in `standalone` or `disabled` mode.

## 10. Offline progress synchronization contract

The browser queue should be event-oriented and idempotent.

### 10.1 Suggested queue record

- operationId: random UUID generated once per learner action;
- schemaVersion: queue payload version;
- entity identifiers: course/module/lesson identifiers needed for authorization;
- action and validated progress payload;
- clientSequence: monotonically increasing sequence within the local account/course scope;
- createdAt: client timestamp for diagnostics only, not authorization;
- retryCount and nextAttemptAt;
- status: pending, syncing, acknowledged, conflict, or failed.

Do not treat client timestamps or clientSequence as proof of authority. The server validates entity ownership and applies its own ordering/version rules.

### 10.2 Sync protocol

1. The UI writes the operation to IndexedDB before optimistically acknowledging local persistence.
2. The sync client submits a bounded batch to an authenticated API endpoint.
3. The API derives the user identity from authentication, validates every operation, and deduplicates by operationId in a server-side idempotency store or equivalent unique constraint.
4. The API returns one result per operation: accepted, already applied, retryable, rejected, or conflict.
5. The browser removes only accepted/already-applied operations. Retryable items remain queued with backoff. Rejected/conflicting items remain visible for resolution or are discarded only under an explicit policy.
6. A reconnect or application restart resumes from IndexedDB.

### 10.3 Conflict and security rules

- Define merge semantics before enabling offline writes. Prefer append-only progress events or monotonic completion updates over blind replacement of the full progress document.
- Never allow an older offline snapshot to lower a learner's newer server-side completion percentage.
- Validate all course, enrolment, lesson, and user relationships on the server.
- Set strict maximum batch size and payload size; rate-limit the sync endpoint.
- Use idempotency keys and a unique database constraint to make repeated submissions safe.
- Never accept role, payment, subscription, admin, approval, or access-control fields from the offline queue.
- Do not rely on Service Worker background execution for eventual delivery. Provide a visible pending-sync indicator and a manual retry path.


### 10.4 V2.2 browser queue implementation checkpoint

The browser-side queue foundation is implemented in `client/src/lib/offlineProgressQueue.ts`:

- IndexedDB database: `buddyforstudy-offline-progress`.
- Stores only an operation UUID, account scope, course/lesson identifiers, action (`complete` or `uncomplete`), per-account sequence, local timestamps, retry metadata, and queue status.
- Sequence allocation and queue insertion happen in one IndexedDB read/write transaction, preserving local action order across tabs.
- Reads and deletes require the current authenticated account ID. The account ID is local scoping metadata and is not an authentication credential.
- The learner player applies pending actions optimistically and overlays the account's queued actions after it reloads course/progress data.
- If a delayed retry exists for a course, later actions for that same course remain behind it; independent course queues can continue.
- The app registers the existing Service Worker independently of push opt-in. Queue changes request Background Sync where supported.
- The Service Worker only posts a `BFS_PROGRESS_SYNC_REQUESTED` message to open clients. It never reads the queue, sends a protected API request, or stores an access token.

**Scope boundary:** This task established durable browser storage, local restoration, and synchronization wake-up signals. Task 8 adds the authenticated batch endpoint and queue-draining retry loop. If a Background Sync event fires when no app tab is open, the Service Worker leaves the queue untouched; the next authenticated app session requests a foreground sync. Offline course content itself is not cached by this queue feature.


### 10.5 V2.2 authenticated sync and idempotency implementation checkpoint

Task 8 adds the server-authoritative synchronization path:

- Authenticated endpoint: `POST /api/progress/sync`, mounted under the existing progress router. It uses `authMiddleware` and the `learning_progress` entitlement gate.
- The controller uses only `req.user.userId` as the learner identity. Any account identifier in a request body is ignored.
- Requests are bounded to 1–50 operations. Each operation must have a UUID, schema version 1, valid course and lesson ObjectIds, a `complete` or `uncomplete` action, and a positive client sequence.
- MongoDB collection `progress_sync_operations` stores an immutable request hash and a per-user operation receipt. The unique `{ user: 1, operationId: 1 }` index prevents the same learner operation from being claimed twice.
- Operation receipts use `processing`, `succeeded`, `rejected`, and `retryable` states with a two-minute processing lease. Expired or retryable receipts can be claimed again; a succeeded replay returns `duplicate`; a reused operation ID with a different semantic payload returns `conflict`; an active claim returns `in_progress`.
- The server applies actions through the existing `completeItem` and `uncompleteItem` business services, sequentially in the order supplied by the browser. Existing enrollment, course access, and curriculum checks remain authoritative.
- Course access failures keep the receipt retryable so the learner can restore access and retry the same immutable operation ID. Invalid/missing lesson operations remain rejected and can be dismissed from the local queue.

The authenticated browser synchronizer is implemented in `client/src/lib/progressSyncClient.ts`:

- It runs for the current signed-in account at app startup, when the tab becomes visible, after connectivity returns, after a Service Worker wake-up, and on explicit learner retry.
- It uses the ordinary authenticated `apiFetch` path with an expected-account guard. Before each request, the stored signed-in account must match the queue account, preventing one account's queued operations from being submitted with a different account's token.
- An account-specific IndexedDB lease serializes queue draining across tabs. Queue reads are limited to 50 operations per batch and five batches per run.
- Applied and duplicate operations are removed. Retryable/in-progress operations remain queued with exponential backoff capped at 15 minutes. Authentication failures pause without discarding data. Permission failures and permanent operation errors are marked blocked.
- Learners can retry recoverable blocked operations or explicitly remove blocked operations that are no longer valid.
- The Service Worker remains a wake-up mechanism only; it never reads progress records or makes authenticated API requests.

**Delivery semantics:** This is at-least-once delivery with server-side idempotency, not a distributed exactly-once transaction. A process can lose its lease after the business operation is applied but before its receipt is marked successful; replay is safe because the same operation ID is deduplicated and the underlying completion/uncompletion operations are idempotent for the progress state. The existing progress service's separate analytics/notification effects still retain their own business idempotency boundaries.

**Validation boundary:** Unit tests and MongoDB index integration coverage were added. Full frontend build/typecheck, complete backend suite, a live MongoDB integration run, and real-browser offline/reconnect testing have not yet been confirmed in this environment. Those checks remain part of Task 10.

## 11. Proposed configuration surface

These names are design proposals; add them to the environment schema and sample file only during the implementation task that introduces and tests them.

| Variable | Proposed values / purpose |
|---|---|
| BACKGROUND_WORKER_MODE | inline, standalone, disabled |
| BACKGROUND_WORKER_LEASE_MS | Lease duration; initial target 120000 |
| BACKGROUND_WORKER_LEASE_RENEW_MS | Renewal interval; initial target 30000 |
| BACKGROUND_INLINE_MAX_RUNTIME_MS | Maximum processing time allocated per inline tick |
| BACKGROUND_INLINE_BATCH_LIMIT | Maximum batches per inline tick |
| BACKGROUND_WORKER_INSTANCE_ID | Optional explicit instance ID; otherwise generate one at process startup |

No new Redis service is required for the first lease implementation. MongoDB is already a required dependency and is the shared coordination store.

## 12. Implementation sequence and acceptance gates

This architecture is implemented in the following order:

1. **Branch and current-state audit** — complete; all implementation changes remain on buddy-for-study-v2.2.
2. **Architecture and execution modes** — complete; ownership, job classes, lease semantics, and browser/server boundaries are documented.
3. **Distributed job leases** — complete; MongoDB lease model/service and contention, expiry, renewal, token-mismatch, and release coverage are implemented.
4. **Reusable maintenance orchestration** — complete; shared job handlers are used by inline and standalone schedulers.
5. **Bounded inline scheduler** — complete; mode-aware startup, bounded work, and graceful shutdown integration are implemented.
6. **Standalone compatibility** — complete; standalone mode is enforced and existing worker cadence is preserved.
7. **Browser offline queue** — complete; IndexedDB storage, account scoping, local restoration, and Service Worker wake-up signals are implemented.
8. **Sync/retry/idempotency** — implementation complete; authenticated batch API, unique server receipts, conflict handling, cross-tab locks, backoff, and manual recovery are implemented.
9. **Health/recovery** — next; make heartbeat checks mode-aware and expose lease/job health without false alarms.
10. **Regression and deployment verification** — pending; test API, standalone, inline, disabled, multi-instance contention, shutdown, browser reconnect, and retry recovery.

Do not move to the next implementation task until the current task's tests and branch verification pass. Do not deploy, merge, change Render services, or modify another branch as part of this sequence.


### 12.1 Standalone lease integration checkpoint

The V2.2 Task 6 implementation uses the shared `server/src/jobs/leasedJobRunner.js` from both the API-inline scheduler and the standalone worker.

- `background-maintenance` protects the full standalone maintenance pass.
- `announcement-dispatch` protects scheduled announcement dispatch.
- `youtube-curation` protects the nightly YouTube stale-video refresh and skill-resource-prior rebuild independently from the maintenance lease.
- The standalone worker remains restricted to `BACKGROUND_WORKER_MODE=standalone`, retains the existing 15-minute maintenance and 30-second announcement intervals, and continues to run the full reminder/reconciliation workload.
- Long-running record scans receive a `shouldContinue` ownership callback and stop before claiming further records after lease loss. Existing per-notification, audit-outbox, announcement, and roadmap-admission claims remain the record-level safety layer.
- Shutdown clears scheduler intervals, stops new leased work, waits for active lease release and orchestrator idle state, records the stopped heartbeat, and then disconnects MongoDB.

The lease does not guarantee exactly-once execution. Work already in flight when a lease is lost must still rely on its existing atomic claims and idempotency contracts.

## 13. Acceptance criteria

The architecture is considered correctly implemented only when:

- exactly one process can hold a given scheduler job lease at a time;
- simultaneous acquisition attempts result in one winner and safe contention for the others;
- expired leases can be recovered, while stale owners cannot renew or release a successor's lease;
- inline, standalone, and disabled modes have explicit and testable startup behavior;
- the API does not run scheduled handlers in standalone or disabled mode;
- the standalone process does not run handlers in inline or disabled mode;
- multiple API replicas do not duplicate a job pass;
- a lost lease prevents the owner from claiming subsequent batches;
- existing announcement document locks, notification idempotency, audit behavior, and business rules remain intact;
- API request latency and provider quotas remain bounded under backlog;
- offline actions survive reload and reconnect, are scoped to the matching account, and are not applied more than once;
- conflicts never silently overwrite newer server progress;
- the system communicates that inline/browser background execution is best-effort, not guaranteed;
- all automated tests pass on buddy-for-study-v2.2 before any deployment decision.

## 14. Deployment limitations and operational decision

For the current cost-constrained deployment, inline mode is the recommended first target because it avoids a separate worker service. It is suitable only for Tier A best-effort work. A free or sleep-capable API host can stop the process during inactivity, restarts, deploys, or resource pressure; the scheduler stops with it. A browser can also close or suspend its work.

Therefore:

- Do not promise exact scheduled delivery while running only inline mode.
- Keep durable work records and recovery logic so delayed jobs can resume after the API wakes.
- Keep payment and entitlement checks safe without relying on a scheduler.
- Escalate Tier C work to a reliable scheduler/worker when its service-level requirement justifies the cost.
- Do not move privileged backend jobs onto user devices to avoid hosting cost.

---
**Implementation note:** V2.2 now contains the MongoDB lease foundation, shared orchestration, bounded inline scheduler, standalone lease integration, browser IndexedDB queue, authenticated batch-sync endpoint, server idempotency receipts, and client retry pipeline. Full regression and deployment verification remain pending in Task 10.

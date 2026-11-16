# Security Negative-Test Specification — Build with AI & Course Discovery

**Status:** Specification v1.0 — not executed  
**Date:** 2026-11-16  
**Branch:** `docs/build-with-ai-engineering-readiness`  
**Related:** PR #43; `SECURITY_PRIVACY_ABUSE_REVIEW.md` v0.3; SEC-01–SEC-08  
**Scope:** Negative, abuse, ownership, integrity, privacy, payment and privileged-access verification. This document defines test intent and evidence; it does not assert that the tests exist or pass.

## 1. Purpose and execution boundary

This specification converts the source-mapped findings SEC-01–SEC-08 into reproducible verification cases. It also defines cross-cutting security cases required by the route review.

**Current work is documentation-only.** Do not execute tests, change application code, modify flags/configuration, access production learner records, send live provider requests, or deploy as part of this task. Execution requires separate implementation/test approval and a controlled test environment.

### 1.1 Test layers

| Layer | Appropriate coverage | Required environment |
|---|---|---|
| Unit | Schema normalization, authorization predicates, event semantics, idempotency key construction, state transition guards | Isolated test process; deterministic fixtures |
| Integration | Mongo owner filters, unique indexes, atomic usage reservation, webhook event claims/leases, privacy workflow persistence | Disposable isolated database; no production data |
| API | Real middleware, route permission, DTO validation, response projection, status/error contract, rate-limit behavior | Test API + isolated test accounts/database |
| Concurrency | Duplicate quiz enqueue, payment verification races, webhook claim/lease races, deletion retries, feedback collisions | Repeatable multi-request harness; multiple app instances where distributed behavior is claimed |
| Staging | Proxy/CORS/TLS/config, shared limiter store, worker recovery, provider adapters using capped test credentials | Approved staging only; explicit budget and data-retention controls |
| Manual review | Legal consent policy, deletion/retention inventory, admin permission matrix, audit evidence and user-facing claims | Named reviewer and signed evidence record |

Mocks are suitable for deterministic provider failure paths, but they do not prove Razorpay signature verification, provider state reconciliation, distributed locking or live deployment configuration.

## 2. Common test contract

### 2.1 Fixtures and identities

Use synthetic records only. Provision:
- **User A** and **User B**: distinct active learner accounts, distinct JWTs and no shared ownership.
- **Admin Support**, **Admin Analyst**, **Admin Course Manager**, **Admin Billing**, **Admin Privacy**, **Admin Super Admin**: separate accounts with only their intended role/permission grants.
- **Inactive user** and **revoked-session user**.
- **Course P**: published, approved, public and ready.
- **Course Q**: learner-private and owned by User A.
- **Course R**: generated/unapproved or otherwise not public; use a fresh fixture to test private-copy resolution.
- **Roadmap A**, **quiz/attempt A**, **progress A**, **privacy request A**, **saved course A**: owned by User A.
- **Payment A** and **pending webhook event A**: owned/associated with User A; matching provider test fixtures.
- **Curation impression A** and **discovery impression A**: server-issued, short-lived fixtures only if/when the implementation supports them.

Do not use real email addresses, payment instruments, access tokens, provider keys or learner data in committed fixtures.

### 2.2 Expected response conventions

Use the existing API error envelope unless an approved API-contract change explicitly replaces it. Record both HTTP status and stable machine-readable error code.

| Condition | Expected HTTP behavior | Required invariant |
|---|---:|---|
| Missing, malformed, expired, revoked or inactive session on protected route | 401 | No protected read/write/provider call |
| Authenticated user lacks role/permission/entitlement | 403, or consistent 404 where resource-existence concealment is the established policy | No side effect; no sensitive existence disclosure |
| Malformed identifier or DTO/schema violation | 400 | No persistence, queue admission or provider call |
| Valid request but stale/conflicting state or reused idempotency key with different payload | 409 where conflict semantics apply | Original state remains intact |
| Rate/budget limit exceeded | 429 | No expensive work admitted; retry metadata if contract supports it |
| Successful read/write | Existing documented 2xx status | Only caller-authorized projection and intended state transition |

Do not force every resource-not-found case to one status without checking the route's established concealment contract. Tests must assert consistent behavior within each route family and must not leak whether another user's private record exists.

### 2.3 Evidence to capture for every case

- Test ID, commit SHA, branch, environment and UTC execution time.
- Sanitized request method/path, synthetic actor role and redacted payload shape.
- HTTP status and stable error code; response projection with secrets/PII removed.
- Before/after database assertions and relevant ownership fields.
- Queue/job/provider-call counters where applicable.
- Audit event ID and actor/target/action/reason for privileged operations.
- Logs proving no token, password hash, OTP, prompt, provider secret or unnecessary personal data was emitted.
- For concurrency cases: number of workers/instances, parallelism, repetitions and final invariant counts.

A passing HTTP response alone is insufficient evidence for ownership, billing, deletion, idempotency or no-side-effect claims.

## 3. SEC-01–SEC-08 traceable test cases

### SEC-01 — Async roadmap profile validation boundary

**Source route:** `POST /api/ai/roadmap/draft` and related async roadmap creation path.  
**Source:** `server/src/controllers/asyncRoadmap.controller.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC01-U01 | Unit / P1 | Submit nested `intentProfile` with valid known fields and unknown keys | Strict schema rejects unknown keys (or documented strip policy); canonical profile contains only allowlisted fields |
| SEC01-API-02 | API / P1 | Put conflicting nested topic, level, goal, language and study-time values against explicit validated top-level values | Request is rejected or deterministic documented precedence is applied; no unvalidated value reaches persistence/provider |
| SEC01-API-03 | API / P1 | Submit prototype-like keys (`__proto__`, `constructor`, `prototype`) and unexpected nested objects | 400; no prototype mutation, draft, queue job or provider call |
| SEC01-API-04 | API / P2 | Submit overlong strings, oversized arrays, invalid enums and wrong scalar types at every nested field | 400; field-level validation error; no draft/job |
| SEC01-INT-05 | Integration / P1 | Inspect persisted draft and normalized generator input after accepted profile | Persisted and consumed profile satisfies the same strict schema; actor/owner fields are server-derived and immutable |

### SEC-02 — Practice quiz generation usage reservation

**Source path:** practice quiz submission → exhausted-bank generation → `queueNextLessonQuiz` → `generateCourseQuiz`.  
**Source:** `server/src/controllers/ai.controller.js`, `server/src/services/aiRoadmap.service.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC02-INT-01 | Integration / P0 | Exhaust a quiz bank as User A and trigger next-bank generation | Actor ID is propagated; exactly one atomic monthly reservation is recorded before enqueue/provider work |
| SEC02-API-02 | API / P0 | Trigger the same path with missing/invalid actor context | Fail closed; no job and no Gemini call |
| SEC02-INT-03 | Integration / P1 | Reach monthly allowance limit, then exhaust bank | 429 or documented quota error; no generation job/provider call; usage remains at cap |
| SEC02-CON-04 | Concurrency / P0 | Submit concurrent final quiz answers across one and multiple API instances | At most one idempotent generation job for the same course/lesson/bank generation; no duplicate provider spend |
| SEC02-INT-05 | Integration / P1 | Force generation failure after reservation | Reservation release/settlement follows the documented accounting policy exactly once; retries do not double-charge |
| SEC02-CON-06 | Concurrency / P1 | Race multiple learners on shared course content | Accounting follows the approved shared-vs-user budget decision; no null-actor bypass and no unbounded global spend |

**Open decision required before execution:** define whether shared generated quiz banks consume the triggering learner's allowance, a platform budget, or both. Tests must encode the approved policy rather than assume one.

### SEC-03 — Google new-account legal consent

**Source route:** Google authentication under `/api/auth/*`.  
**Source:** `server/src/validation/authSchemas.js`, `server/src/controllers/auth.controller.js`, `server/src/services/auth.service.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC03-API-01 | API / P1 | Verified Google identity for a new user; omit both legal acknowledgements | Reject before account/session creation; no user record or JWT |
| SEC03-API-02 | API / P1 | New user; set either acknowledgement false or omit one | Reject; no partial account or consent record |
| SEC03-INT-03 | Integration / P1 | New user; both acknowledgements true | Account and versioned consent evidence persist atomically; marketing consent remains false unless separately opted in |
| SEC03-API-04 | API / P2 | Existing Google user signs in without repeating new-account consent | Existing-user sign-in follows the approved policy and does not create duplicate consent/account records |
| SEC03-INT-05 | Integration / P1 | Force consent persistence failure during new account creation | Transaction/compensation leaves no account that appears successfully consented; no session token issued |

### SEC-04 — Privacy export, deletion and retention

**Source routes:** `/api/me/*` and privileged privacy-request routes under `/api/admin/*`.  
**Source:** `server/src/controllers/privacyRequests.controller.js`, `server/src/routes/me.routes.js`, `server/src/routes/adminPro.routes.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC04-API-01 | API / P0 | User A requests export using User B's request/export identifier | Deny with consistent 403/404 concealment; no B data in body, file, logs or audit metadata |
| SEC04-API-02 | API / P1 | Submit deletion request and inspect response/status | Response must explicitly state execution is unavailable until an executor exists; request must never be represented as completed deletion |
| SEC04-API-03 | API / P1 | Attempt admin status transition to fulfilled/completed without execution evidence | Reject transition; no false completion state |
| SEC04-INT-04 | Integration / P0 | Execute approved deletion workflow in future implementation with synthetic records | Every in-scope store has completion evidence or an approved retention exception; session/token revocation follows policy |
| SEC04-CON-05 | Concurrency / P1 | Retry same deletion job while worker lease expires or two workers claim it | Idempotent execution; no duplicate destructive side effects; terminal status only after all required steps |
| SEC04-INT-06 | Integration / P1 | Apply legal hold/payment/audit retention fixture | Protected records are retained only under documented exception; learner-facing completion report discloses residual retention |
| SEC04-MAN-07 | Manual / P1 | Compare export inventory to current Mongo collections, object storage, processors, logs and backups | Export remains marked partial until inventory is complete; omissions and retention owners are recorded |
| SEC04-API-08 | API / P2 | Request very large export repeatedly | Bounded response/streaming, rate control and no cross-user data; exact limits to be set by approved API policy |

**Release gate:** no product or admin interface may claim account deletion is complete while `executionAvailable: false` or any required store remains unverified.

### SEC-05 — Password hash non-exposure

**Source:** `server/src/middleware/auth.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC05-U-01 | Unit / P2 | Exercise required and optional auth query projections | Normal request context does not select/hydrate `+password` |
| SEC05-API-02 | API / P1 | Call representative protected routes and inspect serialized user/request context | Password hash absent from every response, log, trace and audit event |
| SEC05-INT-03 | Integration / P2 | Exercise login/password verification and password change flows | Dedicated auth-service verification still works without normal middleware loading hashes |
| SEC05-REG-04 | Regression / P2 | Search protected route serializers and telemetry fixtures for password field | No accidental serialization or telemetry capture; query projection assertion remains enforced |

### SEC-06 — AI curation feedback provenance and idempotency

**Source route:** `POST /api/ai/curation-feedback`.  
**Source:** `server/src/routes/ai.routes.js`, `server/src/controllers/courseCurationFeedback.controller.js`, `server/src/services/curationFeedback.service.js`, `server/src/models/CourseCurationFeedback.js`, `server/src/services/courseCurationDecisionEngine.service.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC06-API-01 | API / P1 | User A submits arbitrary resource ID/query/course ID without a server-issued impression | Reject ranking-affecting event; no feedback row or ranking counter change |
| SEC06-API-02 | API / P1 | Submit valid-looking course ID that is nonexistent, inaccessible or unrelated to resource | Reject; no cross-course association |
| SEC06-INT-03 | Integration / P1 | User A and User B reuse identical `submissionId` values | Idempotency is actor-scoped; neither account can overwrite, retrieve or suppress the other's feedback |
| SEC06-API-04 | API / P1 | Replay same impression/submission with changed resource or event | Reject as conflict (409) or invalid token (400/403); original event remains unchanged |
| SEC06-API-05 | API / P2 | Submit unsupported event type, rank/score boundary values and oversized fields | 400; no ranking-affecting persistence |
| SEC06-CON-06 | Concurrency / P1 | Parallel duplicate submissions with same actor/key | Exactly one durable event; deterministic idempotent response |
| SEC06-INT-07 | Integration / P1 | Verify event aggregation for helpful/wrong-level/not-sure/completed/abandoned/outdated | Only explicitly mapped, impression-backed event types affect documented counters |
| SEC06-ABUSE-08 | API / P1 | One actor floods one resource/query and rotates submission IDs | Shared per-user/resource limits and abuse controls bound writes; 429 after configured threshold |

### SEC-07 — Discovery feedback anonymous preview and ranking integrity

**Source route:** `/api/discovery/curation-feedback`.  
**Source:** discovery route/controller/service and rate-limit configuration.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC07-API-01 | API / P1 | Anonymous client submits preview feedback for arbitrary resource/query | No ranking-affecting persistent event without verified server-observed impression; if low-trust telemetry is retained, it is isolated from ranking |
| SEC07-API-02 | API / P1 | Authenticated user submits forged resource identity or query not shown in results | Reject or quarantine as non-ranking telemetry; no trusted ranking signal |
| SEC07-INT-03 | Integration / P1 | Verify preview event is linked to server-recorded impression and bounded retention | Event can only reference a real impression; retention and anonymous volume caps enforced |
| SEC07-CON-04 | Concurrency / P1 | Flood endpoint across multiple app instances | Shared limiter applies across instances; configured per-user and anonymous budgets cannot be bypassed by instance rotation |
| SEC07-API-05 | API / P2 | Send malformed event, unknown fields, large strings/arrays and repeated resource IDs | 400/429 as appropriate; bounded storage and no ranking side effect |
| SEC07-INT-06 | Integration / P1 | Submit unsupported event types and compare ranking aggregates | Event semantics are explicit; unsupported/unverified events do not influence ranking |

### SEC-08 — YouTube save path private-course ownership

**Source route:** `POST /api/discovery/youtube-course/save`.  
**Source:** `server/src/routes/discovery.routes.js`, `server/src/controllers/discovery.controller.js`, `server/src/services/discovery.service.js`, `server/src/utils/coursePreview.js`.

| ID | Layer / priority | Attack or test | Expected result and no-side-effect assertion |
|---|---|---|---|
| SEC08-API-01 | API / P0 | User B saves an unapproved resource previously prepared by User A | Save resolves User B's own private copy or rejects; must not attach/return User A's private course or shared unapproved base |
| SEC08-API-02 | API / P1 | User B guesses/uses User A's private course/resource identifier in save flow | Deny consistently; no saved-course row or metadata disclosure |
| SEC08-INT-03 | Integration / P0 | Save, prepare and enroll same unapproved resource as User A and User B | All learner-facing flows resolve the correct per-user private copy; owner fields and saved association match actor |
| SEC08-API-04 | API / P1 | Save an approved public resource | Shared public course is allowed only if approval/publication/readiness policy passes |
| SEC08-API-05 | API / P1 | Inspect save response projection for unapproved/private resource | Response contains only the actor's authorized private copy projection; no other learner metadata or provider URL leakage |
| SEC08-U-06 | Unit / P1 | Invoke learner-facing resolver without owner context | Fail closed; null-owner behavior allowed only for explicitly authorized admin/system caller |

## 4. Cross-cutting route and abuse matrix

| ID | Area | Layer / priority | Negative test | Expected invariant |
|---|---|---|---|---|
| XAUTH-01 | JWT/session | API / P0 | Missing, malformed, expired, revoked token; inactive account; stale token version | 401; no handler side effect or provider call |
| XAUTH-02 | Role freshness | Integration / P1 | Revoke admin role/permission, then reuse old JWT | Current database role/permission controls access; denial and audit where required |
| XIDOR-01 | Roadmap | API / P0 | User B reads/cancels/streams/finalizes User A draft ID | Deny with consistent 403/404; no mutation/event leak |
| XIDOR-02 | Learning | API / P0 | User B requests User A private course, quiz bank, attempt, progress or enrollment ID | Deny; no data or state disclosure |
| XIDOR-03 | Privacy | API / P0 | User B accesses User A export/request | Deny; no export artifact |
| XENT-01 | Entitlement | API / P1 | Expired/revoked feature entitlement calls intent, roadmap, quiz or learning route | 403/404 per route contract; no job/provider call |
| XENT-02 | Feature flags | API / P1 | Call feature route while server-side feature flag is disabled | Explicit unavailable/disabled response; no fallback that silently invokes provider or persists work |
| XADM-01 | Admin RBAC | API / P0 | Run each sensitive route as learner and each admin role without named permission | Deny every unauthorized route; no side effect |
| XADM-02 | Admin governance | Integration / P0 | Admin changes own role; attempts to remove last active Super Admin; unauthorized override grant | Reject; role state unchanged; audit record for attempted privileged operation per policy |
| XADM-03 | PII | API / P1 | Support/analyst role attempts PII reveal/export without dedicated permission | Deny; no PII in response or logs |
| XPAY-01 | Payment ownership | API / P0 | User B verifies or reads User A payment ID | Deny; no enrollment/payment state mutation |
| XPAY-02 | Amount/currency | Integration / P0 | Tamper client amount/currency or alter course price after order creation | Server-derived checkout amount and provider capture must match stored order amount/currency; mismatch rejected |
| XPAY-03 | Payment replay | Concurrency / P0 | Replay same provider payment/signature and verify concurrently | Exactly one paid transition/enrollment; idempotent response; no duplicate entitlement |
| XWH-01 | Webhook signature | API / P0 | Missing/wrong secret, modified raw body, invalid signature | Reject; no event claim or payment/subscription mutation |
| XWH-02 | Webhook replay | Concurrency / P0 | Replay same event ID concurrently and after completion | One effective event; duplicates acknowledged/ignored according to contract |
| XWH-03 | Webhook ordering | Integration / P1 | Deliver captured, failed, refunded and subscription events out of order | State machine prevents stale event from regressing terminal/authoritative state |
| XWH-04 | Lease recovery | Concurrency / P1 | Worker crashes after claim, lease expires, second worker retries | Safe reclaim; no double financial side effect; audit trail preserved |
| XFB-01 | Feedback abuse | API / P1 | Flood feedback with many IDs/accounts | Per-user/resource and global abuse budgets; no unbounded ranking impact |
| XINPUT-01 | DTO validation | API / P1 | Unknown keys, malformed ObjectIds, invalid enums, nested objects, oversized strings/arrays | 400; no persistence/queue/provider call |
| XINPUT-02 | Body limits | API / P2 | Exceed JSON/URL-encoded body limits and deeply nested payloads | 413 or documented parser rejection; process remains healthy |
| XRATE-01 | Rate limits | Staging / P1 | Exceed auth, payment, roadmap, quiz and feedback budgets across instances | 429 and shared counter semantics where required; no local-instance bypass |
| XRATE-02 | Store outage | Staging / P1 | Disable shared Mongo rate-limit store in controlled staging | Expensive/high-risk routes fail according to explicit fail-closed policy; behavior documented and alert emitted |
| XLOG-01 | Logging | Integration / P1 | Trigger auth/payment/provider validation failures with synthetic secrets | No password, JWT, OTP, provider secret, prompt body or unnecessary PII in logs/traces |
| XPROMPT-01 | Prompt trust | Unit/API / P1 | Topic, syllabus, video title/description contain instruction override or secret-exfiltration text | Untrusted content remains data; output schema/semantic validation and safety policy remain authoritative |

### 4.1 Admin role × permission matrix requirement

Before execution, generate the authoritative route inventory from mounted routers and map every sensitive route to its exact permission string. Then create a parameterized denial test for every role/permission pair.

| Role fixture | Default expected access | Explicitly denied unless granted by approved policy |
|---|---|---|
| Learner | Learner-owned routes and entitled features | All admin routes, other users' data, PII reveal, role changes, pricing/refunds governance |
| Support | Only support-specific operations | PII reveal/export, role governance, billing mutation, prompt activation, pricing changes |
| Analyst | Read-only analytics explicitly granted | PII reveal, user mutation, role governance, payment/refund mutation |
| Course Manager | Course moderation/management permissions explicitly granted | PII, role governance, billing/refunds, prompt activation unless separately granted |
| Billing Admin | Billing/payment/refund permissions explicitly granted | PII, role governance, course moderation and prompt activation unless separately granted |
| Privacy Admin | Privacy-request permissions explicitly granted | Role governance, unrelated PII reveal, pricing/payment mutation |
| Super Admin | Explicitly enumerated platform governance permissions | Self-role change and removal of last active Super Admin; all actions still audited |

This table is a test-fixture proposal, not a claim that these exact role names or grants currently exist. Replace role labels with the repository's actual role/permission registry before test implementation. Every route must have both positive and negative cases.

## 5. Release gates and prioritization

### P0 — Blockers before enabling affected high-risk flows
- SEC02-INT-01, SEC02-API-02, SEC02-CON-04: user/platform budget reservation cannot be bypassed.
- SEC04-API-01 and deletion-state guard; no false privacy fulfilment.
- SEC08-API-01 and SEC08-INT-03: private course owner isolation.
- XAUTH-01, XIDOR-01/02/03: protected resource isolation.
- XPAY-01/02/03 and XWH-01/02: payment ownership, amount/currency integrity, signature and replay safety.
- XADM-01/02: unauthorized privilege escalation blocked.

### P1 — Required before broad rollout
- SEC01 schema boundary; SEC03 new-account consent; SEC04 retention/executor evidence; SEC06/07 impression provenance and feedback integrity; SEC05 password-hash projection.
- Entitlement/feature-off, prompt trust, rate-limit distribution, audit and log redaction.
- Admin role × permission route matrix complete.

### P2 — Hardening and operational confidence
- Oversized/deep payload behavior, export throttling/streaming, password projection regression, metrics and alert verification.

**No GO decision is implied by this specification.** A release gate passes only when test execution evidence is attached, failures are triaged, fixes are reviewed and the responsible owner accepts any residual risk.

## 6. Execution sequence after approval

1. Freeze the route inventory and permission registry for the tested commit.
2. Confirm the approved SEC-02 accounting model and SEC-03 legal-consent policy.
3. Confirm the privacy data inventory, deletion/legal-hold policy and current honest product claims.
4. Build synthetic fixtures and isolated database/provider mocks.
5. Implement unit and integration tests first; verify no-side-effect assertions.
6. Add API and multi-instance concurrency tests.
7. Run controlled staging checks for shared rate limiting, worker recovery and provider adapters.
8. Capture evidence, triage findings, assign owners and rerun regressions.
9. Update the security review and readiness plan with exact test run IDs and commit SHA.
10. Conduct a separate Go/No-Go review; do not infer approval from a green subset of tests.

## 7. Known limits and unresolved decisions

- SEC-02 requires an explicit shared-vs-user quiz-generation budget decision.
- SEC-03 requires the product/legal owner to confirm exact policy versions and treatment of existing Google users.
- SEC-04 cannot be tested as successful fulfilment until a real deletion/anonymization executor and complete data-retention inventory exist.
- SEC-06/07 impression-token design and treatment of anonymous preview telemetry require an approved implementation contract.
- SEC-08 negative tests must establish whether the current behavior actually exposes cross-user private metadata; the source review establishes an ownership inconsistency, not confirmed exploitation.
- The actual admin role names/permission grants must be read from the current registry before parameterizing the role matrix.
- Payment/webhook cases require isolated Razorpay test fixtures; do not use live charges or production webhook secrets.
- Existing route inventory remains focused rather than a complete repository-wide audit; generate and reconcile all mounted routes before closing Task 05.

## 8. Completion checklist

- [ ] Route inventory and exact permission registry frozen for tested commit.
- [ ] SEC-01 through SEC-08 mapped to executable tests.
- [ ] P0 cases pass with database/provider no-side-effect evidence.
- [ ] P1 cases pass or have owner-approved mitigation and explicit rollout restriction.
- [ ] P2 cases pass or are tracked as accepted hardening work.
- [ ] Multi-instance rate-limit and concurrency behavior evidenced in staging.
- [ ] Privacy inventory, legal retention and consent policy signed off.
- [ ] Logs/traces/audit evidence reviewed for secret and PII leakage.
- [ ] Test run IDs, commit SHA, environment and reviewer recorded.
- [ ] Security review and readiness plan updated; residual risks accepted by named owner.

**Current completion:** specification authored only. No tests were run and no application behavior was changed.

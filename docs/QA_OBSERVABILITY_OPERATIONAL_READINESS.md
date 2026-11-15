# QA, Observability and Operational Readiness — Build with AI & Course Discovery

**Status:** Draft v0.1 — design baseline only; no application code or telemetry changed  
**Date:** 2026-11-15  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Related:** readiness issue #43; Task 07; ADR-001 through ADR-005; Build with AI target architecture

## 1. Purpose and boundaries

Define the test strategy, failure-injection plan, operational signals and runbook requirements for the approved Normal Search and Build with AI product contracts.

This document is a QA design, not evidence that the system currently passes. It does not authorize production flag changes, live provider load tests, API-derived YouTube ranking metrics, or product-code changes. Normal CI must use deterministic fixtures and mocked provider adapters. Live Gemini/YouTube checks must be separately approved, quota-capped and run only in staging.

## 2. Quality gates and test layers

| Layer | What it proves | Required coverage | Execution |
|---|---|---|---|
| Unit | Deterministic business rules | Zod/schema validation; intent confidence/question planning; skill normalization and ambiguity; graph DAG/repair; language and duration gates; local-first fallback decision; quota reservation math; retry classification; state transitions | Every PR; no network |
| Service/component | Orchestration and side effects | Normal Search local-first sequence; zero Gemini calls on Normal Search; Build with AI provider boundary; course ownership/visibility; per-node resource state; cache keys/invalidation; idempotent node processing | Every PR; provider/database adapters mocked |
| Integration | Real persistence and infrastructure contracts | Mongo indexes/transactions/atomic claims; Redis cache/lock behavior where configured; durable job recovery; event replay; quota reservation concurrency; auth/entitlement middleware | CI service containers or isolated test database; no production credentials |
| Contract | Frontend/backend compatibility | Request/response schemas, pagination, typed errors, sync/async parity, cancellation, resume, ownership, language alternatives | Every PR; schema fixtures |
| Browser E2E | Learner/admin journey | Catalog search, local-first behavior, adaptive intake, editable profile, roadmap generation, progress, refresh/resume, partial failure, enrollment and admin approval | PR smoke subset plus scheduled full suite |
| Load/soak | Capacity and degradation | Search concurrency, roadmap admission, worker throughput, provider fan-out, cache stampede, queue backlog and recovery | Staging only after quotas, topology and budgets are verified |
| Manual playback review | Actual instructional usefulness | Human inspection of a policy-approved sample; metadata signals are not proof of video content | Separate approved research workflow; never regular CI |

### 2.1 Unit-test matrix

| Area | Required cases | Critical invariant |
|---|---|---|
| Normal Search orchestration | Direct course match; module-derived standalone match; no local match; later page has zero rows but positive total; pending/unpublished/private local records | YouTube fallback only when total eligible local match count is zero |
| Gemini isolation | Gemini client spy with credentials configured; error if invoked from Normal Search call graph | Normal Search makes zero Gemini calls |
| Intent and profile | Topic-only input; low-confidence fields; “not sure”; optional skip; edited assumptions; invalid structured output | No silent promotion of inferred values to learner-confirmed facts |
| Curriculum/skill graph | Duplicate skills; cross-domain ambiguity; cycle; missing prerequisite; fewer than 3 nodes; more than 14 nodes; schema-version cache mismatch | Valid, domain-aware 3–14 node DAG; repairs are explicit and auditable |
| Resource selection | Preferred language available/unavailable; alternative-language result; level/duration mismatch; empty candidate pool; stale metadata | Alternate-language resources are labelled and not added without explicit learner choice |
| Ownership/moderation | Sync and async generation; private learner course; manual/automatic approval; archived/unready course | Learner-private work remains private; approval never bypasses enrollment or pricing rules |
| Async state machine | Duplicate enqueue; duplicate event; cancel before/after claim; worker restart; lease expiry; retryable/permanent error | Idempotent state transitions; completed nodes preserved; unfinished work recoverable |
| Quota/cache | Concurrent reservations; soft/hard limit; store unavailable; retry; cache hit/miss/expiry; force refresh | Fail closed on unavailable quota store; each provider retry is reserved |
| Security | Prompt injection in user text and provider metadata; cross-user draft/course access; malformed payloads; rate-limit boundary | Untrusted content cannot override system rules; owner and entitlement checks are server-enforced |

## 3. Integration and contract test matrix

| Scenario | Setup / injected condition | Expected result |
|---|---|---|
| Mongo unavailable during admission | Connection refused or transient timeout | No accepted job without durable admission; safe retryable response |
| Duplicate job submission | Same idempotency key submitted concurrently | One logical job; stable response identity |
| API process restarts | Kill API after admission and during node processing | Durable state remains; worker resumes unfinished work; completed nodes are not repeated destructively |
| Worker crashes while holding lease | Terminate worker before lease expiry | Another worker may claim only after lease/fencing rules permit; stale worker cannot commit |
| Redis unavailable | Disable cache/lock adapter | Defined degraded mode; correctness preserved; no silent duplicate work or unbounded provider fan-out |
| YouTube quota exhausted | Mock search bucket and shared-unit bucket independently | Local catalog still succeeds; external fallback degrades clearly; Build with AI reports resource-limited state without losing curriculum |
| YouTube timeout/5xx | Timeout and retryable provider response | Bounded retry with quota reservation; then typed partial/degraded state |
| Gemini timeout/429/invalid JSON | Inject each provider failure | Bounded retry/fallback; strict schema validation; no malformed roadmap persisted |
| Auth/entitlement denied | Unauthenticated, wrong owner, expired entitlement, non-admin | 401/403; no resource or job leakage |
| Sync/async parity | Same confirmed learner profile through both supported modes | Equivalent ownership, privacy, curriculum invariants and typed result semantics |

Tests that require Mongo/Redis should run against disposable isolated services or dedicated test databases. Never point test suites at production databases or use real provider secrets in pull-request CI.

## 4. Browser E2E acceptance journeys

1. **Normal Search — local match:** search a topic with a published BuddyForStudy match; show eligible local results and prove no YouTube fallback or Gemini call occurs.
2. **Normal Search — external fallback:** search a topic with no eligible local result; show clearly attributed external results; simulate YouTube quota refusal and confirm the catalog remains usable.
3. **Adaptive Build with AI:** enter only a topic; answer targeted questions; choose “not sure” or skip optional items; edit provisional goal/level/language; confirm the profile before generation.
4. **Roadmap creation:** generate a roadmap; verify 3–14 valid skill nodes, prerequisite ordering, duration assumptions, hours/weeks display and video runtime separation.
5. **Resource language:** verify preferred-language resources are prioritized; alternate-language resources are visibly labelled and require explicit learner selection.
6. **Async progress and recovery:** refresh the page, reconnect after a network interruption, resume a persisted job and verify completed nodes remain stable.
7. **Partial failure:** exhaust YouTube quota or inject a provider failure; curriculum remains available and affected nodes show actionable resource states.
8. **Course privacy/moderation:** verify learner-private course ownership, manual/automatic admin policy, public publication readiness and separate enrollment checks.
9. **Enrollment:** enroll only in eligible published/visible courses; verify duplicate and unauthorized enrollment handling.

Current inventory has no dedicated Build with AI or Normal Search browser E2E spec. These journeys are acceptance requirements, not currently passing test evidence.

## 5. Failure-injection catalogue

| Dependency / boundary | Failure | Required observable behavior | Recovery requirement |
|---|---|---|---|
| Gemini | Timeout, 429, 5xx, malformed structured output | Provider error class, latency, attempt count, fallback path; no prompt or learner PII in logs | Bounded retries; safe fallback or actionable failure |
| YouTube | Search quota bucket exhausted | Search-call budget and quota refusal reason; local results unaffected | Stop provider calls at cap; reset/restore only under provider quota policy |
| YouTube | Shared quota bucket exhausted | Shared-unit usage separate from search calls | Degrade external resources; preserve curriculum |
| MongoDB | Transient outage / write conflict | Persistence error, admission outcome, retry classification | Idempotent retry; never report durable acceptance before durable write |
| Redis | Cache or lock outage | Cache bypass and dependency health | Bounded provider calls; correctness does not depend on cache |
| Worker | Crash, restart, stale lease | Heartbeat age, active jobs, lease expiry, retry count | Reclaim safely; fencing prevents stale commits |
| Browser/network | Refresh, offline, duplicated submit | Job identity and last durable state | Poll/reconnect/resume without duplicate generation |
| Security | Cross-user access or injected metadata | Denied access and security event category | No data disclosure; alert on repeated abuse |

## 6. Observability specification

Use low-cardinality labels. Do not log access tokens, API keys, cookies, raw prompts, full learner profiles, email addresses, database URIs or full provider payloads. Prefer opaque request/job IDs and redacted error classes.

### 6.1 Application and journey metrics

| Signal | Definition | Required dimensions |
|---|---|---|
| `http_request_duration_seconds` | Request latency histogram | route template, method, status class |
| `http_requests_total` | Request count | route template, method, status class |
| `roadmap_admission_total` | Accepted/rejected admission count | outcome, rejection class |
| `roadmap_completion_total` | Terminal completed/partial/failed/cancelled jobs | outcome, generation mode |
| `roadmap_duration_seconds` | Admission-to-terminal duration | outcome, generation mode |
| `roadmap_active_jobs` | Current non-terminal jobs | queue/worker role |
| `roadmap_oldest_pending_age_seconds` | Age of oldest eligible pending job | queue |
| `roadmap_node_state_total` | Node state transitions | state, bounded error class |
| `roadmap_recovery_total` | Recovered/reclaimed jobs | recovery reason |
| `resource_state_total` | Ready/alternative/unavailable/quota-limited resources | state, preferred-language-match boolean |
| `search_result_mode_total` | Local direct/local module/YouTube fallback/empty/degraded | mode |
| `cache_requests_total` | Cache hits/misses/errors | cache family, outcome |

### 6.2 Provider and quota metrics

Keep YouTube's separate quota buckets separate in both telemetry and dashboards:

- `youtube_search_calls_total`: count of `search.list` calls, including retries.
- `youtube_shared_quota_units_total`: quota units consumed by non-search endpoints.
- `youtube_quota_reservations_total`: reserved/denied reservations by bucket.
- `youtube_provider_requests_total`: endpoint family and outcome; do not label by raw query/video/channel ID.
- `gemini_requests_total`: model family, operation, outcome.
- `gemini_input_tokens_total` and `gemini_output_tokens_total`: provider-reported usage where available.
- `provider_request_duration_seconds`: provider latency by provider/operation/outcome.
- `provider_retry_total`: retry count by provider and bounded reason.

Do not combine search calls and shared quota units into one ambiguous `quotaUnits` measure. Do not infer USD from YouTube quota units. Record Gemini model/tier and actual token usage before calculating cost; keep infrastructure invoices separate.

### 6.3 Worker and infrastructure metrics

- Worker heartbeat timestamp/age and worker process health.
- Pending, active, retrying and dead-letter job counts (if a dead-letter state is adopted).
- Oldest pending job age and lease-expiry/reclaim count.
- Mongo connection/pool health, operation latency and write-conflict rate.
- Redis availability, command latency and cache error rate.
- Process CPU, memory, event-loop lag, restart count and shutdown duration.

## 7. SLO and alert policy

Do not invent production SLO thresholds before measuring a baseline. First capture at least 7 representative days in staging/production-like traffic where possible, including peak periods and provider incidents. Then set service-level indicators and objectives with an owner.

| SLI | Measurement window | Proposed SLO treatment |
|---|---|---|
| Normal Search availability | 7-day rolling | Local catalog availability is primary; external fallback is optional and must not take down local results |
| Normal Search latency | 7-day rolling, p50/p95/p99 | Set target after baseline; segment local-only vs provider fallback |
| Roadmap admission success | 7-day rolling | Separate validation/entitlement rejections from infrastructure failures |
| Roadmap completion | 7-day rolling | Track completed, partial, failed and cancelled separately; define expected completion window by roadmap size |
| Recovery correctness | Per restart/incident | Zero loss of acknowledged durable jobs; no duplicate destructive node completion |
| Provider quota safety | Daily provider window | Stay below app hard caps; alert before soft limit; separate search and shared buckets |
| Worker freshness | Rolling heartbeat | Alert on missing/stale heartbeat and oldest pending age after deployment topology is confirmed |
| Security/privacy | Continuous | Zero known cross-user disclosure; immediate incident handling for confirmed exposure |

### Alert severity

- **Page / urgent:** confirmed cross-user data exposure; acknowledged roadmap data loss; quota hard-cap breach caused by application; sustained API outage; worker down while durable backlog is growing beyond the agreed recovery window.
- **High:** repeated provider failures causing roadmap completion degradation; rapidly rising oldest pending age; Mongo persistence failures; elevated 5xx rate.
- **Warning:** provider soft-limit threshold reached; cache hit rate drops materially from baseline; retry rate rises; latency regresses beyond agreed baseline.
- **Informational:** deployment, flag change, scheduled maintenance, recovery completion.

Every alert needs an owner, runbook link, severity, deduplication key and actionable next step. Thresholds must be calibrated from measured baseline and provider limits.

## 8. Staging smoke-test controls

Before any live Gemini/YouTube smoke test:

1. Verify staging environment and isolated database; confirm no production learner data is copied.
2. Confirm Google Cloud project, current quotas, application caps and provider billing owner.
3. Obtain YouTube policy review for the exact fields, retention and any derived scoring/evaluation. Do not run API-derived ranking metrics while this is unresolved.
4. Use a tiny, fixed test set and preflight the complete worst-case request budget; cap requests and stop on first quota warning.
5. Record provider/model, request counts by quota bucket, token usage, latency and outcome only; do not retain raw provider data beyond policy-approved limits.
6. Reconcile observed request counts against gateway reservations and provider dashboards.
7. Delete temporary test data when its approved retention period expires.

Do not add live provider calls to standard CI and do not run the existing 30–50-topic live golden-set evaluator without a frozen snapshot or explicit quota preflight.

## 9. Runbook requirements

Before production rollout, publish operator steps for:

- Gemini degraded/429/timeout behavior and model rollback.
- YouTube search/shared quota exhaustion and fallback disablement.
- MongoDB outage, recovery and write-conflict handling.
- Redis outage and safe cache bypass.
- Worker restart, stale lease, backlog drain and graceful shutdown.
- Roadmap stuck/failed job inspection and safe replay.
- Feature-flag rollback and verification of learner-visible behavior.
- Privacy/security incident response and secret rotation.

Runbooks must reference dashboard panels and exact redacted commands. Never include credentials or raw connection strings.

## 10. Exit criteria for Task 07

Task 07 can be marked **Done** only when:

- Unit, integration, contract and browser E2E matrices are mapped to existing tests and explicit gaps.
- Dedicated Normal Search and Build with AI E2E tests exist and pass in CI.
- Durable job recovery and provider failure-injection tests pass against isolated infrastructure.
- Search-call and shared-unit telemetry are separate and reconciled with gateway reservations.
- Dashboard panels and alerts are deployed with owners and runbooks.
- Baseline-derived SLOs are approved; no arbitrary unmeasured thresholds are represented as achieved.
- A quota-capped staging smoke test is documented and approved.

## 11. Current evidence and open gaps

**Evidence carried forward from Task 01 and source-mapped architecture:**

- Client inventory: 9 test files (5 unit, 4 Playwright E2E); no dedicated Build with AI or Normal Search browser E2E.
- Server inventory: 171 test files; 8 explicitly use an `.integration.test.js` suffix. Existing tests cover substantial curation, quota, async admission, ownership, recovery and prompt-injection logic.
- Gemini/YouTube tests use mocks; live provider behavior remains unverified.
- No load/performance harness was found in the recursive repository inventory.
- Current YouTube telemetry combines request classes into an ambiguous `quotaUnits` metric; split search calls from shared quota units.
- Render screenshot evidence shows API service deployed but no separate worker service. Worker topology/heartbeat and live flags remain pre-launch checks under Task 02.
- ADR-004 policy review remains a gate for YouTube API Data lifecycle and derived metrics; ADR-005 automated ranking benchmark remains blocked pending policy approval.

**Not done by this document:** no tests were executed, no new tests were added, no dashboards/alerts were configured, no SLO values were measured, no live provider calls were made, and no production configuration or application code was changed.

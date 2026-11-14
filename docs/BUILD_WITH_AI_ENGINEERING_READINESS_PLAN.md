# Build with AI & Course Discovery — Engineering Readiness Plan

**Status:** Discovery / pre-implementation  
**Last updated:** 2026-11-14  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Tracking issue:** [#43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Protected working rule:** do not commit to `main`; do not change product behavior until the Go/No-Go gate is approved.

## How this plan is managed

- This file and GitHub issue #43 are the source of truth for task status.
- Status values: **Not started**, **In progress**, **Blocked**, **Done**.
- A task can be marked Done only with recorded evidence: source paths, CI/test output, environment evidence, or an explicit product/architecture decision.
- Update both this file and issue #43 whenever a task changes status.
- Never paste secrets, tokens, raw database URIs, or private learner data into this plan or issue.
- Do not delete or force-update historical branches. Do not merge old PRs as part of this audit.
- Once readiness is approved, create a separate implementation branch from the then-current `main`. This documentation branch remains an audit record.

## Task board

### Task 00 — Establish controlled delivery

| Subtask | Status | Evidence |
|---|---|---|
| Create dedicated working branch from `main` | **Done** | `docs/build-with-ai-engineering-readiness` created on 2026-11-14 |
| Create central GitHub tracker | **Done** | Issue #43 |
| Establish no-direct-main and no-code-before-approval rules | **Done** | Rules recorded in this file and issue #43 |

### Task 01 — Repository and delivery baseline

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Record current `main` head | **Done** | Latest repository commit observed: `eb2f4af7ea85723d1f4940e61ffcb7962319e494` (Free-plan behavior while payments are disabled) |
| Review historical Build with AI phase PRs | **Done** | PR #5 merged to `test`; #6 merged to Phase 0 branch; #8 closed unmerged and superseded by #9; #9, #10–#17 merged. Verify branch contents before relying on historical ancestry. |
| Map active Courses-page search path | **Done** | `client/src/pages/Courses.tsx` → `GET /api/courses` → `course.controller.list` → `course.service.listPublished` → `curateNormalSearch` |
| Map separate discovery routes | **Done** | `server/src/routes/discovery.routes.js` → `discovery.controller.js` → `discovery.service.js`; separate Gemini search-specification and legacy YouTube-selector path exists |
| Map Build with AI sync/async paths | **Done** | `ai.routes.js`, `ai.controller.js`, `aiRoadmap.service.js`, `asyncRoadmap.service.js`, `nodeCuration.service.js` |
| Map intent route and frontend gate | **Done** | Server route requires `INTENT_V2`; `Courses.tsx` currently hardcodes `INTENT_V2 = false` |
| Confirm exact CI result for recorded `main` SHA | **Blocked** | Available status evidence showed Vercel success only; GitHub workflow-run lookup did not provide push-run evidence. Must verify directly from Actions/commit checks before treating CI as green. |
| Inventory all backend tests and missing integration/E2E coverage | **Not started** | Produce a test matrix with test file, layer, scenario, provider mocks, DB requirements, and gaps. |

**Baseline interpretation:** the initial source map is complete, but this is not proof that production configuration is healthy or that every CI check passed.

### Task 02 — Production topology and configuration audit

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Verify Render API service, start command, health route, region and instance plan | **Not started** | Redacted Render service configuration |
| Verify whether a separately deployed worker runs `npm run worker` | **Not started** | Render service list and worker logs |
| Verify Vercel project, production branch, build command and domain aliases | **Not started** | Redacted Vercel settings |
| Confirm production values/presence for feature flags | **Not started** | Record names and true/false/unset only |
| Confirm whether Redis is configured and reachable | **Not started** | Presence plus safe connection/health evidence; never copy URL or credentials |
| Confirm Gemini model and provider project quota | **Not started** | Model name, billing/quota tier, rate limits and usage dashboard; no API keys |
| Confirm YouTube API project quota and restrictions | **Not started** | Quota allocation, API enabled, key restrictions and current usage; no key |
| Capture production baseline metrics | **Not started** | 7-day or available-window latency, 4xx/5xx, roadmap completion, quota, cache hit rate and resource coverage |

### Task 03 — Product requirements and user journeys

| Subtask | Status | Exit criteria |
|---|---|---|
| Define Normal Search purpose and contract | **Not started** | User story, inputs, ranking rules, output shape, empty/error states |
| Define Build with AI purpose and contract | **Not started** | User story, intake, intent profile, curriculum, node/resource results |
| Decide whether normal discovery and AI roadmap share one canonical resource selector | **Not started** | Documented decision with rationale and compatibility constraints |
| Specify learner goals: learn, job-ready, exam and project | **Not started** | Inputs, conditional questions, required/optional fields and expected outputs |
| Specify resource language, level, depth and duration semantics | **Not started** | Clear distinction between study time, per-lesson duration and total curriculum duration |
| Define partial completion, retry, cancel and resume UX | **Not started** | State machine and user-visible messages |
| Define admin approval, visibility, publication, price and enrollment lifecycle | **Not started** | State-transition rules and authorization matrix |

### Task 04 — Target architecture and contracts

| Subtask | Status | Exit criteria |
|---|---|---|
| Decide canonical orchestration boundary | **Not started** | Context diagram and sequence diagrams for both journeys |
| Define Gemini responsibilities and JSON schemas | **Not started** | Versioned request/response contracts, validation, retry/fallback policy |
| Define canonical skill registry and graph invariants | **Not started** | IDs, aliases, duplicate/cycle/prerequisite repair rules |
| Define resource candidate and selected-resource contracts | **Not started** | Stable IDs, language evidence, duration, metadata provenance and freshness |
| Define evidence/confidence model | **Not started** | Distinguish metadata-derived claims from actual verified content |
| Decide durable job processing | **Not started** | Choose in-process queue vs durable queue based on deployment topology, with failure/restart analysis |
| Define cache layers and invalidation | **Not started** | Keys, scope, TTL, stale behavior, negative caching and invalidation rules |
| Define API contracts and compatibility | **Not started** | Endpoint table, auth, plan entitlement, schemas, idempotency and error codes |
| Define YouTube quota and provider degradation | **Not started** | Cost model, reserve/refuse rules, reset, retries, circuit-breaker behavior |

### Task 05 — Security, privacy and abuse review

| Subtask | Status | Exit criteria |
|---|---|---|
| Threat-model prompt injection from user input and YouTube metadata | **Not started** | Trust boundaries and mitigations |
| Review authentication and plan entitlement on every route | **Not started** | Route-by-route authorization matrix and negative tests |
| Review admin approval and public/private course isolation | **Not started** | Ownership and publication invariants |
| Review PII minimization and telemetry redaction | **Not started** | Allowed fields, retention and log redaction rules |
| Review API abuse, rate limits and per-user/global concurrency | **Not started** | Threat model and enforceable thresholds |
| Review YouTube API data retention obligations | **Not started** | Refresh/delete policy mapped to persisted fields and background jobs |

### Task 06 — Quality benchmark and unit economics

| Subtask | Status | Exit criteria |
|---|---|---|
| Define rubric for relevance, syllabus coverage, instruction, language, duration and safety | **Not started** | Human-review rubric and scoring guide |
| Create human-labelled golden topics/resources | **Not started** | Diverse representative dataset; labels independent of engine output |
| Establish baseline ranking metrics | **Not started** | NDCG@K, precision@K, recall@K, junk rate, language match and coverage |
| Define acceptance thresholds | **Not started** | Thresholds justified against baseline and product needs |
| Estimate cost per generated roadmap | **Not started** | Gemini calls/tokens, YouTube calls/quota, DB/cache and worker cost |
| Model 100, 1,000 and 10,000 monthly active learners | **Not started** | Scenario assumptions, peak concurrency and safety margin |

### Task 07 — QA, observability and operational readiness

| Subtask | Status | Exit criteria |
|---|---|---|
| Build unit-test matrix | **Not started** | Pure functions, schemas, ranking, graph and state machine |
| Build integration-test matrix | **Not started** | Mongo, Redis, Gemini and YouTube adapters mocked or sandboxed |
| Build browser E2E matrix | **Not started** | Normal search, wizard, async progress, retries, refresh/resume and enrollment |
| Define provider failure injection | **Not started** | Gemini timeout/rate-limit, YouTube quota/outage, Redis loss, Mongo transient failure |
| Define SLOs and dashboards | **Not started** | Latency, error, completion, coverage, quota, cache and worker backlog |
| Define alerts and on-call runbook | **Not started** | Thresholds based on measured baseline, not arbitrary guesses |

### Task 08 — Rollout, rollback and approval

| Subtask | Status | Exit criteria |
|---|---|---|
| Define migration and data backfill needs | **Not started** | Explicit no-migration or migration plan |
| Define feature-flag sequencing | **Not started** | One flag group at a time with compatibility matrix |
| Define staged rollout cohorts | **Not started** | Internal → small cohort → wider rollout |
| Define rollback triggers and steps | **Not started** | Tested flag rollback and in-flight job/data safety |
| Publish architecture decision records and implementation backlog | **Not started** | Approved ADRs and implementation-ready tickets |
| Complete Go/No-Go review | **Not started** | All blockers resolved or explicitly accepted; owner approval recorded |

## Initial architecture observations (not yet approved decisions)

1. **Search paths need reconciliation.** The primary catalog search uses the shared curation decision engine, while the separate discovery service still contains a Gemini-generated skill specification and the older `searchBestYouTubeCourse` selector. These paths have different latency, quota and persistence behavior.
2. **Intent V2 is not live by default in the checked-in client.** `Courses.tsx` has a hardcoded `INTENT_V2 = false`, while the backend intent controller checks `env.intentV2`. The UI and server rollout switches need a single explicit compatibility contract.
3. **Sync and async resource enrichment differ.** The synchronous roadmap path calls `attachYouTubeResources`; async mode persists a skeleton and resolves lesson nodes separately.
4. **Async queue durability must be decided against actual topology.** `asyncRoadmap.service.js` uses an in-process queue and Mongo-backed draft/admission records. A worker service exists for other maintenance jobs, but deployment and restart behavior for these workloads must be verified.
5. **Curation evidence has limits.** The current Gemini metadata judge evaluates titles, descriptions, playlist lesson names and structure signals; it does not watch videos or verify transcripts.
6. **Quota model must follow provider rules.** The repository currently tracks search calls separately and uses a Mongo-backed counter with Pacific-time day keys. Production project allocation and real usage remain to be verified.
7. **Do not conflate course search with personalized curriculum generation.** Catalog ranking, roadmap generation, per-skill curation and enrollment are separate product responsibilities even if they share a retrieval layer.

## Go/No-Go criteria

**GO** only when:
- The deployed topology and all production feature-flag values are known.
- The active frontend and backend paths are mapped and tested end-to-end.
- Product behaviors and API contracts are approved.
- Architecture decisions are documented, including the queue durability decision.
- Security/privacy and provider quota constraints are reviewed.
- The human-labelled benchmark and measurable launch thresholds exist.
- CI, integration, E2E and failure-injection gates pass.
- Rollout and rollback steps have an identified owner and are executable.

**NO-GO** if any production flag/topology is unknown, a route bypasses the agreed entitlement/security model, provider spend is unbounded, a roadmap can be silently discarded on partial resource failure, or the quality bar has no independent benchmark.

## Implementation boundary after approval

When the Go/No-Go gate is approved:
1. Create a new implementation branch from the then-current `main`.
2. Add/verify regression tests before changing shared behavior.
3. Implement one small phase per PR, each behind a safe feature flag where appropriate.
4. Require CI and reviewer acceptance before merging.
5. Change one production flag group at a time and record before/after metrics.
6. Keep this readiness branch as the design and audit history; do not merge it merely to ship documentation.

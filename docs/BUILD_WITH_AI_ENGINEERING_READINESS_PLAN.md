# Build with AI & Course Discovery — Engineering Readiness Plan

**Status:** Discovery / pre-implementation  
**Last updated:** 2026-11-14  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Tracking issue:** [#43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Protected working rule:** do not commit to `main`; do not change product behavior until the Go/No-Go gate is approved.

## How this plan is managed

- This file and GitHub issue #43 are the source of truth for task status.
- Status values: **Not started**, **In progress**, **Blocked**, **Deferred**, **Done**. Deferred items remain tracked and must be completed before production rollout.
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
| Confirm exact CI result for recorded `main` SHA | **Done — baseline classified, not fully green** | Push workflow run #43481180264: backend, frontend, production release gate and push Gitleaks checks succeeded; Vercel deployment status succeeded. Scheduled full-history Gitleaks run #43590456633 later failed with one `generic-api-key` finding in a natural-language comment in `.gitleaksignore` line 3 (the matched text describes failed/stuck Razorpay webhooks; it is not a credential). Keep this finding visible until the scanner rule/allowlist is corrected and rerun. |
| Inventory frontend/backend automated test suites | **Done** | Recursive `main` tree: 9 client test files (5 unit, 4 E2E), 171 server test files (15 under `server/src`, 156 under `server/test`). CI runs frontend lint/typecheck/unit tests/build/4 Playwright specs and backend `npm test` plus selector mock and syntax checks. |
| Assess Build with AI/Search coverage gaps | **Done — gaps recorded** | 8 backend test files are explicitly integration-named; the roadmap-admission Mongo integration test exists. No dedicated Build with AI E2E or Normal Search E2E spec exists in `client/tests`; no load/performance harness was found in the recursive repository tree. Gemini/YouTube automated tests use mocks, so provider behavior still needs controlled non-CI smoke tests. |

**Current execution priority:** proceed with Task 03 (product requirements and user journeys), followed by Task 04 (target architecture and contracts). Complete the deferred Task 02 live deployment checks before production rollout.

**Baseline interpretation:** the source map and test-file inventory are complete. The core push CI checks passed for the recorded SHA, but the later scheduled full-history Gitleaks run failed on a comment-only false-positive candidate. Production configuration and live behavior remain unverified.

#### Test inventory snapshot

- **Client:** 9 files — 5 unit tests (`aiQuotaGate`, `buildWithAiQuestionPacks`, `courseNav`, `courseSearchPolicy`, `deploymentConfig`) and 4 Playwright E2E specs (`admin-access`, `auth-accessibility`, `google-auth`, `navigation`). The current CI workflow does not include a dedicated Build with AI journey E2E spec.
- **Server:** 171 test files — 15 test files in `server/src` and 156 in `server/test`. The `server/package.json` test script is `node --test`; CI runs `npm test`.
- **Relevant existing coverage observed:** Build with AI curriculum/personalization and quota fallback; async draft idempotency, owner isolation, cancel/poll, retry and quota-limited completion; Phase 0 deterministic snapshots; Phase 3 canonical skill graph/template cache; intent question planning and fallback; per-node curation cache and quota retry; language filtering; course curation hard gates and ranking; learning-resource coverage; prompt-injection boundaries; admission recovery.
- **Integration count:** 8 files use an explicit `.integration.test.js` naming convention (`adminInvitationMongo`, `adminTrialGrantAudit`, `databaseIndexes`, `httpSecurity`, `mongoRateLimitStore`, `privacyRequests`, `roadmapAdmissionMongo`, `subscriptionWebhookMongo`). This is a naming-based inventory; other files may exercise integration behavior without that suffix.
- **Coverage gaps:** no dedicated Build with AI browser E2E, no dedicated Normal Search browser E2E, and no load/performance harness were found. Existing service/controller tests provide substantial logic coverage, but they do not prove the entire deployed learner journey.
- **Provider validation:** Gemini and YouTube are mocked in automated tests. Do not add live provider calls to regular CI; instead define a small, quota-capped, operator-run staging smoke test.
- **Not yet established:** whether the existing tests cover the full live frontend → API → MongoDB/Redis → Gemini/YouTube contract, the exact deployed flags, or production-like concurrency and failure recovery. Add these to the QA strategy before approval.

### Task 02 — Production topology and configuration audit

**Current status: partially verified; remaining dashboard work deferred until pre-launch.** The Render project screenshot dated 2026-11-14 shows `buddyforstudy-api` with dashboard status **Deployed** and only one service in the project; `buddyforstudy-worker` is not present. No worker was created and no API settings were changed. The API readiness endpoint, plan, environment values, worker heartbeat, and Vercel live settings remain unverified. The user has chosen to defer additional Render setup so current Build with AI and course-discovery engineering can proceed. Reopen the remaining deployment checks before production rollout.

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Review Render API Blueprint definition | **Done — manifest only** | `render.yaml`: API service `buddyforstudy-api`, root `server`, `npm ci`, `npm run start`, health `/api/health/ready`, region Singapore, branch `main`; actual dashboard plan/status still unknown. |
| Review Render worker Blueprint definition | **Done — manifest only** | `render.yaml`: separate `buddyforstudy-worker`, root `server`, `npm run worker`, same region/branch, 300-second shutdown window; actual service existence/status/heartbeat still unknown. |
| Verify actual Render API service, plan, status and health | **Partially verified; health/plan deferred** | Screenshot confirms `buddyforstudy-api` exists and dashboard status is `Deployed`; `/api/health/ready` and instance plan remain unverified. |
| Create and verify worker service and heartbeat | **Deferred — pre-launch** | Screenshot confirms `buddyforstudy-worker` is not currently present in the Render project. Create it from the checked-in `render.yaml` intent only during the pre-launch deployment window; then confirm running status and recent Operations heartbeat. |
| Review Vercel project configuration in repository | **Done — manifest only** | `client/vercel.json` uses Vite, `npm run build`, `dist`, SPA fallback; live project configuration and aliases remain unverified. |
| Verify Vercel production branch, root directory, build settings and domains | **Deferred — pre-launch** | Check production branch `main`, root `client`, Vite build and assigned apex/www domains. |
| Confirm actual production values/presence for feature flags | **Deferred — pre-launch** | Blueprint defaults are off: selector, Intent V2, Async Roadmap, combined search, trusted channels and compliance worker. Verify live values, names/true-false only. |
| Confirm whether Redis is configured and reachable | **Deferred — pre-launch** | Blueprint marks `REDIS_URL` optional and worker inherits API value. Confirm presence and health only; never copy URL or credentials. |
| Confirm Gemini model and provider project quota | **Deferred — pre-launch** | Model name, billing/quota tier, rate limits and usage dashboard; no API keys. |
| Confirm YouTube API project quota and restrictions | **Deferred — pre-launch** | Quota allocation, API enabled, key restrictions and current usage; no key. |
| Capture production baseline metrics | **Deferred — pre-launch / staging** | 7-day or available-window latency, 4xx/5xx, roadmap completion, quota, cache hit rate and resource coverage. |

#### Expected deployment baseline from checked-in manifests (not live-state confirmation)

- Render API: `buddyforstudy-api`, Node 24 (via `server/package.json`), `server/`, `npm run start`, readiness `/api/health/ready`.
- Render worker: `buddyforstudy-worker`, `server/`, `npm run worker`, independent background process and 300-second shutdown delay.
- Both Render services are declared for `main` in Singapore and use the shared production runtime env group.
- Vercel: Vite project with root directory expected to be `client/`, build `npm run build`, output `dist`, SPA rewrite to `index.html`.
- Manifest defaults include `USE_CURATION_ENGINE_FOR_AI=false`, `INTENT_V2=false`, `ASYNC_ROADMAP=false`, `YT_COMBINED_SEARCH=false`, `ENABLE_TRUSTED_CHANNELS=false`, and `ENABLE_CURATION_COMPLIANCE_WORKERS=false`. These are defaults, not verified production values.
- Live API readiness endpoint could not be verified through the available external fetch path; use the Render dashboard and the repository's `npm run verify:deployment` from an authorized environment.

### Task 03 — Product requirements and user journeys

**Working draft:** [Product Requirements — Normal Search & Build with AI](PRODUCT_REQUIREMENTS_BUILD_WITH_AI_AND_SEARCH.md). This is a source-grounded v0.6 draft on the readiness branch; D-01, D-03, D-05, D-07 and D-08 are approved, with D-02, D-04 and D-06 still open.

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Map Normal Search current behavior and draft its product contract | **In progress — D-01 and D-03 approved; D-02 remains open** | PRD sections 2.1, 3A and 4.2. Direct course matches take precedence; absent a direct match, a matching published module is represented by a deduplicated standalone course subject to approval/publication/readiness checks (D-03). Current main also returns supplementary curation for any non-empty query (D-02 remains open). D-01 approved: Normal Search must make zero Gemini calls; current curateNormalSearch Gemini-backed topic-syllabus dependency is an implementation gap for Task 04. |
| Map Build with AI current behavior and draft its product contract | **In progress — source mapped, contract pending decisions** | PRD sections 2.2, 3B and 4.3. Separate explicit flow, intent route, entitlement gates, sync/async modes, and the hard-disabled frontend Intent V2 constant recorded. |
| Decide whether normal discovery and AI roadmap share one canonical resource selector | **Not started — architecture decision** | PRD D-01 and Task 04; D-01 approves no Gemini in Normal Search but does not decide whether ranking/candidate code can be shared. Compare user intent, latency, quality, quota and data contracts. |
| Specify learner goals: learn, job-ready, exam and project | **In progress — target captured, needs owner approval** | PRD Journey B and goal-specific content; based on the implementation guide, not an assertion that all target details are live. |
| Specify resource language, level, depth and duration semantics | **In progress — D-05 language policy approved; D-04 and D-06 remain open** | PRD AI-04 to AI-06 and D-04 to D-06. D-05: selected language is preferred; alternate-language resources must be clearly labelled and explicitly selected by the learner before entering the path. Still distinguish course study time, study schedule and video runtime. |
| Define partial completion, retry, cancel and resume UX | **In progress — D-08 restart guarantee approved; detailed UX/contract pending** | PRD Journey B and AI-07 to AI-11. Durable recovery is required: persist job/node state, automatically resume unfinished work after API/worker restart, preserve completed outputs, process idempotently and expose bounded retry/permanent-failure states. Sync/async parity, cancel semantics and user-facing recovery details remain to be specified. |
| Define admin approval, visibility, publication, price and enrollment lifecycle | **In progress — D-07 approved; full lifecycle contract pending** | PRD D-07. Existing admin setting `content_approval_ai_courses` supports `manual` / `automatic`; `Course.js` gates automatic publication on readiness and prevents learner-private courses from being published. Still define the full publication, pricing, visibility and enrollment state-transition matrix in Task 04. |

**Confirmed product-specification conflicts requiring decisions (do not resolve by assumption):**

- **D-01 approved (2026-11-14):** Gemini is reserved for Build with AI. Normal Search must make zero direct or indirect Gemini calls. The current curateNormalSearch call path can invoke Gemini for topic-syllabus generation, so this requires an architecture/code change in a later implementation phase. This approval does not decide whether external recommendations supplement or replace local results (D-02).
- **D-03 approved (2026-11-14):** retain standalone course creation/reuse for matching published modules when no direct course match exists. Deduplicate by source course/module identity and enforce approval, publication and readiness gates; direct course matches take precedence.
- **D-05 approved (2026-11-14):** the selected resource language is the learner's preferred language. Other-language resources may be offered only as clearly labelled alternatives; the learner must explicitly choose a fallback before it is added to their learning path.
- **D-07 approved (2026-11-14):** preserve the existing admin-configurable AI-course approval modes (`manual` / `automatic`). Automatic mode may publish only eligible non-private, non-archived courses after readiness checks pass; learner-private courses remain private and unpublished. Approval does not itself grant enrollment or override separate visibility/pricing rules. Evidence: `server/src/services/contentApprovalPolicy.service.js`, `server/src/utils/typedSettingsRegistry.js`, `server/src/models/Course.js`, `server/test/courseApprovalPolicy.test.js`.
- **D-08 approved (2026-11-14):** roadmap jobs and per-step/node state must survive API/worker restarts; unfinished work is automatically recovered, completed outputs are preserved, processing is idempotent, retries are bounded/classified, and permanent failures remain visible/actionable. The exact queue/storage technology, lease/recovery protocol and deployment topology remain Task 04 architecture work.
- **D-03 approved (2026-11-14):** retain standalone course creation/reuse for matching published modules when no direct course match exists. Deduplicate by source course/module identity and enforce approval, publication and readiness gates; direct course matches take precedence.
- D-02, D-04 and D-06 remain open.
1. `docs/SEARCH_FLOW_V2_PLAN.md` says normal search should never call Gemini and should show YouTube only if local results are absent; it identifies itself as a test-branch plan.
2. Current `main` calls `curateNormalSearch` on every non-empty catalog search and returns `youtube_supplementary` resources even when local courses exist. The curation engine contains a Gemini-backed topic-syllabus path.
3. Current client source hardcodes `INTENT_V2 = false`; the backend intent route also requires its own server flag. The intent-driven flow must not be presumed live.
4. The requirements draft remains under review. D-01, D-03, D-05, D-07 and D-08 are approved; D-02, D-04 and D-06 remain open. Resolve the remaining decisions in the PRD before implementation changes.

### Task 04 — Target architecture and contracts

| Subtask | Status | Exit criteria |
|---|---|---|
| Decide canonical orchestration boundary | **Not started** | Context diagram and sequence diagrams for both journeys |
| Define Gemini responsibilities and JSON schemas | **Not started** | Versioned request/response contracts, validation, retry/fallback policy |
| Define canonical skill registry and graph invariants | **Not started** | IDs, aliases, duplicate/cycle/prerequisite repair rules |
| Define resource candidate and selected-resource contracts | **Not started** | Stable IDs, language evidence, duration, metadata provenance and freshness |
| Define evidence/confidence model | **Not started** | Distinguish metadata-derived claims from actual verified content |
| Decide durable job processing | **In progress — D-08 product guarantee approved; architecture choice pending** | Select a durable queue or equivalent recoverable job store; define persisted job/node state, idempotency, lease/claim protocol, retry classification/backoff, cancellation, crash recovery, observability and deployment topology. Do not assume a specific provider before evaluating MongoDB/Redis/worker constraints. |
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

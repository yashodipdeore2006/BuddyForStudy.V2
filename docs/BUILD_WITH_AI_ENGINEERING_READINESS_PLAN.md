# Build with AI & Course Discovery — Engineering Readiness Plan

**Status:** Discovery / pre-implementation  
**Last updated:** 2026-11-16  
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

**Working draft:** [Product Requirements — Normal Search & Build with AI](PRODUCT_REQUIREMENTS_BUILD_WITH_AI_AND_SEARCH.md). This is a source-grounded v1.0 draft on the readiness branch; all product decisions D-01 through D-08 are approved as of 2026-11-15. Architecture, implementation and validation remain pending.

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Map Normal Search current behavior and draft its product contract | **In progress — D-01, D-02 and D-03 approved** | PRD sections 2.1, 3A and 4.2. Direct course matches take precedence; absent a direct match, a matching published module is represented by a deduplicated standalone course subject to approval/publication/readiness checks (D-03). External YouTube recommendations are fallback-only (D-02); current main still returns supplementary curation for any non-empty query, an implementation gap. D-01 approved: Normal Search must make zero Gemini calls; current curateNormalSearch Gemini-backed topic-syllabus dependency is another implementation gap for Task 04. |
| Map Build with AI current behavior and draft its product contract | **In progress — D-04 adaptive onboarding approved; broader contract pending** | PRD sections 2.2, 3B and 4.3. Separate explicit flow, topic-only adaptive intake, provisional goal/level assumptions, targeted follow-up questions, editable profile review, intent route, entitlement gates, sync/async modes, and the hard-disabled frontend Intent V2 constant recorded. |
| Decide whether normal discovery and AI roadmap share one canonical resource selector | **Done — ADR-001 approved 2026-11-15** | Do not require one universal orchestrator. Flow-specific orchestration/policies remain separate; deterministic pure ranking/candidate utilities may be shared where their contracts and side effects are explicit. See [ADR-001](architecture/ADR-001-normal-search-local-first-gemini-free.md). |
| Specify learner goals: learn, job-ready, exam and project | **In progress — target captured, needs owner approval** | PRD Journey B and goal-specific content; based on the implementation guide, not an assertion that all target details are live. |
| Specify resource language, level, depth and duration semantics | **In progress — D-04, D-05 and D-06 approved; UX/contract implementation pending** | PRD AI-01 to AI-06. D-04: topic-only adaptive intake with editable, confidence-aware goal/level assumptions; D-05: selected language is preferred and alternate-language resources require explicit selection. D-06: display learning effort in hours, completion timeline in weeks based on study availability, recommended study schedule and video runtime separately. |
| Define partial completion, retry, cancel and resume UX | **Done — product lifecycle contract specified; durable implementation remains pending** | PRD Journey B lifecycle section and target architecture §§9–12 define job/node states, persisted progress, refresh/resume, retry eligibility, cancellation semantics, partial-result presentation and sync/async parity. D-08 implementation still requires an approved durable queue design, persisted leases/recovery and failure-injection evidence. |
| Define admin approval, visibility, publication, price and enrollment lifecycle | **Done — D-07 governance contract specified; implementation verification pending** | PRD D-07 and target architecture §8.1 define separate moderation/publication/visibility/readiness/pricing/enrollment dimensions, manual/automatic transitions, owner-private guard, pricing/payment/entitlement gates and open archival/rejection edge cases. Source mapping covers `Course.js`, `contentApprovalPolicy.service.js`, `courseReadiness.js`, `coursePricing.js`, `enrollment.service.js` and `Enrollment.js`. Admin endpoint audit and integration evidence remain Task 05/07 work. |

**Approved product decisions with remaining implementation conflicts:**

- **D-01 approved (2026-11-14):** Gemini is reserved for Build with AI. Normal Search must make zero direct or indirect Gemini calls. The current curateNormalSearch call path can invoke Gemini for topic-syllabus generation, so this requires an architecture/code change in a later implementation phase.
- **D-02 approved (2026-11-15):** external YouTube recommendations are fallback-only. Search suitable published BuddyForStudy courses first; if none, search eligible published module/standalone-course matches; call external YouTube discovery only if neither local path yields a suitable result. Current main returns supplementary curation for every non-empty query, so this requires a later implementation change.
- **D-03 approved (2026-11-14):** retain standalone course creation/reuse for matching published modules when no direct course match exists. Deduplicate by source course/module identity and enforce approval, publication and readiness gates; direct course matches take precedence.
- **D-05 approved (2026-11-14):** the selected resource language is the learner's preferred language. Other-language resources may be offered only as clearly labelled alternatives; the learner must explicitly choose a fallback before it is added to their learning path.
- **D-07 approved (2026-11-14):** preserve the existing admin-configurable AI-course approval modes (`manual` / `automatic`). Automatic mode may publish only eligible non-private, non-archived courses after readiness checks pass; learner-private courses remain private and unpublished. Approval does not itself grant enrollment or override separate visibility/pricing rules. Evidence: `server/src/services/contentApprovalPolicy.service.js`, `server/src/utils/typedSettingsRegistry.js`, `server/src/models/Course.js`, `server/test/courseApprovalPolicy.test.js`.
- **D-08 approved (2026-11-14):** roadmap jobs and per-step/node state must survive API/worker restarts; unfinished work is automatically recovered, completed outputs are preserved, processing is idempotent, retries are bounded/classified, and permanent failures remain visible/actionable. The exact queue/storage technology, lease/recovery protocol and deployment topology remain Task 04 architecture work.
- **D-04 approved (2026-11-14):** adopt adaptive onboarding for topic-only learners. AI proposes a provisional learning goal and skill level, asks a few targeted adaptive questions for missing/low-confidence information, allows “not sure” and optional skips, and presents an editable review distinguishing learner-confirmed values, AI-inferred assumptions and unknowns before generation. This does not enable Intent V2 or change production flags.
- **D-03 approved (2026-11-14):** retain standalone course creation/reuse for matching published modules when no direct course match exists. Deduplicate by source course/module identity and enforce approval, publication and readiness gates; direct course matches take precedence.
- **D-06 approved (2026-11-14):** display estimated learning effort in hours, completion timeline in weeks derived from available study time, recommended study schedule, and external video runtime as separate values; make assumptions explicit.
1. `docs/SEARCH_FLOW_V2_PLAN.md` says normal search should never call Gemini and should show YouTube only if local results are absent; it identifies itself as a test-branch plan.
2. Current `main` calls `curateNormalSearch` on every non-empty catalog search and returns `youtube_supplementary` resources even when local courses exist. The curation engine contains a Gemini-backed topic-syllabus path.
3. Current client source hardcodes `INTENT_V2 = false`; the backend intent route also requires its own server flag. The intent-driven flow must not be presumed live.
4. All product decisions D-01 through D-08 are approved. Product requirements are agreed; the detailed technical architecture, API contracts, security/quality review, implementation, test evidence and Go/No-Go approval still remain.

### Task 04 — Target architecture and contracts

| Subtask | Status | Exit criteria |
|---|---|---|
| Decide canonical orchestration boundary | **Done — ADR-001 approved 2026-11-15** | Accepted context boundary and Normal Search sequence/API contract: [ADR-001](architecture/ADR-001-normal-search-local-first-gemini-free.md). Normal Search is local-first and Gemini-free; Build with AI retains its dedicated Gemini pipeline |
| Define Gemini responsibilities and JSON schemas | **In progress — ADR-006 validation/versioning proposal documented; approval and implementation pending** | [ADR-006](architecture/ADR-006-versioned-gemini-output-validation.md) specifies immutable task contracts, strict server-owned validation, semantic checks, prompt/schema compatibility, rollback, cache identity and failure policy. Approval points: compatibility window and corrective-regeneration policy; strict validators and compatibility tests remain implementation work |
| Define canonical skill registry and graph invariants | **In progress — ADR-003 and benchmark protocol documented; owner decisions and measured benchmark pending** | [ADR-003](architecture/ADR-003-domain-aware-skill-resolution.md) defines domain-scoped deterministic matching, ambiguity-first fuzzy candidate discovery, alias governance, provisional concepts and stable-ID compatibility. [Benchmark specification](architecture/SKILL-RESOLUTION-BENCHMARK-SPEC.md) defines adjudication, concept-cluster splits, holdout controls, metrics and approval gates. Cross-domain scope, provisional persistence, alias-review ownership and migration remain approval items; no fuzzy threshold is selected without measured holdout evidence |
| Define resource candidate and selected-resource contracts | **In progress — resource contract documented; policy review, lifecycle implementation and approval pending** | [Learning Resource Candidate and Selection Contract](architecture/LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md) separates curriculum requirements, provider candidates, replaceable metadata snapshots, selection decisions and first-party learner state; defines evidence labels, language choice, node states, freshness and UI/player behavior. [ADR-004](architecture/ADR-004-youtube-resource-data-lifecycle.md) remains the policy/lifecycle source: 30-day non-authorized data deadline, incomplete video/playlist refresh, worker gap, Made For Kids/attribution and derived-metric release blocker. No API-derived ranking method is approved |
| Define evidence/confidence model | **In progress — cross-flow contract documented; owner approval, calibration policy and implementation pending** | [Build with AI Evidence and Confidence Model](architecture/BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md) defines evidence classes, provenance envelope, typed confidence, intent/profile/curriculum/skill/syllabus/resource/learning-outcome contracts, conflict/staleness rules, disclosure, privacy and acceptance criteria. It explicitly rejects universal or uncalibrated confidence scores and distinguishes activity from mastery |
| Decide durable job processing | **In progress — ADR-002 recommendation documented; product-owner approval and implementation remain pending** | [ADR-002](architecture/ADR-002-durable-roadmap-job-processing.md) compares MongoDB queue vs BullMQ/Redis and proposes MongoDB as the initial durable queue/system of record with a dedicated worker. Open items: approval, job model, terminal retention, atomic claim/lease/fencing, restart recovery, cross-process event delivery and failure-injection tests |
| Define cache layers and invalidation | **In progress — full cache contract documented; owner approval, measurements and implementation pending** | [Cache Architecture and Invalidation Contract](architecture/BUILD-WITH-AI-CACHE-ARCHITECTURE-AND-INVALIDATION.md) inventories current intent/template/course-reuse/syllabus/candidate/evaluation/result/node/provider caches and TTLs; specifies key dimensions, data scopes, versioning, negative-cache rules, invalidation matrix, tier failure/stampede semantics, provider/user deletion and telemetry. Current TTLs are baseline facts, not target approvals; measure before changing them |
| Define API contracts and compatibility | **In progress — source-mapped API compatibility proposal documented; approval, implementation and contract tests pending** | [Build with AI API Contracts and Backward Compatibility](architecture/BUILD-WITH-AI-API-CONTRACTS-AND-COMPATIBILITY.md) inventories current intent/sync/async routes, differing request schemas, mode-dependent `POST /api/ai/roadmap` semantics and current response helpers. Proposes versioned DTOs, job-oriented routes, stable success/error envelopes, sync/async parity, client migration and a 90-day/two-release compatibility window. Owner decisions and implementation remain open. ADR-001 continues to define Normal Search `GET /api/courses`. |
| Define YouTube quota and provider degradation | **In progress — ADR-005 quota/quality model proposed; live telemetry and policy decision pending** | [ADR-005](architecture/ADR-005-curation-quality-and-youtube-quota-model.md) records Google's separate default buckets (100 `search.list` calls/day and 10,000 other units/day), current app caps (90/9,000), source-derived cold-call fan-out, a 14-node stress estimate, evaluator quota risk and proposed quality gates. [ADR-004](architecture/ADR-004-youtube-resource-data-lifecycle.md) records the 2026 audited-analytics exception and why it cannot be assumed for education curation. Verify actual Cloud Console quota, split endpoint telemetry, live staging cost, and obtain policy approval or redesign metrics |

### Task 04 approved architecture — 2026-11-15 (ADR-001)

**Observed primary Normal Search request path**
- `client/src/pages/Courses.tsx` calls `GET /api/courses` for the normal catalog search. It can call `GET /api/discovery/search` only for the legacy playlist fallback when the catalog response has no `curatedResources` property.
- `server/src/services/course.service.js:listPublished` searches direct published course fields and then eligible published modules/standalone courses. It currently invokes `curateNormalSearch` unconditionally after those local lookups, even when local courses were found, and labels the response `youtube_supplementary`. This conflicts with approved D-02.
- The current `hasLocalResults` value is based on the current page's `localCourses.length`, not the total number of local matches. The fallback gate must use the complete local-match count, not page contents, so an out-of-range page cannot trigger YouTube discovery when matching local courses exist.
- `server/src/services/courseCurationDecisionEngine.service.js` currently constructs a Gemini client and has two model-generation paths: `getTopicSyllabus` and `evaluateCandidatesWithMetadataRubric`. Either can invoke Gemini from the normal-search curation path, conflicting with approved D-01.
- The legacy `GET /api/discovery/search` controller path calls `searchStructuredPlaylists`; it is distinct from `GET /api/discovery/course-search`, whose `searchCourseBySkills` path uses a Gemini-generated search specification. The current Courses page normal-search handler does not call `/api/discovery/course-search`; preserve this separation explicitly in the API contract.

**Approved architecture direction — implementation remains a separate gated phase**
1. **Approved:** `course.service.listPublished` is the sole local-first orchestrator: direct published courses first, then eligible published module/standalone courses, and YouTube fallback only when the total eligible local match count is zero.
2. **Approved:** Normal Search curation is deterministic. The syllabus and metadata-judge Gemini calls are forbidden on this call graph; deterministic candidate expansion, existing hard gates, metadata heuristics and ranking remain the fallback path. Generic heuristic outlines are not verified topic curricula.
3. **Approved:** Build with AI keeps its Gemini orchestration behind dedicated intent/roadmap services. Normal Search must not route through the Gemini-enabled `/api/discovery/course-search` workflow.
4. **Approved:** Return a `youtube_fallback` payload only when eligible local matches are absent; otherwise omit discovery metadata. Keep external recommendations separate from published BuddyForStudy course records.
5. **Implementation acceptance:** add regression coverage for direct local matches, eligible module/standalone matches, unpublished/pending standalone records, empty-local fallback, quota/provider failures, later pages with zero rows but positive total matches, stale fallback clearing, and zero Gemini calls when credentials are configured.

### Task 04 Queue architecture proposal — 2026-11-15 (ADR-002)

**Decision record:** [ADR-002 — Durable roadmap job processing](architecture/ADR-002-durable-roadmap-job-processing.md). The proposal recommends a MongoDB-backed durable queue and separate worker for the initial scale, with BullMQ/Redis reserved for evidence-based migration triggers. This is not yet an approved technical decision. The current API-process queue, one-hour draft TTL and maintenance-only worker do not meet D-08. The proposal specifies atomic claims, execution leases/fencing, retry classification, node-level resume, DB-backed event replay, terminal-only retention and failure-injection acceptance tests. Product-owner approval is required before implementation.

### Task 04 Curation quality and YouTube quota model — 2026-11-15 (ADR-005)

**Decision record:** [ADR-005 — Curation quality benchmark and YouTube quota operating model](architecture/ADR-005-curation-quality-and-youtube-quota-model.md). The official quota model separates 100 `search.list` calls/day from 10,000 shared units/day for other endpoints; checked-in app caps are 90 and 9,000, with soft degradation at 80%. Source-derived cold-pass upper bounds are up to 10 search calls / 222–228 shared units for a normal curation and up to 4 search calls / 216 shared units for a Build with AI node. A 14-node cold roadmap stress envelope is up to 56 search calls and 3,024 shared units. The current live golden-set runner could exceed the 100-call search bucket with 30–50 cold topics; use a frozen snapshot or quota-preflighted small live batches. Proposed targets are NDCG@10 ≥0.80, P@5 ≥0.80, Recall@10 ≥0.70, junk rate@10 ≤0.05, zero explicit-language mismatches/hard-gate failures, and a 100-resource human playback sample. These are proposals, not measured results; automated ranking metrics remain policy-gated. Endpoint telemetry currently combines search and default-bucket calls into `quotaUnits`; split them before staging cost measurement.

**Evaluation guide updated:** [Course Curation Decision Engine evaluation](backend/COURSE_CURATION_EVALUATION.md) now warns against an unbounded live golden-set run, suspends hidden-gem labels pending policy clearance, and distinguishes metadata-reported coverage from content verification.

### Task 04 YouTube resource data lifecycle — 2026-11-15 (ADR-004)

**Decision record:** [ADR-004 — YouTube resource data lifecycle, freshness and policy controls](architecture/ADR-004-youtube-resource-data-lifecycle.md). Current non-authorized YouTube API metadata must be deleted or refreshed within 30 calendar days. Short in-process/Redis/Mongo cache TTLs are generally below this limit, but durable course snapshots depend on a refresher that is gated by `ENABLE_CURATION_COMPLIANCE_WORKERS=false` in the manifest; readiness evidence also says the Render worker is not deployed. The current 25-day refresher only updates some video fields and does not refresh playlist metadata/membership; schema defaulting can assign a false `fetchedAt` time. Most importantly, the curation engine currently computes engagement/authority/score metrics from view, like, comment and subscriber counts, which conflicts with the current policy wording on derived metrics. Treat statistic-based scoring as a compliance blocker pending remediation/review. Also verify Made For Kids handling and YouTube attribution.

### Task 04 Canonical skill registry proposal — 2026-11-15 (ADR-003)

**Decision record:** [ADR-003 — Domain-aware canonical skill resolution](architecture/ADR-003-domain-aware-skill-resolution.md). The current resolver searches every registry record without domain scope, uses a fixed 0.8 token-similarity threshold without a top-two margin, automatically adds aliases after fuzzy matches, and uses globally slugged IDs. The proposal introduces domain-scoped candidate lookup, exact/approved-alias matching, fuzzy suggestions without automatic merges until a labelled benchmark is approved, Unicode/technical-token-safe normalization, alias provenance, provisional candidates and stable-ID migration safeguards. The repository tree contains no dedicated skill-registry resolver unit test suite. This is a proposed contract only; no thresholds, migrations or code changes are approved.

### Task 04 Build with AI target architecture — 2026-11-15 (draft v0.1)

**Architecture document:** [Build with AI — Target Architecture and API Contracts](architecture/BUILD-WITH-AI-TARGET-ARCHITECTURE.md).

**Source-mapped current-state findings**
- Intent parse uses Gemini classification, Zod `IntentProfile`, confidence-derived question planning, a 3-second timeout/static fallback and a 30-day cache. The intent route is gated by both entitlements and `INTENT_V2`; main-branch client Intent V2 remains hardcoded off.
- Gemini curriculum generation uses `roadmapSchema` through the provider's JSON response mode, but the server currently parses JSON and performs only a minimal non-empty-skills check before later normalization/graph repair. Add strict server-side schema/semantic validation before template caching.
- Roadmap templates are generic and are personalized after cache lookup. The current template key helper hashes topic, goal, level, language, prompt version, outcome and preferences; the generation profile also carries course depth separately. Add depth and schema version to cache identity.
- Skill registry resolution currently checks exact names/aliases, normalized slug and token similarity (0.8 threshold), but matching is not domain-scoped and has no explicit ambiguity margin. Calibrate before treating fuzzy matches as canonical.
- Current graph validator repairs duplicates, invalid prerequisite edges and cycles, trims to 14 skills, and inserts generic nodes when fewer than 3 remain. The target contract requires audited repair and forbids presenting synthetic generic nodes as topic-specific AI-authored coverage.
- Sync and async course persistence differ. Async generation sets private visibility and owner; synchronous `Course.create` sets published true but does not set `createdForUser` or private visibility. This is a verified D-07 gap for learner-specific roadmaps.
- Async drafts/events are persisted, but work is queued through process-local `queue[]`; `RoadmapDraft.createdAt` has a one-hour TTL. The separate `server/src/jobs/worker.js` runs maintenance and admission recovery but does not consume roadmap drafts; recovery marks expired work failed rather than resuming it. This does not satisfy D-08. See proposed ADR-002.
- Per-node resource curation has canonical skill/language/duration cache inputs, best/alternative results and quota-limited states. Preferred-language-first plus explicit learner selection of other-language alternatives must be enforced in the full path.

**Target architecture and contracts now documented**
- IntentParseV1, RoadmapTemplateV1 and ExamSyllabusExtractV1 responsibilities and schemas.
- Strict server validation, semantic graph checks, prompt/schema versioning and bounded provider failure behavior.
- Domain-aware canonical skills, alias/ambiguity rules, 3–14 node graph invariant, prerequisite DAG, topological ordering and repair report.
- Curriculum composer responsibilities, goal-specific modules, known-skill personalization and schedule calculations.
- Per-node resource selection, D-05 language policy, metadata-only evidence, confidence and resource state contract.
- Confirmed-profile build request, sync/async API compatibility, ownership/privacy invariants, and D-08 durable job/node state.
- Cache boundaries and implementation acceptance matrix.

**Still open:** durable queue/job-store technology; exact fuzzy matching threshold/margin and alias migration; resource persistence and provider-retention design; cache TTL/invalidation values; strict runtime schema enforcement and regression evidence. This is an architecture draft, not implementation approval.

Decision approval and this ADR update changed documentation only. No product code, production flags, or `main` branch files were changed.

### Task 05 — Security, privacy and abuse review

**Current status: In progress — source-mapped threat model documented and initial SEC-01/SEC-02 code remediations applied on this branch. Automated regression tests, runtime security checks and the remaining findings are still open.**

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Threat-model prompt injection from user input and YouTube metadata | **In progress — trust boundaries and controls mapped; adversarial tests pending** | Security review §§2–3 and 6. Existing `serializeUntrustedPromptData` is used in roadmap, syllabus, curation metadata and quiz prompts; coverage and model behavior still require adversarial tests. |
| Review authentication and plan entitlement on every route | **In progress — key auth/entitlement paths sampled; complete route matrix pending** | JWT/token-version checks, auth route gates, feature entitlements and course-learning access reviewed. Complete route-by-route negative tests and OTP/invitation review remain open. |
| Review admin approval and public/private course isolation | **In progress — RBAC and selected course controls reviewed; full matrix pending** | Admin permission middleware, role profiles, governance lock, self-role-change denial and last-active-Super-Admin protection observed. Verify all sensitive routes and private-course ownership paths. |
| Review PII minimization and telemetry redaction | **In progress — logging/export controls reviewed; retention audit pending** | Safe request/error telemetry and requester-scoped partial export observed. Password-hash over-fetch in auth middleware flagged for hardening; verify Sentry, background logs, audit retention and export completeness. |
| Review API abuse, rate limits and per-user/global concurrency | **In progress — SEC-02 code change applied; tests pending** | The exhausted-bank background path now passes the learner ID, and the queue helper rejects a missing actor so the existing atomic monthly quiz-usage reservation runs. A fail-closed guard test was added; monthly-limit integration tests, multi-instance deduplication, per-user burst controls and global provider-budget verification remain open. |
| Review YouTube API data retention obligations | **In progress — ADR-004 source review recorded; policy/runtime remediation pending** | ADR-004 covers 30-day refresh/delete and derived-metric policy risks. Verify complete refresh/delete execution, live worker topology and policy approval before launch. |
| Review new-account legal consent and privacy-request fulfilment | **In progress — gaps documented** | SEC-03: Google new-account endpoint permits omitted legal acknowledgements. SEC-04: privacy deletion requests have no execution path; export is explicitly partial. Define and implement server-enforced consent and auditable deletion/anonymization. |
| Remediate async roadmap profile validation boundary | **Code change applied — regression tests pending (SEC-01)** | Nested `intentProfile` now uses the strict shared `IntentProfile` schema and an explicit field whitelist; arbitrary nested keys are no longer merged into the validated profile. Focused tests were added for unknown-key rejection and whitelisted normalization; execution and real client-payload compatibility checks remain pending. |
| Remove password hash from normal auth request context | **Open — Low hardening finding SEC-05** | `auth.js` loads `+password` for all authenticated requests although only auth-service password operations need it. Remove after consumer audit and test query projection. |

**Security findings requiring remediation/verification:** SEC-01 (strict schema and whitelist code change applied; regression tests pending, Medium); SEC-02 (actor propagation and fail-closed queue code change applied; usage and concurrency tests pending, High); SEC-03 (Google new-account legal-consent enforcement, Medium / policy decision); SEC-04 (privacy deletion execution absent, High readiness gap); SEC-05 (password hash loaded in every authenticated request, Low hardening). See the review document for source paths, impact, fixes and acceptance tests.

### Task 06 — Quality benchmark and unit economics

**Current status: In progress — benchmark protocol and quota/economics model documented in [ADR-005](architecture/ADR-005-curation-quality-and-youtube-quota-model.md); empirical validation and compliance gates remain open.**

| Subtask | Status | Evidence / exit criteria |
|---|---|---|
| Define rubric for relevance, syllabus coverage, instruction, language, duration and safety | **Done — protocol defined; policy-gated use** | ADR-005 §12 defines 0–4 human playback dimensions, overall relevance labels, hard exclusions, reviewer adjudication and dataset governance. |
| Create human-labelled golden topics/resources | **Not started** | Existing JSON remains a placeholder. Build 30–50 stratified topic families and at least 100 playback inspections after compliance approves data handling. |
| Establish baseline ranking metrics | **Blocked — YouTube policy review** | Existing evaluator is live-provider-backed; automated NDCG/precision/recall/junk metrics must not run or be retained until policy clearance and an approved snapshot method exist. |
| Define acceptance thresholds | **Done — proposed, not validated** | ADR-005 §§7.2 and 12.5: NDCG@10 ≥0.80, P@5 ≥0.80, Recall@10 ≥0.70, junk rate@10 ≤0.05, ≥90% human playback relevance, zero hard-gate/language violations; no achieved baseline is claimed. |
| Estimate cost per generated roadmap | **In progress — formula and illustrative sensitivity documented** | ADR-005 §13 separates Gemini token charges, YouTube quota units and infrastructure invoices. Actual token usage/model/tier and infra billing are not verified. |
| Model 100, 1,000 and 10,000 monthly active learners | **Done — cold upper-bound stress model; forecast pending** | ADR-005 §13.3 models 10% monthly roadmap adoption, 14 nodes, no cache reuse and 30 days; the 1,000/10,000-MAU cases exceed current app quota under these assumptions. |

### Task 07 — QA, observability and operational readiness

**Current status: In progress — QA, failure-injection, observability, SLO and runbook design documented in [QA, Observability and Operational Readiness](QA_OBSERVABILITY_OPERATIONAL_READINESS.md). No tests, telemetry, dashboards or alerts have been implemented or executed.**

| Subtask | Status | Exit criteria |
|---|---|---|
| Build unit-test matrix | **Done — matrix defined; test mapping/execution pending** | QA strategy §2.1 maps search, Gemini isolation, intent, curriculum graph, resource language, ownership, async state, quota/cache and security invariants. |
| Build integration-test matrix | **Done — matrix defined; execution pending** | QA strategy §3 maps Mongo, Redis, durable jobs, quota concurrency, provider adapters and auth/entitlement integration scenarios. |
| Build browser E2E matrix | **Done — journeys defined; dedicated specs pending** | QA strategy §4 defines Normal Search local/fallback, adaptive onboarding, roadmap, language choice, async recovery, partial failure, moderation and enrollment journeys. Existing dedicated Build with AI and Normal Search browser specs are still absent. |
| Define provider failure injection | **Done — scenarios defined; tests pending** | QA strategy §5 covers Gemini timeout/429/invalid output, YouTube quota/timeout, Mongo/Redis outage, worker crash and browser reconnect. |
| Define SLOs and dashboards | **In progress — metric contract documented; baseline/dashboard pending** | QA strategy §6 defines application, provider, quota and worker signals. §7 defines SLI categories; numeric targets must be set from measured baseline, not invented. Split YouTube search calls from shared quota units before cost dashboards. |
| Define alerts and on-call runbook | **In progress — severity/runbook requirements documented; implementation pending** | QA strategy §§7 and 9 define alert severity, ownership and runbook topics. Configure actual panels/alerts and publish executable runbooks before rollout. |

**Task 07 implementation gaps:** no tests were added or run; no dashboard/alert configuration was changed; no SLO baseline has been measured; no live provider smoke test was run. Keep this task open until the exit criteria in QA strategy §10 are evidenced.
 
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


### Task 04 Gemini schema validation and versioning — 2026-11-16 (ADR-006)

**Decision record:** [ADR-006 — Versioned Gemini output validation and prompt compatibility](architecture/ADR-006-versioned-gemini-output-validation.md). The proposal makes server-owned strict validation authoritative over provider response schemas, requires semantic validation before cache/persistence, treats contract versions as immutable, pairs prompt versions independently, and defines cache compatibility, rollback, bounded retry and sanitized telemetry. Product/engineering approval and runtime implementation remain pending. No validators, prompts, flags or application behavior were changed in this documentation task.


### Task 04 canonical skill resolution benchmark — 2026-11-16

**Evaluation protocol:** [Skill Resolution Benchmark Specification](architecture/SKILL-RESOLUTION-BENCHMARK-SPEC.md). Added a versioned pair-label format, required hard-negative/domain/Unicode strata, independent adjudication, concept-clustered development/calibration/holdout splits, false-merge-first metrics and explicit approval gates. No dataset, threshold or benchmark result is claimed yet. ADR-003 now links to this protocol. Resolver implementation and registry data remain unchanged.


### Task 04 learning-resource candidate and selection contract — 2026-11-16

**Contract:** [Learning Resource Candidate and Selection Contract](architecture/LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md). It separates curriculum requirements, provider candidate identity, replaceable YouTube metadata snapshots, selected-resource decisions and first-party learner progress/feedback. It defines categorical evidence labels, preferred-language/explicit-choice behavior, node states, freshness/deletion integration and player/attribution expectations. The contract explicitly blocks unapproved API-derived scoring/ranking pending policy review. This is documentation only; no provider calls, data migrations, ranking changes or application behavior were changed.


### Task 04 evidence and confidence model — 2026-11-16

**Contract:** [Build with AI Evidence and Confidence Model](architecture/BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md). This extends provenance across intent parsing, learner profile, Gemini curriculum claims, canonical skill identity, official-syllabus grounding, resource evidence and learning outcomes. It distinguishes model-reported confidence from calibrated assessments, rejects a universal confidence score, defines claim-specific conflict/staleness handling, and separates activity/completion from demonstrated mastery. Owner approval, assessment-specific calibration datasets, privacy/retention decisions and implementation remain pending. Documentation only; no prompts, APIs, schemas, models, data or runtime behavior changed.


### Task 04 cache architecture and invalidation — 2026-11-16

**Contract:** [Build with AI Cache Architecture and Invalidation Contract](architecture/BUILD-WITH-AI-CACHE-ARCHITECTURE-AND-INVALIDATION.md). The current implementation was inspected across intent parsing, roadmap templates, generated-course reuse, curation syllabus/candidate/evaluation/result caches, node curation, YouTube search/detail maps, Redis and Mongo TTL models. The document distinguishes disposable computation caches from persistent product state; specifies versioned key dimensions, data scopes, expiry, invalidation, negative-cache, cache-tier failure, stampede, privacy and provider retention rules. Existing TTLs are recorded as baseline facts only; new TTL targets and implementation remain pending measured evidence and approval.


### Task 04 API contracts and backward compatibility — 2026-11-16

**Contract:** [Build with AI API Contracts and Backward Compatibility](architecture/BUILD-WITH-AI-API-CONTRACTS-AND-COMPATIBILITY.md). Source inspection found that `POST /api/ai/roadmap` changes request meaning according to `ASYNC_ROADMAP`, sync and async profile validators differ, success responses spread endpoint data at the top level, and controller-level error mapping is only partially standardized. The proposal defines versioned intent/build/job/result DTOs, a job-oriented v1 route family, stable response/error envelopes, sync/async parity, legacy migration rules and contract-test gates. The 90-day/two-release compatibility window and route/DTO choices are proposals awaiting owner approval. No application code, route, flag, database, deployment setting or `main` branch was changed; no tests were run.

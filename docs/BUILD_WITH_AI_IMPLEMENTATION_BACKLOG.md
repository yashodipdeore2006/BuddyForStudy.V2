# BuddyForStudy — Build with AI & Course Discovery Implementation Backlog

**Backlog version:** 1.0  
**Snapshot date:** 2026-11-16  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Tracker:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Readiness report:** [Build with AI Engineering Readiness Report](BUILD_WITH_AI_ENGINEERING_READINESS_REPORT.md)
**Decision packets:** [Build with AI Decision & Approval Packets](BUILD_WITH_AI_DECISION_APPROVAL_PACKETS.md)
**Decision status:** [Decision Resolution Register & Authorization Gate](BUILD_WITH_AI_DECISION_RESOLUTION_REGISTER.md) — Task 15 assessed; actual approvals remain pending.
**Normal Search implementation specification:** [NORMAL-SEARCH-IMPLEMENTATION-SPEC.md](architecture/NORMAL-SEARCH-IMPLEMENTATION-SPEC.md) — D-01/D-02/D-03 implementation and test preparation; coding remains subject to DEC-RELEASE-01 and DEC-YT-01. — DEC-YT-01, DEC-JOB-01, DEC-PRIV-01 and DEC-PRIV-02; awaiting authorized review, no approval implied.  
**Decision records:** [Architecture directory](architecture/)

---

## 1. Purpose and execution boundary

This backlog converts the source-mapped P0/P1/P2 blockers and approved product decisions D-01 through D-08 into sequenced, independently verifiable implementation work.

**This document is an implementation plan, not an implementation authorization.** It does not approve any proposed ADR, legal/policy interpretation, queue technology, package, infrastructure change, feature flag, deployment, merge or production rollout. No product code is to be changed until the formal Go/No-Go and implementation-authorization gate is recorded.

The backlog is maintained on the documentation branch. When implementation is authorized, create a separate implementation branch from the then-current main. Do not use this documentation branch as a product implementation branch.

### Planning rules

- **P0 — release blocker:** must be closed before enabling the affected new behavior or approving a broad rollout.
- **P1 — pre-pilot / affected-feature gate:** must be closed before a controlled pilot of the affected surface. A risk cannot be waived silently; record a named approver and residual-risk decision.
- **P2 — scale and operational maturity:** must be completed before broad rollout or before the relevant scale/availability target is claimed.
- A dependency marked **approval required** is a real gate. Engineering must not infer the approval from a proposed ADR or from this backlog.
- No individual owners, calendar dates, story points or delivery estimates are assigned here. The responsible product, engineering, security/privacy, legal/compliance and operations owners must be named during planning.
- Each item closes only with linked code/PR evidence and the stated test, review, policy or operational evidence. Documentation alone does not close an implementation item.
- Tests and staging calls must use synthetic data and approved, bounded provider budgets. Do not run an unbounded cold-cache YouTube benchmark.
- Historical tests and CI results remain historical. Re-run relevant checks on the implementation commit.

## 2. Current decision gates

| Gate | Decision needed | Current state | Work blocked until closure |
|---|---|---|---|
| G-01 — YouTube policy | Written determination for the exact API Data fields, storage, refresh, evaluation and any proposed derived metrics; or an explicit launch scope that excludes unapproved metrics | **Open — policy clearance not evidenced** | API-derived scores/ranking/evaluation; policy-dependent benchmark; persistence of affected derived data |
| G-02 — durable jobs | Explicit approval or rejection of ADR-002, including durable store, claim/lease/fencing, worker topology, event recovery and retention | **Open — ADR-002 proposed** | Durable queue implementation and Async Roadmap enablement |
| G-03 — API compatibility | Approval of the public request/response, job-state, error and legacy migration contract | **Open — proposed contract** | New job API/client migration and compatibility-window commitment |
| G-04 — privacy/legal | Approved consent purpose/version rules, deletion/anonymization scope, legal holds, retention and export completeness | **Open — owner decision required** | Final SEC-03/SEC-04 behavior and policy claims |
| G-05 — skill governance | Approval of domain representation, alias governance, migration rules and benchmark acceptance process | **Open — ADR-003 proposed** | Automatic alias merges, registry migrations and production threshold changes |
| G-06 — Gemini contract | Approval of schema/prompt versioning, compatibility, repair/retry and rollback rules | **Open — ADR-006 proposed** | Runtime contract migration and prompt/schema rollout |
| G-07 — rollout authority | Product, engineering, security/privacy and operations sign-off based on current evidence | **Open — current recommendation NO-GO** | Product-code rollout, production flag enablement, merge/release authorization |

**Policy-safe default:** until G-01 is resolved, do not build, persist, expose or benchmark custom derived ranking/quality/engagement/coverage metrics based on YouTube API Data. The launch scope must use only methods and fields confirmed as permitted by the applicable policy review. An absence of policy approval is not approval.

## 3. Prioritized backlog

### P0 — release blockers

#### P0-01 — Resolve YouTube API Data policy and launch scope

**Outcome:** an approved, implementable boundary for all YouTube API Data use in search, curation, persistence, evaluation and learner-facing explanations.

**Dependencies:** G-01; product and legal/compliance review.

**Work:**
- Record the exact API Data fields and transformations used by each search, ranking, filtering, scoring, cache, course-snapshot and evaluation path.
- Obtain a written decision for BuddyForStudy's exact educational-resource use case and each proposed derived metric. Do not assume an exception for analytics/reporting covers recommendation or educational ranking.
- Choose and record one of two launch paths: (a) exact method and data handling receive written clearance, or (b) affected derived metrics are removed/disabled and the launch uses only a reviewed policy-safe selection method.
- Define which metadata may be stored, for how long, how refresh/deletion is proven, and which evidence may be shown to learners.
- Reconcile ADR-004, ADR-005, the candidate-selection contract and the curation evaluation guide to the decision.

**Acceptance evidence:**
- Written decision linked from the tracker and relevant ADRs.
- Field-by-field allow/deny register covering acquisition, transformation, persistence, display, evaluation and deletion.
- A scope decision for any unapproved scores or ranking features; no ambiguous “temporary” exception.
- Security/compliance review of the implementation plan before the affected code work begins.

**Status:** Blocked on external/owner decision. No implementation approval implied.

#### P0-02 — Approve the durable roadmap job architecture (D-08)

**Outcome:** a selected architecture that satisfies restart recovery without silently losing accepted work.

**Dependencies:** G-02; API compatibility decision G-03 for public job semantics.

**Work:**
- Review ADR-002 and explicitly accept, revise or reject its MongoDB-backed queue/system-of-record and dedicated-worker recommendation.
- Decide the authoritative job and node state, atomic claim protocol, lease expiry, fencing/version checks, retry classification, idempotency key, cancellation semantics, active-job retention and terminal retention.
- Decide how progress events are persisted/replayed across API and worker restarts, including reconnecting clients.
- Define worker concurrency, duplicate-worker behavior, poison-job handling, bounded retry/backoff and operational ownership.
- Record the deployment topology and recovery runbook. Do not assume Redis/BullMQ, MongoDB queue or a Render worker is approved by the D-08 outcome alone.

**Acceptance evidence:**
- Accepted ADR with all unresolved alternatives and trade-offs decided.
- State-transition and sequence diagrams for submission, claim, node completion, retry, cancellation, restart and terminal failure.
- Documented retention/index and migration plan.
- Failure-injection acceptance matrix approved before implementation.

**Status:** Blocked on explicit architecture approval.

#### P0-03 — Enforce learner ownership and private-course invariants (D-07, SEC-08)

**Outcome:** synchronous generation, asynchronous generation, save, prepare, enroll and course resolution all enforce the same learner ownership and visibility policy.

**Dependencies:** D-07 product decision is approved; implementation must be sequenced with P0-02 where async job persistence is touched.

**Work:**
- Correct the synchronous generated-course persistence path so learner-private generated courses receive the same owner/private/unpublished guarantees as the approved async path.
- Pass the authenticated actor explicitly into YouTube save/course resolution and all ownership-sensitive helpers; never infer identity from client-supplied IDs.
- Separate private learner copies from shared, approved, public catalog courses.
- Keep approval, visibility, pricing and enrollment independent. Admin automatic approval must not publish learner-private courses or implicitly enroll a learner.
- Audit all paths that reuse, deduplicate, prepare, save, publish or enroll a generated course for cross-user leakage.

**Acceptance evidence:**
- Unit and integration tests for both sync and async generation.
- Cross-user negative tests for read, update, save, prepare, enroll, publish and deduplication collisions.
- Tests prove no private course is exposed through catalog or another learner's resolver.
- D-07 invariants are documented in the relevant service/API contracts and all affected paths pass.

**Status:** Ready for implementation planning; code changes still blocked by the overall authorization gate.

#### P0-04 — Close Google new-account legal consent gap (SEC-03)

**Outcome:** account creation cannot bypass the approved, versioned legal-consent requirements.

**Dependencies:** G-04; approved legal-document identifiers, purpose, version and re-consent policy.

**Work:**
- Decide which terms/privacy/consent records are mandatory at registration and which are optional.
- Enforce the decision on the server-side Google new-account path, not only in the client.
- Persist the accepted document versions, timestamp and required provenance; do not store unsupported or unnecessary personal data.
- Define behavior for existing users, changed legal versions, declined consent and incomplete registration.
- Ensure consent is not silently inferred from a returning OAuth login.

**Acceptance evidence:**
- Approved legal/product decision and versioned document references.
- Tests for missing, false, stale-version and valid consent in new-account and returning-account flows.
- Tests prove no account is activated through a path that bypasses required consent.
- Audit/event behavior is reviewed for privacy and log minimization.

**Status:** Blocked on G-04.

#### P0-05 — Implement executable privacy deletion/anonymization and complete export (SEC-04)

**Outcome:** privacy requests are fulfilled through an auditable, idempotent workflow rather than remaining request records without an executor.

**Dependencies:** G-04; data inventory and legal-hold/retention decision.

**Work:**
- Inventory personal data and user-linked references across accounts, generated courses/roadmaps, learning progress, feedback, saved resources, notifications, billing/payment references, logs, files and external services.
- Define deletion versus anonymization for each data class, including legal holds, financial records, fraud/security evidence, backups and third-party processors.
- Implement a durable request lifecycle with authorization, idempotency, status visibility, retries, partial-failure handling and operator escalation.
- Make deletion/anonymization actions safe to retry and prevent post-deletion re-creation from delayed jobs/events.
- Complete the export scope and document exclusions/retention constraints. Do not claim “complete export” until the inventory supports it.

**Acceptance evidence:**
- Approved data map and retention/deletion matrix.
- Executed synthetic-user deletion tests across every registered data store and asynchronous workflow.
- Retry, restart, partial-provider-failure, legal-hold and audit tests.
- Export completeness tests against the approved data map.
- An operator runbook and proof that completion state reflects all required processors.

**Status:** Blocked on G-04 and data inventory.

#### P0-06 — Make Normal Search Gemini-free and local-first (D-01, ADR-001)

**Outcome:** Normal Search has zero direct or indirect Gemini calls and follows the accepted local-first path.

**Dependencies:** ADR-001 is accepted; no proposed architecture approval is needed to preserve its boundary.

**Work:**
- Remove or bypass Gemini-backed topic-syllabus generation and candidate metadata judging from the Normal Search call graph.
- Ensure the catalog search path and any alternate discovery path cannot indirectly route Normal Search to a Gemini-backed endpoint.
- Preserve deterministic, policy-reviewed local retrieval and metadata handling. Do not describe metadata inspection as video playback or transcript verification.
- Add provider-call instrumentation/spies at the boundary so hidden indirect Gemini calls are observable in tests.

**Acceptance evidence:**
- Call-graph/source review showing no path from Normal Search to Gemini.
- Tests with Gemini credentials/configuration present and a provider spy proving zero calls for empty, non-empty, paginated, error and fallback searches.
- No regression in catalog response shape, authorization or latency beyond an agreed baseline.
- PR and commit-specific CI evidence.

**Status:** Implementation required; acceptance criteria ready.

#### P0-07 — Enforce Normal Search fallback ordering and module semantics (D-02, D-03)

**Outcome:** direct local courses take precedence; eligible module-derived standalone courses are considered next; YouTube is called only when both local result sets contain no suitable eligible result.

**Dependencies:** P0-01 for the permitted YouTube fallback scope; P0-06 for the Gemini-free boundary.

**Work:**
- Base fallback on the complete eligible local-match count, not the current page's returned row count.
- Preserve direct-course precedence and inspect module-derived standalone representations only when no direct course match exists.
- Enforce source course/module identity, deduplication, publication, approval and readiness requirements.
- Ensure unpublished, pending, archived, private or otherwise ineligible records do not suppress or leak into fallback.
- Keep external provider recommendations separate from first-party published course records; do not auto-persist external results as public courses.
- Handle later pages, empty pages with positive totals, stale fallback state and provider/quota failure without corrupting local catalog results.

**Acceptance evidence:**
- Regression matrix covering direct match, module-only match, duplicate module, ineligible records, zero local matches, later-page empty rows with positive total, provider failure and quota refusal.
- Tests prove YouTube is not called when any suitable eligible local result exists.
- Tests prove no Gemini calls across the complete Normal Search flow.
- Response and pagination contracts remain backward-compatible or have an approved migration.

**Status:** Implementation required; YouTube behavior remains subject to P0-01.

#### P0-08 — Implement restart-recoverable job and node execution (D-08)

**Outcome:** accepted work survives API and worker restart, preserves completed nodes, resumes unfinished nodes and exposes actionable terminal failures.

**Dependencies:** P0-02 accepted architecture; G-03 public contract decision; deployed worker topology approved by operations.

**Work:**
- Replace process-local queue ownership with the approved durable job store and atomic claim/lease/fencing protocol.
- Persist job and per-node transitions and make node execution idempotent under retry, duplicate delivery and worker restart.
- Recover expired claims and unfinished jobs automatically; preserve completed outputs.
- Persist/replay progress events or provide an approved recovery mechanism for reconnecting clients.
- Use bounded, classified retries and distinguish permanent domain failure from transient infrastructure/provider failure.
- Implement cancellation and resume semantics as explicitly approved in the public/API contract.
- Keep the feature disabled until the worker, recovery and failure-injection gates pass.

**Acceptance evidence:**
- Process/API restart and worker-kill tests at every transition boundary.
- Multi-worker duplicate-claim and stale-lease/fencing tests.
- Mongo/queue-store outage, recovery, idempotency, retry-exhaustion and event-replay tests.
- Node output preservation and no duplicate billing/provider side effects.
- Worker heartbeat, backlog-age, failed-job and recovery dashboards/alerts.
- Staging evidence that matches the approved topology; flag remains off until Go approval.

**Status:** Blocked on P0-02 and G-03.

#### P0-09 — Enforce YouTube resource snapshot lifecycle and attribution

**Outcome:** any persisted YouTube API Data is handled under the approved policy and freshness/deletion requirements.

**Dependencies:** P0-01; deployed worker/operations capacity; relevant resource-selection contract.

**Work:**
- Map every persisted video, playlist and playlist-membership snapshot, including sources outside the obvious cache layer.
- Implement complete refresh replacement and clear unavailable/deleted/inaccessible metadata rather than retaining stale fields.
- Refresh or delete non-authorized API Data within the applicable 30-calendar-day limit; preserve the documented day-25 operational target only if approved by policy/operations.
- Correct misleading schema defaults such as synthetic fetched timestamps; an unverified timestamp must not appear as a successful refresh.
- Verify Made For Kids restrictions, required YouTube attribution and compliant player/embedding behavior.
- Make the compliance worker observable, restart-safe and independent from an API process lifetime.

**Acceptance evidence:**
- Field-by-field retention inventory and automated age-boundary tests.
- Tests for full metadata replacement, missing/unavailable resources, playlists, membership, stale records, worker restart and deletion.
- Made For Kids and attribution/player review evidence.
- Live worker heartbeat and staging lifecycle proof before any production flag is enabled.

**Status:** Blocked on P0-01 and operations readiness.

### P1 — correctness, security and controlled-pilot gates

#### P1-01 — Re-verify and close SEC-01 async profile validation

**Outcome:** untrusted nested intent fields cannot overwrite server-validated profile values.

**Work:** inspect the recorded branch remediation against the current implementation baseline; verify strict allowlisting, field provenance and merge ordering; add missing negative cases.

**Acceptance evidence:** focused unit, API and integration tests for malicious/unknown nested fields, confirmed/inferred/unknown provenance and sync/async parity; commit-specific test output. Do not mark closed from the existence of a prior patch alone.

#### P1-02 — Re-verify and close SEC-02 actor propagation and usage reservation

**Outcome:** every background quiz/AI task is attributed to the authenticated actor and passes the approved per-user usage/entitlement reservation.

**Work:** verify actor propagation across enqueue, retry, resume and worker execution; fail closed if identity or reservation is absent; make reservations idempotent under concurrent retries.

**Acceptance evidence:** integration and concurrency tests for missing actor, forged actor, duplicate delivery, reservation race, retry, restart and quota exhaustion; no unauthorized work or duplicate charge.

#### P1-03 — Complete feedback provenance and abuse controls (SEC-06/SEC-07)

**Outcome:** feedback that can influence curation or learner outcomes is tied to a valid, server-issued exposure/interaction and an authenticated actor where required.

**Work:** define impression/resource-token provenance; validate resource and course association server-side; scope idempotency keys by actor and operation; prevent anonymous preview writes from changing ranking-affecting signals; apply shared/distributed rate limits and abuse monitoring.

**Acceptance evidence:** tests for fabricated IDs, unseen resources, cross-user replay, idempotency collisions, anonymous writes, expired impressions, duplicate submissions and distributed rate limiting.

#### P1-04 — Reduce authentication data over-fetch (SEC-05)

**Outcome:** auth middleware retrieves only fields needed to authenticate and authorize a request.

**Work:** use explicit projections and review any code that depends on the password hash being present in routine request context.

**Acceptance evidence:** query/projection tests and regression tests for login, token validation, password changes and account security flows; no password hash in request context or logs.

#### P1-05 — Complete mounted-route and permission inventory

**Outcome:** every mounted route has a documented authentication, actor, role/permission, ownership, entitlement, rate-limit and side-effect boundary.

**Work:** generate or verify the route inventory from the actual mounted router tree; reconcile the admin role/permission test matrix with the real registry; identify public, preview, webhook and service-to-service exceptions.

**Acceptance evidence:** route-by-route matrix tied to source paths; tests for missing/expired/forged identity, cross-user access, role boundaries, entitlement boundaries, webhook signature/replay and no-side-effect failures; reviewed exceptions.

#### P1-06 — Approve and implement versioned Gemini output validation (ADR-006)

**Outcome:** only server-validated, semantically valid, version-compatible model output can enter caches or persistent course data.

**Dependencies:** G-06.

**Work:** approve contract/prompt compatibility rules; implement strict server-owned schemas, semantic/domain invariants, bounded repair/retry, sanitized error handling and cache-key version dimensions; make rollback and incompatible-template behavior explicit.

**Acceptance evidence:** schema-valid/invalid, adversarial, malformed, partial, incompatible-version, cache-hit and retry tests; proof invalid provider data is not persisted or cached; prompt/schema version telemetry contains no learner PII.

#### P1-07 — Approve skill governance and build the labelled resolver benchmark (ADR-003)

**Outcome:** ambiguous skills are not silently merged across domains and registry changes are measured against a labelled holdout.

**Dependencies:** G-05; benchmark specification.

**Work:** agree the domain model, alias provenance/approval, fuzzy-match suggestion behavior, false-merge policy and stable-ID migration rules; build adjudicated labelled pairs with hard negatives and concept-clustered splits; calibrate on development data and report holdout separately.

**Acceptance evidence:** approved governance decision; reproducible dataset manifest with privacy review; per-stratum precision/recall and false-merge results; signed threshold decision; migration/rollback plan. No automated alias merge before approval.

#### P1-08 — Approve and migrate the public API/job contract (G-03)

**Outcome:** clients receive stable, versioned intent/build/job/result DTOs, lifecycle states and error envelopes regardless of sync/async execution.

**Dependencies:** G-03 and P0-02.

**Work:** settle route/DTO versioning and legacy behavior; make public state distinct from internal worker state; normalize learner limit, provider transient 429, provider daily quota exhaustion and quota-store outage; document polling/SSE reconnect and cancellation; agree the compatibility window rather than treating the proposed window as approved.

**Acceptance evidence:** approved OpenAPI/API contract; schema/contract tests for all states/errors and sync/async parity; old-client compatibility tests; migration and deprecation notes; no internal retry state exposed accidentally.

#### P1-09 — Implement quota admission, telemetry and sync/async parity

**Outcome:** search-call and shared-unit buckets remain distinct and workload degradation is observable and deterministic.

**Work:** split endpoint telemetry; verify admission reservation per provider attempt; define approved workload priority at the soft threshold; make provider Retry-After behavior explicit; align sync/async handling when quota storage is unavailable; preserve fail-closed accounting-store behavior.

**Acceptance evidence:** independent bucket tests, concurrency/atomic-reservation tests, reset-boundary tests, Retry-After tests and quota-store outage tests; dashboards reconcile exactly to reservation events; live project quota captured before approved staging smoke tests.

#### P1-10 — Enforce adaptive onboarding, language selection and duration semantics (D-04/D-05/D-06)

**Outcome:** Build with AI preserves confirmed/inferred/unknown profile state, asks targeted questions, never silently swaps language, and distinguishes learning effort from video runtime.

**Work:** implement the approved onboarding state transitions and editable review; persist provenance and learner corrections; require explicit learner choice for other-language resources; keep unknown language unknown; calculate hours/weeks from stated study availability and show assumptions; do not enable Intent V2 by changing a flag without a separate rollout decision.

**Acceptance evidence:** UI/API journey tests for topic-only, uncertain answers, skip, correction and resume; language mismatch/alternative selection tests; schedule calculations across availability and duration inputs; tests confirm no false precision or conflation of effort and runtime.

#### P1-11 — Complete SEC-01–SEC-08 negative tests and privacy/security verification

**Outcome:** the security specification is executable evidence, not just a list of proposed tests.

**Dependencies:** remediation items P0-03–P0-05 and P1-01–P1-05.

**Work:** implement the synthetic fixtures and test cases from [Security Negative-Test Specification](SECURITY_NEGATIVE_TEST_SPECIFICATION.md); reconcile the actual route and permission matrix; add telemetry redaction and no-side-effect assertions.

**Acceptance evidence:** linked test runs on the implementation commit; all P0 security cases pass; remaining failures are explicitly triaged with approved risk owners; no test uses real learner PII or production secrets.

### P2 — operational maturity and broad-rollout evidence

#### P2-01 — Add dedicated Normal Search and Build with AI browser journeys

**Outcome:** browser-level evidence proves the learner-visible product decisions.

**Acceptance evidence:** E2E journeys for local-first/fallback-only search, module result, provider failure, adaptive onboarding, language choice, private course behavior, async progress/reconnect and failure/retry. Tests run reliably in CI with providers mocked.

#### P2-02 — Establish load, concurrency and failure-injection baselines

**Outcome:** capacity and recovery claims are based on repeatable measurements.

**Acceptance evidence:** bounded load/soak scenarios for search, roadmap creation, worker concurrency and quota contention; Mongo/Redis/provider faults; API/worker restarts; queue age and recovery time; no unbounded external provider traffic.

#### P2-03 — Verify deployed topology and production configuration

**Outcome:** API, worker, Redis, frontend, OAuth/CORS, flags and provider configuration are verified from the actual target environment.

**Acceptance evidence:** dated, redacted dashboard/health evidence for service identity, deployed commit, readiness endpoints, worker heartbeat, Redis connectivity, effective feature flags, frontend domain/CORS/OAuth origins, Gemini model/tier and YouTube project quota. Manifest defaults are not accepted as live evidence.

#### P2-04 — Establish dashboards, alerts, runbooks and SLO baselines

**Outcome:** the service can be operated and incidents diagnosed without relying on ad hoc log inspection.

**Acceptance evidence:** dashboards/alerts for API latency/errors, search result mode, provider latency/errors, separate YouTube quota buckets, Gemini tokens/cost, job age/state/retries, worker heartbeat, node outcomes, cache behavior and privacy deletion queue; executable runbooks; measured baseline before numeric SLO approval.

#### P2-05 — Measure unit economics and quality using approved evidence

**Outcome:** cost and quality decisions reflect measured behavior and policy-permitted evaluation.

**Acceptance evidence:** representative Gemini token and infrastructure cost per roadmap/active learner; cache hit rates and peak/burst factors; human playback inspection and independent labelled dataset where permitted; approved metrics, holdout report and limitations. Do not treat YouTube quota units as a monetary per-call price or publish an unapproved API-derived metric.

#### P2-06 — Execute controlled rollout and rollback rehearsal

**Outcome:** each feature group has an approved cohort, success/stop thresholds and a tested rollback path.

**Dependencies:** all P0 gates, required P1 gates, P2-03/P2-04 and formal authorization.

**Acceptance evidence:** staged flag sequence, cohort limits, before/after measures, migration/backfill plan, rollback rehearsal, operator ownership, residual-risk acceptance and signed Go/No-Go record. No production flag changes are authorized by this backlog.

## 4. Recommended implementation sequence

| Sequence | Workstream | Items | Exit gate |
|---|---|---|---|
| 0 | Resolve decisions in parallel | P0-01, P0-02, P0-04, G-03, G-05, G-06 | Written policy, privacy and architecture decisions; no inferred approvals |
| 1 | Close core privacy and ownership boundaries | P0-03, P0-04, P0-05 | D-07 invariants, consent and deletion acceptance evidence |
| 2 | Correct Normal Search | P0-06, P0-07 | Zero Gemini calls; local-first and fallback regression suite |
| 3 | Harden Build with AI contracts and skill resolution | P1-06, P1-07, P1-08, P1-10 | Approved schema/API/skill decisions and compatibility tests |
| 4 | Deliver durable asynchronous processing | P0-02, P0-08 | Restart-safe jobs, worker, state recovery and failure-injection evidence |
| 5 | Close provider lifecycle and quota controls | P0-01, P0-09, P1-09 | Policy-conforming data lifecycle, correct quota accounting and safe degradation |
| 6 | Complete security and quality verification | P1-01 through P1-05, P1-11, P2-01, P2-02 | Negative tests, E2E, load and failure evidence |
| 7 | Verify operations and authorize release | P2-03 through P2-06 | Live configuration, dashboards, rollback rehearsal and explicit Go/No-Go |

The sequence is intentionally dependency-aware rather than a promise that every workstream must run serially. Independent approved tasks may proceed in parallel, but an approval-gated item cannot be implemented ahead of its gate.

## 5. Cross-cutting definition of done

An implementation item is complete only when all applicable conditions are met:

1. **Decision traceability:** relevant product decision/ADR is accepted and linked; any changed decision has an owner and date.
2. **Security and privacy:** actor identity, ownership, visibility, entitlement, retention and no-side-effect behavior are tested where applicable.
3. **Contracts:** API/schema/state/error/cache compatibility is explicit and tested.
4. **Correctness:** unit and integration tests cover normal, invalid, boundary, retry, concurrency and failure paths.
5. **End-to-end:** browser journey covers learner-visible behavior where the feature is user-facing.
6. **Operations:** required metrics, alerts, worker health and recovery runbooks exist.
7. **Evidence:** PR/commit, CI run, test output, review decision and staging proof are linked to Issue #43.
8. **Rollout control:** feature flags remain safe by default until separately authorized; rollback is tested before broad rollout.

A green unit test alone does not close a policy, privacy, multi-process durability, deployment or production-readiness gate.

## 6. Dependencies and release decision rule

- P0-01 is a prerequisite for any YouTube API Data-derived metric and for the approved persisted-resource lifecycle scope.
- P0-02 and G-03 are prerequisites for P0-08 and any Async Roadmap enablement.
- G-04 is a prerequisite for final SEC-03/SEC-04 behavior.
- P0-03 is a prerequisite for any generated-course rollout under D-07, including synchronous generation.
- P0-06/P0-07 must close before the new Normal Search behavior is enabled.
- P0-09 must close before relying on persisted YouTube API Data in production.
- P1 security and API-contract tests must close before the affected surface enters a controlled pilot.
- P2 operational checks and a rollback rehearsal are required before broad rollout.

**Current release recommendation remains NO-GO.** This backlog does not change the status of any remediation item, approve any ADR, close SEC-01–SEC-08, authorize a pilot, or authorize product-code changes.

## 7. Completion record

**Task 13 output:** this prioritized implementation backlog, created on `docs/build-with-ai-engineering-readiness` and linked from the documentation index and readiness plan.

**Task 13 status:** Complete — documentation/backlog definition only.

**Execution boundary:** no product code, tests, builds, CI, provider calls, staging checks, production configuration, feature flags, deployment, merge or `main` changes were made. All implementation items remain open until their own acceptance evidence is recorded.

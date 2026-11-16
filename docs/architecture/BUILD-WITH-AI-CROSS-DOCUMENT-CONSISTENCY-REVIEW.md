# Build with AI & Normal Search — Cross-Document Consistency Review

**Status:** Review v1.0 — documentation conflicts reconciled where safe; owner/policy approvals remain open  
**Date:** 2026-11-16  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Tracking:** PR #43 / engineering readiness issue #43  
**Review mode:** Documentation-to-documentation comparison; no tests or runtime checks

## 1. Executive conclusion

The current documentation set expresses a coherent product direction for Normal Search and Build with AI, but it is **not yet an implementation-ready or launch-approved specification**. The most consequential inconsistencies were around YouTube API-derived ranking/metrics, quota bucket accounting, the distinction between approved D-08 product outcomes and the still-proposed queue technology, and public API job/error-state normalization.

This review reconciled the documentation wording that could safely be resolved without inventing product or legal decisions. It does **not** approve a YouTube metric/ranking method, choose a durable queue technology, freeze the public API contract, approve cache TTL targets, calibrate confidence scores, complete privacy deletion, or establish production readiness.

### Overall disposition

| Area | Review outcome | Remaining gate |
|---|---|---|
| Product decisions D-01–D-08 | Consistent in intent; implementation status remains separate | Implement and validate approved decisions |
| Normal Search | Local-first, Gemini-free and YouTube fallback-only contract is consistent | Current main is documented as not yet compliant |
| YouTube derived metrics/ranking | Conflicting permissive wording corrected | Written policy clearance for exact use case/method before derived scoring/ranking |
| YouTube quota | Separate-bucket accounting and advisory-only current soft state clarified | Correct telemetry, implement proposed admission priority, verify live project quota |
| Build with AI profile/evidence | Confirmed/inferred/unknown concepts consistent | Approve and implement validators/provenance and field-specific calibration where needed |
| Skill resolution | Benchmark-before-threshold policy consistent | Golden labels, benchmark result and owner approval |
| D-07 governance | Moderation/publication/visibility/pricing/enrollment separation consistent | Close known sync ownership code gap and execute tests |
| D-08 durability | Approved recovery outcome separated from queue technology | Approve and implement a durable job/worker design |
| API contracts | Proposed job-state and error mapping made explicit | API/product/operations approval and compatibility tests |
| Cache/resource lifecycle | Provider snapshot vs first-party state and 30-day maximum consistent | Full refresh/delete worker, policy approval and measured cache targets |
| Security/privacy | Review scope and test linkage reconciled | SEC-01–SEC-08 remediation/negative tests and full route inventory |
| QA and final checklist | Design/acceptance documents aligned | Execute applicable CI, integration, E2E, failure-injection and staging gates |
| Production operations | Deployment checks remain clearly deferred/unverified | Confirm topology, worker, flags, quota, health and telemetry before launch |

**Go/No-Go recommendation from this document review: NO-GO for broad rollout or production enablement of the new Build with AI/resource-selection architecture.** This is not a claim that the existing platform is wholly unavailable. It means the new approved product behavior, the proposed architecture, policy clearance, test evidence and operational prerequisites are not yet all demonstrated.

## 2. Review scope and evidence limits

The review compared the following project documents on the active readiness branch. The findings below are based on the document contents and source-inspection statements recorded inside them; this task did not repeat the underlying source-code audit.

| Document | Role in the contract |
|---|---|
| [Product Requirements — Normal Search & Build with AI](../PRODUCT_REQUIREMENTS_BUILD_WITH_AI_AND_SEARCH.md) | Approved product decisions D-01–D-08 and learner-facing acceptance requirements |
| [Build with AI Target Architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md) | Logical components, domain contracts, ownership, job lifecycle and acceptance matrix |
| [ADR-001 — Normal Search local-first and Gemini-free](ADR-001-normal-search-local-first-gemini-free.md) | Accepted Normal Search orchestration/product boundary |
| [ADR-002 — Durable roadmap job processing](ADR-002-durable-roadmap-job-processing.md) | Proposed queue/worker implementation for D-08 |
| [ADR-003 — Domain-aware skill resolution](ADR-003-domain-aware-skill-resolution.md) | Proposed canonical skill identity and ambiguity/alias governance |
| [ADR-004 — YouTube resource data lifecycle](ADR-004-youtube-resource-data-lifecycle.md) | Provider data policy, refresh, deletion, player and attribution gates |
| [ADR-005 — Curation quality and YouTube quota model](ADR-005-curation-quality-and-youtube-quota-model.md) | Current quota baseline, proposed quality benchmark and operating limits |
| [ADR-006 — Versioned Gemini output validation](ADR-006-versioned-gemini-output-validation.md) | Proposed strict model-output schema/prompt compatibility contract |
| [API Contracts and Backward Compatibility](BUILD-WITH-AI-API-CONTRACTS-AND-COMPATIBILITY.md) | Current route divergence and proposed versioned DTOs, states, errors and migration |
| [Cache Architecture and Invalidation](BUILD-WITH-AI-CACHE-ARCHITECTURE-AND-INVALIDATION.md) | Cache classes, key dimensions, TTL baseline, invalidation and privacy boundaries |
| [Evidence and Confidence Model](BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md) | Evidence provenance, confidence semantics and claim authority |
| [YouTube Quota and Provider Degradation Contract](BUILD-WITH-AI-YOUTUBE-QUOTA-AND-DEGRADATION-CONTRACT.md) | Separate quota buckets, actual vs proposed degradation and provider failure behavior |
| [Learning Resource Candidate and Selection Contract](LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md) | Candidate identity, provider snapshots, selection decisions and learner state |
| [Skill Resolution Benchmark Specification](SKILL-RESOLUTION-BENCHMARK-SPEC.md) | Dataset/adjudication and holdout criteria before automatic fuzzy matching |
| [Security, Privacy and Abuse Review](../SECURITY_PRIVACY_ABUSE_REVIEW.md) | Source-mapped security findings and route controls |
| [Security Negative-Test Specification](../SECURITY_NEGATIVE_TEST_SPECIFICATION.md) | SEC-01–SEC-08 and cross-cutting negative-test cases |
| [QA, Observability and Operational Readiness](../QA_OBSERVABILITY_OPERATIONAL_READINESS.md) | Test layers, failure injection, telemetry, alerts and staging controls |
| [Final Test Checklist](../BUILD_WITH_AI_FINAL_TEST_CHECKLIST.md) | Consolidated implementation/release acceptance checklist |
| [Engineering Readiness Plan](../BUILD_WITH_AI_ENGINEERING_READINESS_PLAN.md) | Task status, implementation gaps, test inventory and Go/No-Go gates |
| [Build with AI v2 Rollout Plan](../BUILD_WITH_AI_V2_ROLLOUT.md) | Conditional flag sequencing and rollback notes |
| [Search Flow v2 — test branch](../SEARCH_FLOW_V2_PLAN.md) | Historical test-branch search proposal; not authority over current ADRs |

### Review limitations

- No test runner, build, CI, staging smoke test, browser E2E, penetration test or live provider call was run.
- No production environment variables, Google Cloud quota, Render services, Redis instance, Vercel project or live feature-flag value was inspected.
- No product code, database, schema, prompt, runtime configuration, feature flag or deployment setting was changed.
- No legal determination was made about YouTube API Services policy; the review preserves the policy hold recorded in ADR-004/ADR-005.
- A document-level consistency check does not establish that current `main`, a deployed service or an external provider behaves as these target documents describe.

## 3. Decision consistency matrix — D-01 through D-08

| Decision | Approved product outcome | Cross-document representation | Current implementation / approval boundary |
|---|---|---|---|
| **D-01 — Gemini boundary** | Approved: Gemini is reserved for Build with AI; Normal Search makes zero direct or indirect Gemini calls | PRD, ADR-001, Target Architecture, QA and Final Checklist now agree | PRD/ADR record current main's Gemini-capable curation path as an implementation gap. No claim that the approved behavior is shipped. |
| **D-02 — External discovery** | Approved: YouTube recommendations are fallback-only after no suitable direct course or eligible module/standalone local result | PRD and ADR-001 specify direct course → eligible module/standalone → YouTube fallback; pagination uses total eligible local count | Current main is documented as calling curation even when local results exist. This remains an implementation gap. |
| **D-03 — Module representation** | Approved: when no direct course match exists, a matching published module may be represented by a deduplicated standalone course | PRD, ADR-001 and Target Architecture retain source course/module deduplication and approval/publication/readiness checks | A module match alone must not bypass standalone-course approval/publication rules. Implementation and tests remain pending. |
| **D-04 — Adaptive onboarding** | Approved: topic-only entry; AI-proposed provisional goal/level; adaptive questions; “not sure”/skip; editable confirmation | PRD, Target Architecture, Evidence Model, API proposal, QA and checklist agree on confirmed/inferred/unknown provenance | Intent V2 frontend/server flags are separately controlled and not assumed enabled. |
| **D-05 — Resource language** | Approved: selected language is preferred; other-language alternatives are labelled and require explicit learner choice | PRD, Target Architecture, Candidate Selection, Evidence Model, QA and checklist agree | Unknown language remains unknown; channel country or creator identity is not language proof. |
| **D-06 — Duration semantics** | Approved: learning effort in hours, completion timeline in weeks from available study schedule, recommended schedule, and video runtime separately | PRD, Target Architecture, API proposal, QA and checklist agree | Study schedule assumptions must be visible; do not create false-precision dates when availability is unknown. |
| **D-07 — Course governance** | Approved: preserve manual/automatic approval modes; learner-private courses remain private/unpublished; approval does not enroll | PRD, Target Architecture, QA, checklist and rollout gates preserve separate moderation, publication, visibility, pricing and enrollment states | Documented source audit identifies a synchronous course-ownership gap; code remediation and regression evidence are still required. |
| **D-08 — Durability outcome** | Approved: job/node state survives API/worker restarts; automatic recovery; completed outputs preserved; idempotent bounded retries and visible failures | PRD, Target Architecture, QA and checklist express the required outcome | **Queue technology is not approved.** ADR-002's MongoDB-backed queue/worker is a proposal awaiting product-owner/technical approval. Current process-local queue does not satisfy D-08; worker deployment is unverified/not present in recorded dashboard evidence. |

**Decision governance rule:** approval of a product outcome does not approve every architecture proposal that might implement it. In particular, D-08 does not implicitly approve MongoDB queue implementation, BullMQ, Redis provisioning, a Render worker change or a production flag change.

## 4. Findings register and reconciliation

### CDR-01 — YouTube-derived custom ranking/quality language exceeded the policy gate

**Severity:** Critical policy/release blocker  
**Affected documents:** ADR-001; Product Requirements; Target Architecture; ADR-004; ADR-005; Learning Resource Candidate and Selection Contract; Search Flow v2.

**Conflict found:** Earlier ADR-001 wording allowed metadata-based scoring/heuristic ranking, including engagement fields. The Search Flow v2 test-branch document listed views, likes and subscribers among candidate ranking signals. That wording conflicted with ADR-004/ADR-005 and the Candidate Selection Contract, which explicitly hold custom derived metrics and ranking from YouTube API Data pending policy clearance.

**Reconciliation applied:**
- ADR-001 now states that the Gemini boundary does not grant permission to derive custom YouTube scores, metrics, percentiles or ranking.
- Its fallback stage is constrained to policy-cleared factual metadata and eligibility checks until written clearance exists.
- Target Architecture now excludes default match-score/numeric resource-confidence persistence and records the current numeric threshold as baseline-only, not target policy.
- Product Requirements now describes policy-permitted candidate discovery/factual metadata, not a general grant for ranking.
- Search Flow v2 is marked historical/test-branch; its ranking bullet is replaced with the current policy gate.
- Rollout and final checklist also carry the policy hold.

**Residual gate:** obtain written confirmation for the specific educational-resource curation use case, exact provider fields, derived outputs, storage and retention before designing or enabling any API-derived ranking/quality metric. A benchmark protocol, frozen snapshot or human-review rubric is not itself policy acceptance. Do not treat renaming a score as a workaround.

### CDR-02 — Resource confidence and numeric low-confidence threshold were inconsistent

**Severity:** High  
**Affected documents:** Target Architecture; Candidate Selection Contract; Evidence and Confidence Model; API Contracts; Final Test Checklist.

**Conflict found:** Target Architecture described selected resources with a match score/confidence and recorded a current low-confidence threshold of 45. Candidate Selection and Evidence Model prohibit unapproved API-derived scores and uncalibrated resource confidence.

**Reconciliation applied:** Target Architecture now distinguishes source-baseline behavior from target policy; selected-resource records use categorical evidence/provenance by default. The API contract now limits `low_confidence` to a policy-permitted, assessment-specific calibrated method. The final checklist includes an explicit release assertion.

**Residual gate:** if numeric resource confidence is later required, approve the method, claim definition, dataset, calibration, threshold, provider-policy status and version first. Otherwise use categorical states such as metadata-only, human-reviewed, learner-feedback, unknown/unavailable and learner-choice-required.

### CDR-03 — YouTube quota units and current soft-degradation behavior were misstated in rollout guidance

**Severity:** High operational/cost-control risk  
**Affected documents:** Build with AI v2 Rollout Plan; ADR-005; YouTube Quota and Provider Degradation Contract; QA; Final Test Checklist.

**Conflict found:** Rollout wording treated `search.list` as a 100-unit charge in the shared bucket and suggested that the 80% threshold already refused search calls. The source-mapped quota contract states that Google uses separate search-call and shared-unit buckets, and the current 80% degraded state is advisory.

**Reconciliation applied:**
- One `search.list` request consumes one call from the separate search bucket; it is not 100 shared units.
- Non-search endpoint costs are charged to the shared default bucket according to method cost.
- Checked-in app defaults are 90 search calls/day and 9,000 shared units/day; 80% advisory thresholds are 72 / 7,200.
- Current telemetry's `quotaUnits` mixes search and shared usage and is not a valid shared-unit total.
- Rollout wording now says the current soft state is advisory; the target optional-work admission priority is not yet implemented.
- Compliance-worker and async-rollout entries are gated on policy, worker and recovery readiness.

**Residual gate:** verify live Google Cloud project quota; separate telemetry fields; implement and test soft-degradation admission priority, retry policy and workflow budgets before using the rollout plan as an operational runbook.

### CDR-04 — D-08 product guarantee and queue technology approval were easy to conflate

**Severity:** High  
**Affected documents:** PRD; ADR-002; Target Architecture; API Contracts; QA; Rollout Plan; Readiness Plan.

**Conflict/risk found:** D-08 is approved as a required reliability outcome, whereas ADR-002 recommends MongoDB-backed durable queue plus dedicated worker but remains proposed.

**Reconciliation applied:** This review records the two layers separately. The rollout sequence now blocks `ASYNC_ROADMAP` enablement until a durable worker path, lease/fencing/recovery, active-job retention, event replay, tests, client compatibility and staging evidence exist.

**Residual gate:** approve the queue/storage model and worker topology explicitly. Terminal job retention, job model shape, execution leases, fencing, recovery cadence, SSE replay and worker health still require technical/product/privacy review. Do not enable the async flag to try the current process-local queue.

### CDR-05 — Public job-state enum lacked an explicit mapping to domain and worker states

**Severity:** Medium–High integration risk  
**Affected documents:** Target Architecture; ADR-002; API Contracts; QA; Final Test Checklist.

**Conflict found:** Target Architecture uses domain lifecycle labels; API Contracts proposed public labels; ADR-002 uses internal worker states including `retry_wait`.

**Reconciliation applied:** API Contracts now contains a proposed mapping:
- domain `running` → public `building` → worker `running`;
- domain `completed` → public `ready` → worker `ready`;
- domain `completed_with_warnings` → public `partial`, preserving terminal job result and unresolved node states;
- domain `failed` → public `failed` → worker `failed_permanent`;
- `retry_wait` remains internal and does not leak into the public enum.

**Residual gate:** mapping remains a proposal pending API/product owner approval. Frontend types, polling, SSE replay, terminal-state monotonicity, dashboards and contract tests must use one frozen versioned mapping.

### CDR-06 — Provider 429, daily quota exhaustion and quota-store outage were not distinct enough in the error contract

**Severity:** Medium–High operational correctness risk  
**Affected documents:** API Contracts; YouTube Quota Contract; Security Negative-Test Specification; QA.

**Conflict found:** generic “rate/budget limit = 429” test wording could collapse learner allowance, application rate limits, upstream provider 429, daily provider quota exhaustion and local accounting-store outage.

**Reconciliation applied:** API Contracts now proposes `AI_QUOTA_STORE_UNAVAILABLE` separately from provider quota exhaustion. Security Negative-Test Specification distinguishes:
- learner allowance and application route limits → proposed 429;
- upstream provider 429 → proposed platform-level provider error;
- provider daily quota exhaustion → distinct reset-aware provider quota error;
- local quota-store outage → fail closed, no provider request.

**Residual gate:** all mappings remain proposed until API, product and operations owners approve exact HTTP status, stable code, retryability and reset metadata. Current legacy controllers may not yet emit the proposed universal envelope.

### CDR-07 — Historical Search Flow plan could be mistaken for current main/approved policy

**Severity:** Medium  
**Affected documents:** Search Flow v2 test-branch plan; ADR-001; PRD; YouTube contracts.

**Conflict found:** Search Flow v2 is explicitly a test-branch plan, but its checked boxes/implementation note and older ranking wording could be read as current main or approved production behavior.

**Reconciliation applied:** file now states it is historical evidence only, identifies ADR-001 and ADR-004/ADR-005/Candidate Selection as controlling, and no longer presents derived ranking as approved.

**Residual gate:** treat the file's original test-branch “implemented” claims as historical claims, not evidence of current-main or production deployment. Current main behavior is separately identified in PRD/ADR-001 as not yet compliant with D-01/D-02.

### CDR-08 — Security review route coverage and “no code modified” language became stale after supplemental review/remediation

**Severity:** Medium evidence-integrity risk  
**Affected documents:** Security Review; Security Negative-Test Specification; Readiness Plan.

**Conflict found:** The older route inventory boundary said several billing/webhook/discovery/notification routes remained uncovered, although later sections added source review of those families. The “no code modified” statement could also be read as contradicting the later recorded SEC-01/SEC-02 code fixes.

**Reconciliation applied:** Security Review now clarifies that the original route matrix is supplemented by §§12–14 but still is not a complete generated API inventory or dynamic audit. The evidence boundary now says the review activity did not change code, while SEC-01/SEC-02 fixes are separately present on the readiness branch; tests remain unexecuted.

**Residual gate:** generate and reconcile the full mounted API route inventory and exact permission registry. Execute the SEC-01–SEC-08 and cross-cutting negative-test cases; do not mark findings closed based on documentation.

### CDR-09 — Security, QA and final test artifacts lacked a single traceable release path

**Severity:** Medium readiness/process gap  
**Affected documents:** Security Review; Security Negative-Test Specification; QA; Final Test Checklist; Readiness Plan.

**Reconciliation applied:** Security Negative-Test Specification is linked from the QA and Final Test Checklist. The checklist now includes YouTube policy, confidence calibration, public-state mapping and security test gates. The QA plan now distinguishes current quota behavior from the target and records security and API error-contract dependencies.

**Residual gate:** implement tests and attach commit-specific execution evidence. All newly added checklist items remain unchecked; this review did not execute tests.

### CDR-10 — Product decision register duplication was suspected but not confirmed

**Severity:** Informational  
**Affected document:** Product Requirements.

**Review result:** the current PRD contains one consolidated decision log for D-01–D-08 followed by a D-01–D-08 decision register table. D-03 and D-06 appear in both representations by design; the repeated individual bullet lines described in an earlier audit note were not present in the fetched current document. No PRD entries were deleted.

## 5. Areas confirmed consistent

### 5.1 Normal Search
The controlling contract is ADR-001: direct eligible published BuddyForStudy courses first; if none, eligible published module-derived standalone courses; if neither local path yields eligible results, YouTube fallback. The Gemini call graph must remain zero for Normal Search. Provider failure cannot erase valid local catalogue results. Local-result fallback eligibility is based on total eligible matches, not the current page row count.

### 5.2 Build with AI intake and profile provenance
D-04 is consistently described as topic-only adaptive onboarding with provisional assumptions, targeted clarification, “not sure”/optional skips, learner edits and confirmation. Model-generated values remain inferred until confirmed. Frontend/server flag mismatch and current disabled state are not treated as approval to enable Intent V2.

### 5.3 Language, time and learner choice
D-05 keeps preferred language separate from actual resource-language evidence and requires explicit learner selection before a cross-language fallback enters the learning path. D-06 keeps total learning effort, availability-based week estimate, recommended schedule and video runtime as distinct values.

### 5.4 Course ownership and governance
D-07 consistently separates moderation, publication, visibility, pricing and enrollment. Automatic approval does not override learner-private ownership, readiness, archive state, pricing validity or the learner's explicit enrollment/payment action. The synchronous learner-private ownership gap remains a documented implementation blocker.

### 5.5 Skill resolution
ADR-003 and the Skill Resolution Benchmark specification do not select an unmeasured fuzzy threshold. They require domain-aware resolution, ambiguity/abstention, alias provenance, concept-clustered holdout and independent adjudication. Until acceptance criteria and owner decisions pass, fuzzy matching remains suggestion-only.

### 5.6 Gemini schema and prompt compatibility
ADR-006, Target Architecture, Cache Architecture and API Contracts agree that provider response schemas do not replace strict server-owned validation; prompt/schema versions and all generation-affecting inputs must participate in compatibility/cache identity; invalid or semantically incompatible output must not enter shared cache or persistence. The new contract remains proposed pending approval and implementation.

### 5.7 Cache and provider-data lifecycle
Cache Architecture correctly distinguishes disposable computation caches from persistent product state. ADR-004's provider-data lifecycle controls are controlling: maximum 30 calendar days for non-authorized YouTube API Data, operational refresh target before day 25, and deletion/suppression when refresh cannot occur before the hard deadline. Cache TTL alone cannot prove durable course snapshots were refreshed. Provider metadata and first-party learner progress/feedback must remain separate.

### 5.8 Privacy and security
Security Review SEC-04 explicitly says account deletion execution is unavailable and exports are partial. Evidence and Candidate Selection documents keep YouTube provider snapshots distinct from first-party learner events. Cancellation is not privacy deletion. No document should state or imply that privacy deletion fulfilment is complete until all required stores and lawful-retention exceptions are evidenced.

## 6. Normative lifecycle and error alignment

The mapping added to API Contracts is the proposed single public normalization point. Until approved, implementation documents must not independently rename states or use internal queue states as learner-visible statuses.

| Concern | Current documented proposal | Required consistency rule |
|---|---|---|
| Domain job state | `draft`, `queued`, `running`, `cancelling`, `cancelled`, `completed`, `completed_with_warnings`, `failed` | Target Architecture domain lifecycle |
| Public job state | `draft`, `queued`, `building`, `cancelling`, `partial`, `ready`, `failed`, `cancelled` | API contract proposal; one mapping for sync result, polling and SSE |
| Worker internal state | `queued`, `running`, `retry_wait`, `ready`, `failed_permanent`, `cancelled` | Internal only; `retry_wait` must not leak as public status |
| Resource node state | `pending`, `queued`, `ready`, `low_confidence`, `unavailable`, `quota_limited`, `failed_retryable`, `failed_permanent`, `skipped` | `low_confidence` requires approved, policy-permitted calibrated method; otherwise use categorical evidence/unresolved states |
| Learner/app limit | Proposed 429 | Stable code and no admission/provider side effect |
| Provider transient 429 | Proposed platform-level 503 | Distinct from learner allowance; bounded retry and per-attempt quota reservation |
| Provider daily quota | Proposed 503 | No hot retry; preserve bucket and reset date |
| Local quota store outage | Proposed 503, `AI_QUOTA_STORE_UNAVAILABLE` | Fail closed; no provider request; not described as provider daily exhaustion |

These are contract proposals, not evidence that current controllers or frontend clients already use these exact states and error bodies.

## 7. Open approval gates — not resolved by wording changes

The following matters are intentionally still open:

1. **YouTube policy:** written clearance for the educational-resource curation use case and any candidate selection, custom ordering, scoring, benchmarking, retention and storage of provider-derived data. ADR-004/ADR-005 remain controlling.
2. **Durable jobs:** explicit decision on MongoDB queue vs another technology, RoadmapDraft vs RoadmapJob model, terminal retention, leases/fencing, worker topology, event replay and recovery.
3. **Skill registry:** canonical domain scope, provisional persistence, alias review ownership, benchmark dataset, acceptance thresholds/margins and legacy-ID migration.
4. **Gemini contracts:** approved immutable schema/prompt versions, compatibility window, invalid-output correction policy, final DTO fields and rollback policy.
5. **API compatibility:** approved route/version strategy, job/node/error enums, public HTTP mappings, SSE replay, legacy compatibility window and client capability negotiation.
6. **Cache policy:** approved per-class TTLs based on measurement, provider/user deletion propagation, negative caching and cache failure/stampede behavior.
7. **Evidence/confidence:** evidence envelope shape, source authority/conflict policy, field-specific calibration methods, learner disclosure and first-party retention/deletion.
8. **Resource selection:** approved factual eligibility and ordering method, language-evidence semantics, explicit alternative-selection UX, and policy-compliant evidence labels.
9. **Security/privacy:** Google new-account consent policy, actual deletion/anonymization executor, data inventory/legal holds, password-hash hardening, SEC-06/07 impression provenance, SEC-08 private-copy ownership, full route permission matrix and negative-test evidence.
10. **Operations:** live Render API/worker state, Redis availability, feature-flag values, provider keys/model/quota, worker heartbeat, Vercel config, monitoring and 7-day baseline.

## 8. Required order before Go/No-Go

1. Obtain written policy and product decisions for the open approval gates that affect the release scope.
2. Freeze the API DTO/state/error contract and the queue/recovery architecture.
3. Close ownership, privacy, legal-consent and feedback-integrity security findings; complete the full route-permission inventory.
4. Implement the approved Normal Search and Build with AI changes on a new implementation branch from the then-current `main`, not by repurposing this docs branch.
5. Add/execute unit and contract regression tests; then isolated Mongo/provider integration and concurrency/failure-injection tests.
6. Complete browser E2E for local-first search, adaptive intake, profile confirmation, roadmap generation, resource-language selection, partial state, refresh/resume, enrollment and admin moderation.
7. Verify YouTube data lifecycle/attribution/player policy, staging quota, worker topology/heartbeat, feature flags, CORS/TLS, cache behavior and provider-cost ceilings.
8. Capture baseline-derived SLOs, alerts, rollback rehearsal and owner sign-off.
9. Reconcile all remaining checklist items with actual CI/staging evidence and record a formal Go/No-Go decision.

Do not jump from documentation completion directly to production flag enablement or merge.

## 9. Task 11 completion record

**Completed on 2026-11-16 (documentation-only):**
- Compared the PRD, target architecture, ADR-001–ADR-006, API/cache/evidence/resource/skill/quota contracts, security review/specification, QA plan, final test checklist, rollout notes, search-flow history and engineering readiness plan.
- Reconciled the YouTube metric/ranking policy boundary, separate quota accounting, current-vs-proposed soft-degradation behavior, D-08 outcome-vs-technology distinction, job-state normalization proposal and provider-error distinctions.
- Updated security review scope/evidence language and linked security negative tests into QA and final release checklist.
- Corrected historical Search Flow v2 status/ranking wording and rollout gates.
- Updated documentation index and engineering readiness plan to make the audit discoverable and traceable.

**Not performed:** no tests, builds, CI, penetration tests, staging checks, production/provider calls or live configuration inspections. No application code, database, migration, flag, deployment or `main` branch changes. Wording reconciliation does not constitute policy, product or technical approval.

**Task 11 exit status:** **Complete — documentation consistency pass**. The project remains **not Go-approved** until the open gates in §7 are resolved and supported by execution evidence.

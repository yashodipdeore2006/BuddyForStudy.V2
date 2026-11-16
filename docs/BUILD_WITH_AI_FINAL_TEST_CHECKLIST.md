# Build with AI and Search — Consolidated Final Test Checklist

**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Security test specification:** [Security Negative-Test Specification](SECURITY_NEGATIVE_TEST_SPECIFICATION.md)  
**Architecture consistency:** [Cross-Document Consistency Review](architecture/BUILD-WITH-AI-CROSS-DOCUMENT-CONSISTENCY-REVIEW.md)  
**Execution policy:** collect and maintain this checklist during implementation; run the complete applicable test batch together after implementation is complete. Do not run tests after each small implementation change unless a safety-critical issue requires immediate verification.

## 1. Previously verified focused suites

These are historical focused results, not a substitute for the final post-implementation run.

- [x] `node --test test/courseCurationDecisionEngine.test.js` — 30 passed, 0 failed.
- [x] `node --test src/services/nodeCuration.phase2.test.js` — 12 passed, 0 failed after cache-scope assertion update.
- [x] `node --test test/adminRoutePermissionCoverage.test.js` — 1 passed, 0 failed after route-parser hardening.
- [x] Combined Node curation Phase 2 + admin route coverage — 13 passed, 0 failed.
- [ ] Re-run all focused suites after the final implementation batch.

## 2. Normal Search contract

- [ ] Direct published course match takes precedence; no YouTube or Gemini calls.
- [ ] If no direct match, eligible published module-derived standalone courses are considered.
- [ ] Pending, rejected, private, archived or unpublished standalone courses never leak into results.
- [ ] External YouTube recommendations are returned only when no eligible local course/module result exists.
- [ ] Pagination with an empty current page but a positive eligible total does not trigger external fallback.
- [ ] A newly published local match invalidates/stales out cached external fallback.
- [ ] Normal Search makes zero Gemini calls with Gemini credentials configured, including topic-syllabus and metadata-judge paths.
- [ ] YouTube quota/provider failures preserve the catalog response and return a safe empty fallback.
- [ ] Normal Search never invokes the Gemini-backed discovery course-search route implicitly.

## 3. Build with AI intake and structured output

- [ ] Topic-only input is accepted and receives provisional goal/level assumptions.
- [ ] Follow-up questions are adaptive, limited and do not repeat confirmed/high-confidence fields.
- [ ] “Not sure”, optional skip, edit and profile confirmation paths work.
- [ ] Confirmed, inferred and unknown profile values remain distinguishable end-to-end.
- [ ] Invalid/unsupported intent is rejected or safely guided before expensive provider work.
- [ ] Gemini output passes strict server-side schema and semantic validation before template caching.
- [ ] Invalid JSON, unknown keys, invalid graph edges, cycles and duplicate IDs are rejected safely.
- [ ] Prompt/schema/model version changes isolate or invalidate incompatible template cache entries.
- [ ] Provider timeout, 429, malformed output and fallback paths produce typed, bounded behavior.

## 4. Curriculum, skill graph and personalization

- [ ] Goal-specific composition is correct for learn, job-ready, exam and project.
- [ ] Known skills and selected depth affect graph structure and workload.
- [ ] Graph invariants hold: stable unique IDs, valid dependencies, no cycles and valid ordering.
- [ ] Skill matching is domain-aware and ambiguous fuzzy candidates are not silently merged.
- [ ] Alias changes retain provenance and do not silently rewrite canonical identity.
- [ ] Learning effort hours, availability-derived weeks, recommended schedule and video runtime remain separate.
- [ ] Unknown study availability does not produce false-precision completion dates.

## 5. Resource curation and YouTube behavior

- [ ] Lesson-level resource fit is validated using policy-permitted evidence; metadata-only candidate attributes are not treated as proof of instructional coverage.
- [ ] Playlist usefulness is validated using the approved review method and inspected playable lesson items; playlist title/description alone are insufficient.
- [ ] Playable lesson count excludes private, unavailable, non-embeddable and Shorts items.
- [ ] Playlist runtime is computed from observed playable lessons without inflating invalid/missing entries.
- [ ] Skill-context cache keys isolate changed topics/search queries and preserve identical-context hits.
- [ ] Resource identity is not duplicated across unrelated roadmap nodes unless explicitly allowed.
- [ ] Preferred-language resources are prioritized; alternatives are labelled and require explicit learner selection.
- [ ] Language metadata is not represented as verified spoken-audio evidence.
- [ ] Provider quota and temporary outage are distinct from low-quality/no-match outcomes.
- [ ] YouTube API data refresh/delete, attribution, Made For Kids and 30-day retention obligations are verified before launch.
- [ ] Statistic-derived ranking/evaluation remains blocked until the applicable YouTube policy approval is evidenced.
- [ ] No custom score, percentile, ranking order, fit/quality/coverage/freshness or engagement metric derived from YouTube API Data is shipped or persisted before written policy clearance under ADR-004/ADR-005.
- [ ] Numeric resource confidence or `low_confidence` node classification is used only after the exact method is policy-approved and assessment-specifically calibrated; otherwise use categorical evidence and unresolved states.

## 6. Async lifecycle, recovery and partial completion

- [ ] Duplicate submissions with the same user/profile/idempotency identity do not create duplicate work.
- [ ] Changed confirmed profile creates a new build identity.
- [ ] Job and per-node states persist and survive API/worker restart.
- [ ] Worker claims use atomic lease/fencing semantics; expired work is safely reclaimed.
- [ ] Completed curriculum and ready nodes are preserved during retries/recovery.
- [ ] Refresh/reconnect resumes observation of the same job without resubmission.
- [ ] Retry is limited to eligible retryable/quota-limited nodes and is bounded.
- [ ] Permanent failures remain visible with safe actionable guidance.
- [ ] Cancellation is owner-authorized/idempotent, stops queued work and prevents late side effects.
- [ ] Partial results are clearly labelled; unresolved required nodes remain visible. Any summary is a first-party node-state count, not a YouTube API-derived coverage/quality score or claim that video content was verified.
- [ ] Sync and async modes have equivalent learner-visible data, ownership, privacy, quality and failure semantics.
- [ ] Domain job lifecycle states map consistently to the approved public API states and internal worker states; internal `retry_wait` is not accidentally exposed as a public state.
- [ ] Active/resumable jobs are not deleted by TTL before the supported resume window expires.

## 7. Ownership, moderation, security and abuse

- [ ] Sync and async generated learner courses are private, unpublished and owner-scoped by default.
- [ ] Manual/automatic approval modes preserve readiness, visibility, pricing and enrollment boundaries.
- [ ] Automatic approval cannot publish learner-private or archived courses.
- [ ] Every admin endpoint enforces a named permission or documented self-access exception.
- [ ] Every draft/result/event/cancel/retry endpoint enforces owner authorization.
- [ ] Untrusted prompt metadata cannot override system instructions or inject arbitrary schema fields.
- [ ] Rate limits, per-user concurrency, global provider budgets and quota reservation are enforced.
- [ ] Missing actor identity fails closed for background work that consumes learner quota.
- [ ] PII, tokens, API keys and private learner data are absent from logs and test artifacts.
- [ ] Privacy deletion behavior and retention are verified separately from cancellation.
- [ ] Security negative-test cases SEC-01–SEC-08 and the cross-cutting IDOR/RBAC/payment/webhook/rate-limit cases in [Security Negative-Test Specification](SECURITY_NEGATIVE_TEST_SPECIFICATION.md) are implemented and evidenced before their applicable release gates.

### D-07 course governance and enrollment acceptance

- [ ] Unset/invalid approval setting resolves to manual mode.
- [ ] Manual generated course starts pending, draft and unpublished.
- [ ] Manual approval records reviewer/time and does not publish before readiness/publication checks.
- [ ] Manual rejection remains unpublished and records an auditable reason.
- [ ] Automatic mode records automatic provenance and publishes only readiness-passing, non-private, non-archived courses.
- [ ] Automatic mode never publishes a learner-private course; sync and async both persist owner and private visibility before policy hooks.
- [ ] Public catalog/details exclude pending, rejected, private, archived and deleted generated courses.
- [ ] Approval, publication, visibility, pricing and enrollment changes do not implicitly mutate one another.
- [ ] Generated pricing policy affects only configured generation modes; default `applyTo` is verified.
- [ ] Paid pricing rejects zero/negative/invalid base price; sale price must be positive and below base price.
- [ ] Unknown pricing mode fails closed for learner enrollment.
- [ ] Enrollment rejects unpublished/ineligible courses and courses with enrollment disabled.
- [ ] Free course individual enrollment works without a subscription.
- [ ] Paid course enrollment requires verified payment or active published-course entitlement.
- [ ] Course generation/approval/publication creates no Enrollment record.
- [ ] Enrollment status, access source and learning progress remain independent.
- [ ] Admin-revoked enrollment cannot be reactivated by learner self-service.
- [ ] Archival/deletion behavior for existing enrollments and retroactive pricing changes are explicitly decided and tested before implementation.

## 8. Integration, browser and operations

- [ ] MongoDB persistence, uniqueness and atomic state transitions are tested.
- [ ] Redis/cache outage and quota-store failure degrade safely.
- [ ] Gemini/YouTube adapters are tested with mocks for timeout, quota, malformed response and retry.
- [ ] API contract tests distinguish learner/app 429 limits, upstream provider 429 mapped to the approved platform error, daily provider quota exhaustion, and quota-store outage; no quota-store outage makes an upstream request.
- [ ] A small quota-capped operator-run staging smoke test validates real provider behavior; no unbounded live golden-set run.
- [ ] Normal Search browser journey covers local results and external fallback.
- [ ] Build with AI browser journey covers topic-only onboarding, profile confirmation, generation, partial state and recovery.
- [ ] Admin moderation journey covers manual and automatic approval.
- [ ] Failure-injection covers worker crash, API restart, lease expiry, provider outage and browser reconnect.
- [ ] Load/concurrency limits and SLO baselines are measured before rollout.
- [ ] Render API/worker, Redis, Vercel domains, feature flags and health/readiness are verified before production rollout.

## 9. Final execution record

- [ ] Run the full backend test suite after implementation is complete.
- [ ] Run relevant client unit tests and browser E2E suites.
- [ ] Run integration and failure-injection suites in the approved environment.
- [ ] Record exact commands, commit SHA, test counts, failures and skipped tests.
- [ ] Resolve or explicitly accept every failure; do not hide failures by weakening assertions.
- [ ] Complete release-gate CI and the Go/No-Go review before merge/deployment.

**Last full backend baseline before the recent focused fixes:** 939 tests, 937 passed, 2 failed. Both failures were subsequently fixed in focused runs (cache scope assertion and admin route coverage parser). The full suite has not yet been rerun and remains pending.

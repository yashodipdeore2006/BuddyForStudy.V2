# Build with AI — YouTube Quota and Provider Degradation Contract

**Status:** Proposed operating contract — implementation and policy approval pending  
**Source inspection:** `docs/build-with-ai-engineering-readiness` branch, 2026-11-16  
**Scope:** YouTube Data API quota accounting, admission, retries, soft degradation, hard exhaustion, provider/storage outages and Build with AI/Normal Search behavior  
**Related:** [ADR-004 — YouTube resource data lifecycle](ADR-004-youtube-resource-data-lifecycle.md), [ADR-005 — Curation quality benchmark and YouTube quota operating model](ADR-005-curation-quality-and-youtube-quota-model.md), [Cache Architecture and Invalidation](BUILD-WITH-AI-CACHE-ARCHITECTURE-AND-INVALIDATION.md), [API Contracts and Backward Compatibility](BUILD-WITH-AI-API-CONTRACTS-AND-COMPATIBILITY.md)  
**Tracking:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)

> This document records the inspected implementation and proposes a coherent provider-degradation contract. It does not authorize code changes, YouTube policy acceptance, quota extensions, live evaluation, environment changes or deployment.

## 1. Executive contract

YouTube is an optional resource-discovery and metadata-validation provider. It must not become a single point of failure for learner-owned curriculum, local course search or already completed roadmap work.

The contract has six invariants:

1. **Two quota buckets stay separate.** `search.list` calls consume the search bucket; other YouTube Data API methods consume the shared default bucket. An exhausted bucket must not be represented as if both buckets are exhausted.
2. **Every outbound attempt is reserved first.** Failed, invalid, timed-out and retried requests still consume provider quota. No retry or pagination path may bypass the same atomic application budget.
3. **Soft degradation changes admission priority.** It should stop optional fan-out before the hard cap is reached. A state label without a scheduling/admission effect is not a degradation policy.
4. **Hard exhaustion is explicit and bucket-specific.** Stop new calls to the exhausted bucket; continue only operations that are allowed by the other bucket and are genuinely necessary.
5. **Provider failure does not erase first-party progress.** Keep valid local courses, generated curriculum, completed nodes and previously selected resources whose metadata remains policy-current. Mark unresolved resources with an explicit retryable state.
6. **Provider data is not product truth.** Never bypass freshness, privacy, language, embeddability, Made For Kids, attribution or YouTube API policy requirements to improve apparent coverage.

The product-level result should distinguish:
- curriculum generation status;
- resource coverage/availability status;
- provider/quota state;
- retry eligibility and next retry time.

A roadmap may be curriculum-ready while resource availability is partial. It must not be described as fully resource-verified when some nodes are quota-limited.

## 2. Provider quota facts and application limits

### 2.1 Google quota model

The official [YouTube Data API Quota Calculator](https://developers.google.com/youtube/data/determine_quota_cost) and [API overview](https://developers.google.com/youtube/data/getting-started) were checked on 2026-11-16.

The documented default allocation is:
- `search.list`: 100 calls/day in its own bucket, one quota point per call;
- all other Data API methods combined: 10,000 units/day in the shared default bucket;
- `videos.insert` has its own bucket too, but BuddyForStudy's inspected read/search flow does not use that method;
- `videos.list`, `channels.list`, `playlists.list` and `playlistItems.list`: one shared unit per request;
- every request, including invalid requests, costs at least one point;
- every additional page is a new API request and incurs quota;
- daily quotas reset at midnight Pacific Time.

These are published defaults, not proof of the quota assigned to the BuddyForStudy Google Cloud project. The Google Cloud Console quota page is authoritative for the actual project allocation. Google may change defaults and method buckets; recheck before release and after quota-policy announcements.

This is a quota-unit model, not a monetary price model. Do not convert quota points into USD or infer a per-request charge from the quota table. Gemini token charges, infrastructure invoices and YouTube quota are separate economic dimensions.

### 2.2 Current checked-in application defaults

The inspected `server/src/config/env.js` defines:
- `YT_SEARCH_DAILY_LIMIT`: default 90, clamped to 1–100;
- `YT_DAILY_QUOTA_BUDGET`: default 9,000 shared units;
- `YT_SOFT_LIMIT_PCT`: default 80%, clamped to 1–100;
- `YT_COMBINED_SEARCH`: false unless explicitly set to true.

With the default values, the current thresholds are:

| Bucket | Google published default | Application hard cap | Soft threshold |
|---|---:|---:|---:|
| Search calls | 100 calls/day | 90 calls/day | 72 calls/day |
| Shared default units | 10,000 units/day | 9,000 units/day | 7,200 units/day |

The 10% hard-cap reserve is intentional. If Google Cloud Console shows lower or otherwise customized limits, application caps must be reduced to remain below the actual allocation. A higher console allocation does not automatically authorize raising application caps.

The code defaults are not live configuration evidence. Production environment values and current Google Cloud usage remain a pre-launch verification item.

## 3. Current implementation — source-mapped findings

### 3.1 Quota accounting and reservation

Inspected:
- `server/src/services/quota.service.js`
- `server/src/models/YouTubeQuotaUsage.js`
- `server/src/services/youtubeGateway.js`
- `server/src/config/env.js`

Observed behavior:

1. `YouTubeQuotaUsage` stores daily `searchCalls`, `units`, `searchExhausted` and `exhausted` state.
2. `tryConsume()` selects the search bucket only for endpoint `search`; all other gateway endpoints use the shared default bucket.
3. MongoDB `findOneAndUpdate` performs an atomic conditional reservation. Concurrent reservations cannot exceed the configured application cap when the quota store is healthy.
4. The daily key uses `America/Los_Angeles`, aligning the reset boundary with midnight Pacific Time, including daylight-saving transitions.
5. Existing rows are backfilled with the search-bucket fields when needed.
6. The gateway reserves quota before each network attempt. A timeout, network failure, HTTP failure or retry does not refund the reservation.
7. A provider-reported `quotaExceeded` or `dailyLimitExceeded` response marks the relevant bucket exhausted. Search exhaustion does not automatically exhaust the shared read bucket, and vice versa.
8. If the quota store cannot be read or reserved, `tryConsume()` throws `QuotaBudgetError` and the gateway refuses the provider request. This is fail-closed behavior.

The quota service exposes separate `defaultState` and `searchState`, as well as a combined state. The combined state is useful as a high-level warning but must not be the only input to endpoint admission or user-facing diagnostics.

### 3.2 Soft-limit behavior is currently advisory

The quota service calculates `ok`, `degraded` and `exhausted` for each bucket. However:
- `tryConsume()` continues to allow reservations while the relevant bucket is below its hard cap, including when the state is `degraded`;
- the existing `quota.service.test.js` explicitly verifies that soft-degraded usage can still consume quota;
- `youtubeGateway.js` records the quota state but does not implement the priority order proposed in ADR-005;
- the curation decision engine can continue channel-playlist expansion and playlist enrichment after a candidate-search branch has failed or the quota state is degraded.

Therefore the 80% threshold currently reports pressure; it does not itself suppress optional provider work or reserve remaining quota for critical operations. The ADR-005 priority order is a target policy, not an implemented guarantee.

### 3.3 Retry and timeout behavior

The inspected gateway:
- applies an 8-second timeout to each fetch attempt;
- retries HTTP 429 and HTTP 5xx responses up to three total attempts;
- retries network/timeout failures up to three total attempts;
- uses short fixed backoff intervals (300 ms, then 900 ms) plus 0–100 ms jitter;
- does not retry a recognized provider daily-quota-exhaustion response;
- reserves quota again before each retry.

This correctly counts retries as separate provider calls. Remaining design gaps include no explicit `Retry-After` handling, no endpoint/workflow-specific retry budget, and no distinction in the public contract between a provider rate limit, a daily quota exhaustion and a local quota-store outage.

### 3.4 Request telemetry currently mixes independent buckets

The inspected `youtubeRequestMetrics.js` increments:
- `searchCalls` for the `search` endpoint;
- `quotaUnits` for every endpoint, including `search`.

Google's search bucket and shared default bucket are independent. Therefore `quotaUnits` in the current request context is not a valid representation of the shared 10,000-unit bucket. It combines search-call counts with shared units.

The current context also lacks a complete per-endpoint count map. ADR-005 already identifies this correction. Do not use the combined `quotaUnits` value as a shared-budget dashboard, cost forecast or quota reconciliation figure.

### 3.5 Build with AI node-level degradation

Inspected:
- `server/src/services/nodeCuration.service.js`
- `server/src/services/asyncRoadmap.service.js`
- `server/src/services/aiRoadmap.service.js`
- `server/src/services/youtube.service.js`

Observed behavior:
- A cached node selection returns zero new search calls and zero quota units in node metadata.
- A quota refusal in `curateForNode()` returns no selected resource, state `quota_limited`, and does not cache an empty result. This permits a later request after quota becomes available.
- Async roadmap resolution persists each node's build state. A quota-limited node is marked `quota_limited`; completed node resources remain attached.
- Async roadmap finalization can complete the draft with `resourceAvailability.status = partial_quota_limited` when the combined quota state is exhausted and resource coverage is incomplete. The curriculum draft remains available.
- The async service emits node events with a `quotaLimited` flag and emits a final `done/ready` event for the curriculum job.

**Important parity gap:** the synchronous `aiRoadmap.service.js` resource-quality evaluator only treats the quota state `exhausted` as a reason to accept a partial-resource curriculum. A quota-store outage returns a degraded state and is not treated as confirmed quota exhaustion; when resource quality is incomplete, the sync path can reject the build. Async node resolution, by contrast, maps a quota-store refusal to node-level `quota_limited` and may still finalize the curriculum. Sync and async therefore do not yet have identical behavior for quota-store degradation.

The existing sync/async API contract must preserve this distinction: a curriculum-ready result does not mean every YouTube node is ready.

### 3.6 Normal Search behavior

The inspected `course.service.js:listPublished`:
- searches local published BuddyForStudy courses;
- calls the YouTube curation engine for a non-empty search query even when local courses were found;
- catches curation failure and still returns the local course results, with an empty YouTube resource list and a `youtubeError` value.

This means local catalog results survive provider failure. It also means the current route still makes a YouTube curation attempt when local results exist; this is a separate Normal Search policy issue tracked under ADR-001/D-02, not a quota correctness guarantee. The quota contract must not silently reclassify that behavior as local-first/no-provider-call.

### 3.7 Existing regression coverage discovered

The repository already contains tests including:
- `server/src/services/quota.service.test.js`
- `server/src/services/quota.phase1.test.js`
- `server/src/services/nodeCuration.phase2.test.js`
- `server/src/services/asyncRoadmap.service.test.js`

Their source covers separate bucket accounting, hard-cap refusal, concurrency reservations, Pacific reset behavior, retry quota reservations, provider search-bucket exhaustion, quota-limited node non-caching/retry after reset, and async preservation of a personalized course with quota-limited resources.

These tests were inspected, not executed in this documentation task. Their existence does not establish that CI currently passes or that the full degradation contract is implemented.

## 4. Proposed quota state model

Do not collapse every provider failure into a single `quota_exhausted` boolean. Maintain separate bucket state and provider availability.

### 4.1 Per-bucket state

| State | Meaning | Admission behavior |
|---|---|---|
| `ok` | Below soft threshold | Normal bounded admission |
| `degraded` | At/above soft threshold but below hard cap | Suppress optional work; admit prioritized requests |
| `exhausted` | Application cap reached or provider confirms daily quota exhaustion | Refuse all new calls in that bucket until its reset |
| `store_unavailable` | Application cannot safely read/reserve quota | Refuse provider calls that require reservation; never fail open |

The search and shared default buckets each have their own state, used amount, configured cap and reset boundary.

### 4.2 Provider availability state

Provider availability is a separate dimension:

- `available`: provider calls are succeeding;
- `rate_limited`: transient provider 429/rate limit;
- `temporarily_unavailable`: network, timeout or 5xx after bounded retries;
- `daily_quota_exhausted`: provider confirms a daily quota limit;
- `quota_store_unavailable`: local accounting cannot safely authorize a call;
- `not_configured`: API key absent or provider disabled;
- `unknown`: state could not be determined.

A provider 429 is not automatically a daily quota exhaustion. A local Mongo quota-store outage is not a Google quota exhaustion. The UI must not tell a learner to wait until midnight Pacific for a failure whose cause is a temporary 429 or unavailable quota store.

### 4.3 User-facing resource availability

Resource availability is a third dimension, attached to a roadmap/course result:
- `verified`: required resources passed the defined resource checks;
- `partial`: some resources are missing or not verified for a non-quota reason;
- `partial_quota_limited`: unresolved nodes are blocked by an exhausted quota bucket;
- `partial_provider_unavailable`: unresolved nodes are blocked by a provider/network outage;
- `partial_quota_store_unavailable`: unresolved nodes were not searched because quota admission could not be safely established;
- `not_required`: this curriculum has no resource-enrichment requirement.

These values are proposed. The existing `verified`, `partial` and `partial_quota_limited` values should not be renamed in place without the API compatibility process.

## 5. Proposed admission and degradation policy

### 5.1 Normal state

When both buckets are `ok`:
1. Serve valid, compliant cache hits without provider calls.
2. Run required candidate discovery and bounded metadata enrichment.
3. Apply existing per-request query, candidate, page and concurrency bounds.
4. Reserve quota for every API attempt before the request.
5. Do not expand pagination or candidate enrichment beyond the configured maximum.

### 5.2 Soft-degraded state

When either bucket reaches 80% of its application cap:
1. Reuse a compatible, still-fresh cache entry before considering a provider request.
2. Continue checks necessary to avoid presenting known unavailable, private, non-embeddable or otherwise ineligible resources as playable. If the required check cannot be made, do not represent stale metadata as currently verified.
3. Continue only the minimum candidate retrieval needed for an active learner request, within a bounded per-request budget.
4. Disable optional creator-upload expansion, additional playlist pages, broad channel-playlist discovery and deep playlist enrichment unless the request has an explicit reserved budget.
5. Do not launch benchmark/evaluation traffic or administrative bulk refresh work from the learner-serving budget.
6. Record which optional work was skipped and expose a partial/degraded reason where it changes the result.

A soft threshold must have an actual admission effect. It must not merely change a log field while all fan-out remains enabled.

### 5.3 Hard exhaustion

When a bucket reaches its hard cap or Google confirms that bucket's daily quota exhaustion:
- Refuse all further calls to that bucket until its Pacific-time reset or a verified configuration change.
- Do not retry daily quota exhaustion.
- Do not repeatedly poll Google to see whether the quota has reset.
- If the search bucket is exhausted but the shared bucket is available, allow only necessary shared reads for already-known candidate IDs; do not start a new `search.list` discovery.
- If the shared bucket is exhausted but the search bucket is available, avoid new candidate discovery that cannot be enriched/validated unless a documented use case can safely return results without those reads. Default policy: do not create fresh unverified recommendations.
- Continue serving eligible local BuddyForStudy catalog courses.
- Build with AI preserves curriculum and completed resources; unresolved resource nodes remain explicitly retryable and quota-limited.
- Do not substitute unrelated resources, change the learner's explicit language, or mark a node complete merely because provider quota is unavailable.

### 5.4 Quota-store outage

When quota storage is unavailable:
- Fail closed for every new YouTube API call because the application cannot prove that it has remaining quota.
- Do not fall back to a process-local counter as if it were globally authoritative across multiple application instances.
- Continue local BuddyForStudy search, cached data only while it remains compliant/fresh, and already-persisted learner progress.
- Distinguish this state from provider daily quota exhaustion. Do not claim a Pacific reset will fix it.
- Proposed product behavior: preserve the generated curriculum and return an explicit resource-unavailable/partial state if the curriculum itself is valid. This needs sync/async parity and product-owner approval; current sync and async behavior differs as described in §3.5.
- Alert operators because quota accounting is a provider-call safety control, not merely an analytics dependency.

## 6. Retry, timeout and circuit-breaker contract

### 6.1 Retry classification

| Failure | Retry policy | Quota reservation |
|---|---|---|
| Local quota hard stop | No provider retry | No new reservation if rejected before request |
| Google daily quota exhausted | No retry until reset/approved quota change | Failed attempt remains counted |
| Quota-store unavailable | No provider retry; fail closed | No provider call is made |
| Provider 429 | Bounded retry with backoff; honor valid `Retry-After` when present | New reservation for each attempt |
| Provider 5xx | Bounded retry with exponential backoff and jitter | New reservation for each attempt |
| Network/timeout | Bounded retry with exponential backoff and jitter | New reservation for each attempt |
| Invalid request / non-retryable 4xx | No automatic retry | Attempt remains counted |
| Missing API key / provider disabled | No retry loop; configuration alert | No provider call |

### 6.2 Retry requirements

- Keep a strict maximum-attempt count and total elapsed-time budget per logical provider operation.
- Use bounded exponential backoff with jitter; do not retry every node independently without a global request budget.
- Honor a valid provider `Retry-After` value only within the operation's maximum wait budget.
- Reserve quota before each network attempt; do not refund failed attempts.
- Do not retry `quotaExceeded` or `dailyLimitExceeded` as if they were transient rate limits.
- Prevent nested retry loops in gateway, curation selector, node worker and job retry layers from multiplying requests unexpectedly.
- Surface retryability and retry-after metadata as typed fields, not message parsing.

The current gateway's three-attempt behavior is a useful bounded baseline, but the backoff and retry classification should be centralized and tested before increasing retry counts.

### 6.3 Circuit-breaker behavior

A circuit breaker may pause calls after repeated transient provider failures, independently of daily quota:
- open after a configured rolling failure threshold;
- use a bounded cooldown;
- permit a small half-open probe budget;
- close after a successful probe;
- remain open for confirmed daily quota exhaustion until reset;
- remain open for quota-store outage until accounting recovers.

Circuit-breaker state must be shared across instances or conservatively scoped to prevent each instance from independently probing an unhealthy provider. Thresholds and cooldowns must be chosen from observed telemetry, not guessed in this design document.

## 7. Workflow-specific behavior

### 7.1 Build with AI

| Condition | Required behavior |
|---|---|
| Candidate/node cache hit and provider metadata is fresh | Reuse compliant cached selection; zero provider calls |
| Search bucket soft-degraded | Reduce new search fan-out and optional expansion |
| Shared bucket soft-degraded | Reduce detail/playlist enrichment; retain only required validation |
| One bucket exhausted | Mark nodes requiring that bucket as quota-limited; do not pretend the other bucket is exhausted |
| Both buckets exhausted | Stop all new provider calls; preserve curriculum and completed resources |
| Quota store unavailable | Fail closed; preserve valid curriculum under approved partial-result behavior |
| Transient 429/5xx/network failure | Bounded retry; then provider-unavailable partial result if still unresolved |
| Resource-quality failure unrelated to quota | Keep the existing quality policy; do not relabel it quota-limited |

A roadmap operation should expose:
- curriculum/job state;
- resource-availability state;
- unresolved node IDs and their node states;
- provider availability and per-bucket quota states;
- retryable flag and server-calculated retry time when meaningful;
- safe learner-facing explanation.

A roadmap job may be complete as a curriculum while resource enrichment remains partial. This must be explicit in the result and UI.

### 7.2 Normal Search

- Local BuddyForStudy search results remain available when YouTube is exhausted or unavailable.
- YouTube fallback/supplementary resources are omitted or deferred when discovery cannot be completed safely.
- Never replace a missing YouTube result with an unrelated or uncurated result.
- Do not call Gemini as a quota fallback for Normal Search; Normal Search remains governed by ADR-001.
- A valid cache hit may be used only within the cache contract and YouTube data freshness/retention rules.
- The existing code calls curation even when local results exist. The local-first/no-unnecessary-provider-call behavior is a separate ADR-001/D-02 implementation gap and must not be claimed as complete based on this contract.

### 7.3 Compliance refresh and admin evaluation

- Compliance refresh is not optional learner discovery traffic. If the system cannot refresh a provider snapshot before the 30-day policy deadline, the stale metadata must be removed/hidden as required by ADR-004; it must not be served indefinitely because quota is exhausted.
- Bulk refresh work must have a separate bounded budget and priority schedule. It must not consume the entire learner-serving quota.
- The current readiness evidence says the Render worker and production compliance-worker flag are not verified. A code-level 25-day target is not a production guarantee.
- The live curation evaluator can consume up to 10 search calls per cold topic; a 30–50-topic cold run can exceed the default search bucket. Do not run it as one un-preflighted live batch.
- Any automated ranking/quality metric derived from YouTube API Data remains blocked on the compliance decision in ADR-004/ADR-005. Frozen snapshots do not automatically make a prohibited derived metric permissible.

## 8. Quota telemetry and alerting contract

### 8.1 Required counters

Maintain separate values:

- `searchCallsReserved`, `searchCallsSucceeded`, `searchCallsFailed`, `searchCallsRefused`;
- `defaultUnitsReserved`, `defaultUnitsSucceeded`, `defaultUnitsFailed`, `defaultUnitsRefused`;
- `totalApiAttempts`, `retryAttempts`, `provider429`, `provider5xx`, `networkTimeouts`;
- `quotaStoreReadFailures`, `quotaStoreReservationFailures`;
- per-endpoint counts for `search.list`, `videos.list`, `channels.list`, `playlists.list`, `playlistItems.list`;
- per-workflow counts for Normal Search, Build with AI (roadmap/job/node), compliance refresh and admin evaluation;
- per-cache-layer hit/miss counts and provider calls avoided;
- soft-degraded duration, hard-stop duration and circuit-breaker state.

A request reservation is not the same as a successful response. Preserve both concepts. Do not combine the search bucket and shared units into one field called `quotaUnits`.

### 8.2 Privacy and cardinality

- Do not log API keys, complete provider URLs containing credentials, raw learner prompts, syllabus text or private profile content.
- Use opaque request/job/node IDs and bounded endpoint/workflow labels.
- Avoid unbounded metric labels such as raw topic, query, user ID or video title.
- Keep quota telemetry separate from YouTube-derived ranking/quality metrics. Quota counts are application operational telemetry, not permission to derive additional product metrics from YouTube API Data.

### 8.3 Proposed alerts

| Alert | Trigger | Operator action |
|---|---|---|
| Search soft-degraded | Search bucket ≥ configured soft threshold | Disable optional search fan-out; inspect endpoint/workflow usage |
| Shared soft-degraded | Shared bucket ≥ configured soft threshold | Reduce optional detail/playlist enrichment |
| Bucket hard stop | Either bucket exhausted | Confirm correct bucket, reset date and learner degradation behavior |
| Quota store unavailable | Any sustained read/reservation outage | Verify MongoDB health; provider calls must remain fail-closed |
| Unexpected retry amplification | Attempts per logical operation exceed approved bound | Inspect nested retries, timeouts and provider status |
| Worker freshness risk | Compliance refresh lag approaches the 25-day target | Restore worker/flag or remove stale provider metadata before day 30 |
| Telemetry bucket mismatch | Endpoint reservations do not reconcile with bucket totals | Investigate instrumentation before using cost forecasts |

Numeric alert duration, paging severity and SLO thresholds must be set from measured baseline and on-call ownership.

## 9. Quota efficiency and workload budgets

The source-derived cold-cache ceilings already recorded in ADR-005 are stress bounds, not observed averages:

| Workload | Search bucket | Shared default bucket |
|---|---:|---:|
| One Normal Search curation pass | Up to 10 calls | Approximately 222 units at default result setting |
| One Build with AI node curation | Up to 4 calls | Approximately 216 units |
| 14-node cold roadmap | Up to 56 calls | Approximately 3,024 units |
| 30-topic cold live evaluation | Up to 300 calls | Additional shared usage depends on enrichment |
| 50-topic cold live evaluation | Up to 500 calls | Additional shared usage depends on enrichment |

The upper bounds assume cold caches and maximum fan-out described in ADR-005. They are not average cost estimates or guarantees that a request will consume exactly these values.

The largest identified shared-unit fan-out is deep playlist enrichment: the current selector can shortlist up to 15 playlists, and a single playlist detail path can make one playlist lookup, up to six playlist-item page requests and up to six video-detail batches. ADR-005 recommends filtering before deep enrichment, reducing the number of deeply enriched playlists, bounding membership inspection and disabling optional creator expansion under quota pressure.

Required design rules:
1. Bound the maximum search calls, shared reads and total elapsed time per logical request.
2. Bound playlist candidate enrichment separately from candidate discovery.
3. Do not spend the remaining learner-serving budget on optional creator expansion or extra pages after soft degradation.
4. Preflight bulk/admin/evaluation work against the correct bucket before the first provider call.
5. Keep learner traffic and compliance refresh budgets observable and separately controllable.
6. Revisit caps only after Cloud Console allocation, real staging usage, cache hit rates and per-workflow telemetry are verified.

## 10. Acceptance tests and implementation gates

The existing test suite already covers several quota fundamentals. The following additional or explicitly verified gates are required before the degradation contract is considered implemented:

### Accounting and admission
- [ ] Search calls increment only the search bucket; never shared `defaultUnits`.
- [ ] Every other endpoint increments only shared default units.
- [ ] Every pagination page and retry reserves the correct bucket.
- [ ] Failed/invalid/time-out attempts remain counted.
- [ ] Concurrent multi-instance reservations cannot overshoot the hard cap.
- [ ] Search exhaustion does not block independent shared reads; shared exhaustion does not falsely mark search exhausted.
- [ ] Quota-store read/write failure refuses provider requests across all app instances.
- [ ] Soft-degraded state actually disables optional fan-out; it is not just a telemetry label.

### Retry and provider failure
- [ ] 429, 5xx and network/timeout retry counts and elapsed time stay within the configured budget.
- [ ] Valid `Retry-After` is honored within the maximum wait budget.
- [ ] Daily quota exhaustion is never retried.
- [ ] Provider rate limit, daily quota exhaustion and quota-store outage produce distinct error/state codes.
- [ ] Circuit-breaker behavior is shared/conservative across app instances.

### Build with AI
- [ ] Sync and async paths return the same curriculum/resource availability semantics for each provider failure class.
- [ ] Quota-limited nodes are not cached as empty successful selections.
- [ ] Completed resources and curriculum nodes survive quota exhaustion and provider outages.
- [ ] Unresolved nodes expose a retryable state without being marked complete.
- [ ] The curriculum can remain available when resource enrichment is partial, subject to approved product quality policy.
- [ ] Retry after quota reset reprocesses only eligible unresolved nodes and preserves successful nodes.

### Normal Search and compliance
- [ ] Local catalog results remain available when YouTube fails.
- [ ] No unrelated/unreviewed YouTube fallback or language substitution appears under degradation.
- [ ] No Gemini call is introduced into Normal Search as a quota fallback.
- [ ] Stale provider metadata is not surfaced as verified merely because refresh quota is unavailable.
- [ ] Bulk evaluation refuses a live run before provider calls when the planned search-call ceiling exceeds the approved budget.
- [ ] YouTube policy/derived-metric gates remain enforced independently of quota availability.

### Observability
- [ ] Endpoint and workflow telemetry reconcile with both provider buckets.
- [ ] `searchCalls` and `defaultUnits` are separate in logs, dashboards and reports.
- [ ] Alerts fire for soft-degraded state, hard stop, quota-store outage and compliance refresh risk.
- [ ] Telemetry excludes secrets and raw learner content.

No tests were run or changed as part of this documentation task.

## 11. Open decisions requiring owner approval

- [ ] Approve the per-bucket state and provider-availability enums.
- [ ] Approve whether curriculum generation may finish with `partial_quota_store_unavailable` when quota storage fails closed; align sync and async paths.
- [ ] Approve the soft-degradation admission priority and reserved budgets for learner traffic versus compliance refresh.
- [ ] Decide whether provider 429 uses the current fixed retry baseline or a Retry-After-aware policy and set the total elapsed-time budget.
- [ ] Approve circuit-breaker scope, thresholds and cooldown based on telemetry.
- [ ] Confirm actual Google Cloud quota allocation and production application caps.
- [ ] Approve telemetry changes that split search calls from shared units and add endpoint/workflow counts.
- [ ] Confirm the Render worker/compliance refresh topology and its operational owner.
- [ ] Complete YouTube policy review for API-derived ranking/benchmark metrics separately from quota approval.

## 12. Implementation sequence after Go/No-Go

1. Verify the Google Cloud project quota allocation and Render production configuration; record evidence.
2. Correct request metrics to separate search calls, shared units, endpoint counts and retry/refusal outcomes.
3. Implement explicit per-bucket admission policy and soft-degradation priorities.
4. Normalize provider error classification and bounded retry behavior, including `Retry-After`.
5. Unify sync/async resource availability and quota-store outage behavior behind one contract.
6. Add failure-injection, concurrency and cross-instance tests for all quota states.
7. Add dashboards/alerts and a quota runbook; validate with capped staging workloads.
8. Measure cold/warm cost by endpoint and workflow before adjusting candidate fan-out or application caps.
9. Verify compliance refresh worker execution and provider metadata retention independently of learner quota.
10. Roll out with explicit monitoring and rollback triggers; do not treat documentation as deployment approval.

**Decision boundary:** Proposed operating contract only. No code, quota values, provider calls, database data, feature flags, production environment, Render service, deployment or `main` branch was changed.

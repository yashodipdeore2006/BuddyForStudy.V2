# ADR-005 — Curation quality benchmark and YouTube quota operating model

**Status:** Proposed — policy approval, benchmark labels and production telemetry pending  
**Date:** 2026-11-15  
**Scope:** YouTube-backed Normal Search fallback and Build with AI lesson-resource selection  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Related:** ADR-001 (Normal Search), ADR-004 (YouTube lifecycle/policy), readiness issue #43

## 1. Purpose

Define a measurable way to evaluate whether curation returns useful learning resources, and estimate the YouTube Data API quota consumed by each cold search/build.

This ADR deliberately separates:

- quality labels assigned by human reviewers;
- API Data returned by YouTube;
- BuddyForStudy-owned learner feedback;
- internal evaluation statistics;
- any score, ranking or other derived metric created from API Data.

The quality-benchmark design is **not permission to create or retain YouTube-derived metrics**. The default Developer Policy restricts derived metrics. The 2026 exception is limited to accepted analytics use cases and specifically accepted metrics. BuddyForStudy has no repository evidence of such an acceptance. Obtain an explicit policy decision before using API-derived scores in the product or persisting automated benchmark metrics based on ranked API Data.

No live benchmark is being run by this ADR; the checked-in golden-set file is a placeholder and the evaluation runner calls live YouTube-backed curation.

## 2. Verified repository baseline

Inspected on `main` on 2026-11-15:

- `server/src/services/courseCurationDecisionEngine.service.js`
- `server/src/services/courseCurationEvaluation.service.js`
- `server/src/scripts/evaluateCourseCuration.js`
- `server/data/course-curation-golden-set.example.json`
- `docs/backend/COURSE_CURATION_EVALUATION.md`
- `server/src/services/quota.service.js`
- `server/src/services/youtubeRequestMetrics.js`
- `server/src/services/youtubeGateway.js`
- `server/src/services/youtube.service.js`
- `server/src/services/nodeCuration.service.js`
- `server/src/services/discovery.service.js`
- `server/src/models/YouTubeQuotaUsage.js`
- `server/src/config/env.js`
- `render.yaml`

### 2.1 Current evaluator and labels

The current evaluator implements:

- `NDCG@K`
- `precision@K`
- `recall@K`
- `hiddenGemRecall@K`
- `junkRate@K`
- top-result reported coverage

The golden-set template expects a topic and exact YouTube `sourceId` labels. Existing relevance labels are:

- `3`: strongly relevant, suitable learning resource
- `2`: relevant with notable limitations
- `1`: marginally relevant
- `0` or omitted: not relevant
- `junkResourceIds`: misleading, spammy, off-topic or otherwise unsuitable resources
- `hiddenGemResourceIds`: expert-labelled resources described as strong quality despite low exposure

The checked-in JSON is only a placeholder, not a labelled benchmark. The existing evaluation guide recommends approximately 30–50 human-reviewed topics. The evaluation runner currently calls `curateNormalSearch(topic)` live for each topic and reports a macro mean; it does not read a frozen candidate/result snapshot.

### 2.2 Important limitations in the current evaluator

1. It runs live curation and can consume real YouTube quota.
2. It evaluates all metrics at one configured K (default 10); it does not report P@5 and NDCG@10 separately in one run.
3. It reports aggregate means but no confidence intervals or segment-level breakdowns by domain, language, level or query intent.
4. `topResultReportedCoverage` uses the engine's metadata-reported coverage field. It is not evidence that the recommended video actually teaches those topics.
5. `hiddenGemRecall@K` relies on a low-exposure/hidden-gem concept; the production engine currently computes hidden-gem bonus using YouTube view-derived percentile information. Suspend this metric and bonus unless the exact use case is approved under YouTube's additional-metrics pathway.
6. The evaluator's 5% junk-rate target is configurable by `CURATION_EVAL_MAX_JUNK_RATE`; it is not evidence that the current system has achieved 5%.
7. The script does not currently preflight the whole dataset against the daily search-call quota before starting.

### 2.3 Current resource-quality limitations

The production curation engine scores/reorders candidates from multiple YouTube API fields, including title, description, channel and playlist metadata, publication date, duration, item count, language fields and statistics. Its metadata judge also evaluates candidate titles/descriptions and playlist lesson-title/description metadata; it does not watch videos or inspect transcripts.

Consequently, the engine's coverage, instructional, freshness, fit, authority, engagement, confidence and final-score outputs must not be represented as verified content quality. The policy implications are covered in [ADR-004](ADR-004-youtube-resource-data-lifecycle.md).

## 3. Current YouTube quota rules (official source checked 2026-11-15)

Google's current [YouTube Data API Quota Calculator](https://developers.google.com/youtube/data/determine_quota_cost) states:

- Default `search.list` allowance: **100 calls/day** in its own bucket.
- Default shared allowance for all other endpoints: **10,000 units/day**.
- Each `search.list` call costs one call from the search bucket; it is not deducted from the shared 10,000-unit bucket.
- `videos.list`, `channels.list`, `playlists.list` and `playlistItems.list` each cost **1 shared unit per request**.
- Every API request, including invalid requests, costs at least one point.
- Each additional page request is another API request and incurs quota.
- Daily quota resets at midnight Pacific Time (including the relevant daylight-saving transition).

The defaults are subject to change and any project-specific quota allocation shown in Google Cloud Console is authoritative for that API project.

This is a **quota-unit model, not a monetary price model**. The official method table provides request quota costs and daily allowances, not a per-request USD tariff. Do not convert quota units into dollars or assume a per-call monetary cost from this table. Check the actual Google Cloud project for its quota allocation and applicable account-level billing.

Primary sources:
- [Quota Calculator](https://developers.google.com/youtube/data/determine_quota_cost) — page last updated 2026-11-12 UTC.
- [YouTube Data API Overview](https://developers.google.com/youtube/data/getting-started).
- [Quota and Compliance Audits](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits).

## 4. Existing application caps

The checked-in environment defaults are:

| Setting | Current default | Google default | Application cap |
|---|---:|---:|---:|
| `YT_SEARCH_DAILY_LIMIT` | 90 search calls/day | 100 search calls/day | 90% |
| `YT_DAILY_QUOTA_BUDGET` | 9,000 shared units/day | 10,000 shared units/day | 90% |
| `YT_SOFT_LIMIT_PCT` | 80% | — | Degrade at 72 search calls / 7,200 shared units |
| Quota reset key | America/Los_Angeles date | Midnight Pacific | Aligned |
| Quota store | MongoDB daily row | — | Atomic conditional reservations |

The code maintains separate Mongo fields for `searchCalls` and shared `units`. The Mongo reservation is atomic; if quota storage is unavailable, the gateway fails closed and refuses a provider request. Transient retries reserve quota again, because each retry is a separate API request.

**This is a code-default inspection, not live Google Cloud Console evidence.** The actual API project's quota and current consumption remain to be confirmed in the pre-launch checklist.

## 5. Cold-cache request fan-out model

A cache hit may avoid provider requests. The following are conservative source-derived upper bounds for a **single cold curation pass**, not observed averages. The upper bound assumes maximum result settings, all eligible search results are unique, all six creator-expansion slots are used, and every shortlisted playlist requires a complete detail fetch.

### 5.1 Normal Search curation-engine pass

Current code defaults to up to 8 video search queries. The admin result-count setting defaults to 30 and can be raised to 50. A separate playlist search asks for up to 30 playlists in pages of up to 25, so it can consume up to 2 `search.list` calls.

| Request group | Maximum requests | Quota bucket |
|---|---:|---|
| Video candidate searches | 8 | Search |
| Structured playlist search pages | 2 | Search |
| Direct video details (up to 8 × 50 results, 50 IDs/request) | 5 at default 30 results; up to 8 at max 50 | Shared |
| Direct channel details (up to one per 50 channel IDs) | 5 at default 30 results; up to 8 at max 50 | Shared |
| Creator uploads expansion | Up to 6 `playlistItems.list` pages | Shared |
| Expanded video details (up to 60 IDs) | Up to 2 `videos.list` calls | Shared |
| Expanded channel details (up to 60 IDs) | Up to 2 `channels.list` calls | Shared |
| Playlist search result details | 1 `playlists.list` call | Shared |
| Creator-channel playlist expansion | Up to 6 `playlists.list` calls | Shared |
| Enrichment of up to 15 shortlisted playlists | Up to 15 × (1 playlist lookup + 6 playlist-item pages + 6 video-detail batches) = **195** | Shared |

**Cold-pass upper bound:** up to **10 search calls** and approximately **222 shared units** at the default 30-result setting; approximately **228 shared units** at the maximum 50-result setting.

The playlist-enrichment maximum comes from `getPlaylistCourse`: one `playlists.list` request, up to 6 `playlistItems.list` pages (the implementation stops at 300 playlist entries), and up to 6 `videos.list` batches of 50 IDs. The engine can enrich up to 15 shortlisted playlist candidates. Caches and earlier hard gates often reduce the actual number, but this is a substantial potential cost multiplier.

### 5.2 Build with AI single-node curation

`nodeCuration.service.js` invokes the curation selector with `maxQueries: 2`. The playlist search can still use up to 2 pages.

| Request group | Cold-pass upper bound | Quota bucket |
|---|---:|---|
| Video candidate searches | 2 | Search |
| Structured playlist search pages | 2 | Search |
| Direct video details | Up to 2 | Shared |
| Direct channel details | Up to 2 | Shared |
| Creator uploads expansion | Up to 6 `playlistItems.list` | Shared |
| Expanded video details | Up to 2 | Shared |
| Expanded channel details | Up to 2 | Shared |
| Playlist search result details | 1 | Shared |
| Creator-channel playlist expansion | Up to 6 | Shared |
| Enrichment of up to 15 shortlisted playlists | Up to 195 units | Shared |

**Cold-node upper bound:** up to **4 search calls** and approximately **216 shared units**.

### 5.3 One 14-node complete roadmap

The current skill graph permits up to 14 nodes. If all 14 nodes require cold resource curation and none of their candidate pools/node results are cached:

- Search bucket: up to 14 × 4 = **56 search calls**.
- Shared bucket: up to 14 × 216 = **3,024 units**.

That is approximately 62% of the application's 90-call search cap and 34% of its 9,000-unit shared cap before retries or unrelated search traffic. Search calls are therefore likely to be the limiting resource first in this stress case.

This is a worst-case stress envelope, not a measured forecast. The 24-hour candidate-pool cache, 14-day node cache, 14-day result cache, 1-hour search cache, and 24-hour detail caches can reduce usage substantially. The actual rate depends on topic repetition, playlist eligibility, cache distribution, process restarts, force-refresh use and provider retries.

### 5.4 Live golden-set evaluation cost

The current evaluator calls the live curation service once per topic. A cold normal-search topic can consume up to 10 search calls. Therefore:

- 30 cold topics: up to **300 search calls**.
- 50 cold topics: up to **500 search calls**.

This exceeds the Google default 100-call search bucket and the application's 90-call cap by several multiples. Do not run the current 30–50-topic live evaluation as one cold batch. Use frozen, policy-approved result snapshots for repeatable offline evaluation; when live refresh is necessary, run a quota-preflighted, bounded sample over multiple quota days and record actual per-endpoint cost.

## 6. Quota accounting and telemetry gaps

### What is already sound

- Search and other endpoint quotas are stored in separate fields and enforced separately.
- Atomic MongoDB reservations prevent concurrent requests from overshooting the configured app cap.
- The counter uses the Pacific-time quota day.
- Quota storage failure is fail-closed.
- API retries reserve quota again; exhausted quota is not retried as a transient failure.
- Most curation layers have bounded caches, and cache hits return zero provider calls in curation metadata.

### Required telemetry corrections

1. `youtubeRequestMetrics.js` currently increments `quotaUnits` for **every** endpoint, including `search.list`. This total mixes two independent Google buckets and is not the same as the shared 10,000-unit consumption. Expose separate fields: `searchCalls`, `defaultUnits`, `totalApiRequests`, `refusedCalls`, retries, and per-endpoint counts.
2. The current request context records only a combined request total and search calls. Add explicit endpoint counts for `videos.list`, `channels.list`, `playlists.list` and `playlistItems.list`.
3. Emit per-feature and per-workflow aggregates: Normal Search query, Build with AI roadmap ID/node ID, stale-resource refresh job and live benchmark run. Avoid storing learner prompt contents in quota telemetry.
4. Record cache layer and cache-hit status separately for result cache, candidate pool, node cache, video details, channel details and playlist detail cache.
5. Report quota consumption and cache hit rates by endpoint and workflow; aggregate daily numbers alone cannot identify a playlist-enrichment cost hotspot.
6. Preserve the raw quota rejection reason, bucket and Pacific reset date in safe telemetry. Do not log credentials or full API URLs containing keys.
7. Before a live evaluation starts, calculate the requested search-call ceiling and compare it with remaining quota. Abort or reduce the sample before any provider request if the planned run exceeds its approved evaluation budget.

## 7. Proposed quality benchmark

### 7.1 Dataset construction

Use a human-labelled dataset of approximately 30–50 topics as a first pilot, not as a final statistical proof of launch quality.

Stratify topics across:
- domains: programming/software, data/analytics, exam preparation, language learning, creative and general;
- learner levels: beginner, intermediate and advanced;
- intent: complete course, crash course and quick reference;
- explicit preferred languages, including the languages supported by the product.

For every topic, label the exact resource IDs returned by the system. Reviewers should assess the resource itself using the official YouTube player and judge whether it teaches the requested subject at the requested level and language. Metadata-only evidence must not be treated as proof of video content. Use independent human labels and adjudicate disagreements; do not derive labels from the engine's own rank or score.

Keep all queries/resources for the same topic family in the same split. A suggested pilot split is 70% development and 30% holdout by topic family, not by individual resource. Do not tune on the holdout.

### 7.2 Proposed acceptance gates (targets, not measured results)

Subject to YouTube policy clearance for any automated ranking/evaluation metrics, use these initial targets:

| Measure | Proposed target | Interpretation |
|---|---:|---|
| NDCG@10 | ≥ 0.80 | Relevant expert-labelled resources appear near the top |
| Precision@5 | ≥ 0.80 | At least four of the first five results are relevant |
| Recall@10 | ≥ 0.70 | At least 70% of all expert-labelled relevant candidates are retrieved in the top ten |
| Junk rate@10 | ≤ 0.05 | No more than 5% of top-ten resources are expert-labelled junk |
| Explicit-language mismatch | 0 surfaced mismatches | If a learner explicitly chose a language, a conflicting resource must not enter the path |
| Hard-gate violations | 0 | No private/unlisted/non-embeddable video or excluded Shorts candidate is surfaced |
| Content-verification sample | ≥ 100 resources manually inspected for the pilot; target ≥ 90% rated relevant (2 or 3) | Actual teaching quality is reviewed in the player, not inferred from metadata |

These are proposed go/no-go thresholds; there is no evidence that the current engine meets them. The existing evaluator computes NDCG/precision/recall/junk at a single K, so P@5 and NDCG@10 require separate K evaluations or a future evaluator update.

**Policy gate:** the standard YouTube policy prohibits API Clients from creating metrics from API Data. NDCG, precision, recall, score/coverage aggregates or ranking-performance reports based on the API-derived output may themselves require a policy determination. Do not persist or expose such metric outputs until compliance review confirms the internal benchmark is permitted or YouTube has accepted the precise additional-metrics use case. The 2026 exception requires acceptance of the amendment and an accepted analytics use case; it is not a blanket approval for educational-resource ranking. See [ADR-004](ADR-004-youtube-resource-data-lifecycle.md).

### 7.3 Metrics to suspend or relabel

- Suspend `hiddenGemRecall@K` and the engine's hidden-gem bonus while they depend on view-count/popularity percentiles and no explicit policy approval exists.
- Do not report `topResultReportedCoverage` as actual course/video coverage. The current value is computed from metadata evidence and has not been validated against actual playback.
- Keep BuddyForStudy-owned learner feedback (helpful, outdated, wrong-level, completed, saved/enrolled where available) separate from YouTube API Data. Make its provenance explicit and do not combine it with YouTube statistics.
- Do not interpret playlist metadata or lesson titles as proof that all playlist videos teach the stated concepts.

## 8. Quota operating policy

Retain the current conservative application caps as defaults pending real usage data:

- soft-degrade at 72 search calls or 7,200 shared units (80% of app budgets);
- hard-stop provider calls at 90 search calls or 9,000 shared units;
- maintain a 10% reserve below Google's published default limits;
- never allow a retry or pagination loop to bypass the same global caps;
- fail closed if the Mongo quota store is unavailable.

When the soft limit is reached, prioritize:
1. provider checks needed to prevent a known unavailable/private resource from being presented as playable;
2. validation of already selected course/node resources;
3. initial candidate retrieval required for an active learner request;
4. optional creator-upload expansion, extra playlist pages and deep playlist enrichment only if the remaining budget allows.

At the hard limit, stop new YouTube calls and return an explicit quota-limited state. Do not repeatedly retry until the Pacific reset. Normal Search should continue to return eligible local BuddyForStudy courses; YouTube fallback should be omitted/deferred. Build with AI should preserve completed curriculum and mark unresolved resource nodes retryable/quota-limited rather than failing the full roadmap.

## 9. Cost-optimisation opportunities (design recommendations)

The largest identifiable fan-out is playlist enrichment. Evaluate these options in order, with actual quota telemetry:

1. Rank/filter playlist candidates using the minimum necessary data before fetching full playlist membership and video details. Deep-enrich only the top few candidates rather than up to 15.
2. Set a smaller explicit per-playlist membership inspection limit for curation; current `getPlaylistCourse` can inspect up to 300 items. Define whether 50 or 100 recent/ordered items are enough for a first-pass relevance decision, then expand only after a candidate survives.
3. Cache playlist detail/membership snapshots with an explicit, compliant TTL and revalidate them according to ADR-004; avoid relying solely on a process-local 24-hour playlist cache.
4. Avoid optional creator-upload expansion when the query's candidate pool already contains enough eligible resources or when quota is degraded.
5. Reuse candidate pools across learners only where their query, language, level and result policy are equivalent; do not let one learner's selected/private resource state leak to another.
6. Keep cache invalidation and engine-version changes explicit so optimizations do not reuse an incompatible resource pool.

These are proposals; no quota, caching or ranking behavior is changed by this ADR.

## 10. Required acceptance tests and dashboards

| Scenario | Expected result |
|---|---|
| One `search.list` request | Increments searchCalls by exactly one and does not increment shared defaultUnits |
| One `videos.list`, `channels.list`, `playlists.list` or `playlistItems.list` request | Increments shared defaultUnits by exactly one |
| Search or playlist pagination | Every additional page increments its correct bucket |
| Failed/invalid provider attempt | Reserved request quota is counted |
| Transient retry | Every retry attempt consumes one additional request reservation |
| Mongo quota store unavailable | Provider request is refused |
| Concurrent requests at the hard cap | Atomic reservation prevents overshoot |
| Result/cache hit | Provider request counts remain zero |
| 14-node cold Build with AI test | Records actual per-node searchCalls and defaultUnits and remains within the configured global caps |
| 30–50-topic evaluation preflight | Refuses a live run whose estimated search calls exceed its approved evaluation budget |
| Per-endpoint telemetry | Search and shared units are reported separately; no combined field is mislabeled as the 10,000-unit quota |
| Playlist enrichment stress test | Measured units match actual list requests and pages; configured candidate cap is respected |
| Quota degraded/hard-stop | Local Search results remain available; YouTube work is deferred; completed roadmap nodes are preserved |

Dashboard requirements:
- daily search calls / 100 published default and /90 app cap;
- daily shared units /10,000 published default and /9,000 app cap;
- per-endpoint request counts and quota units;
- per-workflow quota consumption (Normal Search, Build with AI, refresh, evaluation);
- retries/refusals, soft-limit duration and quota-store health;
- candidate-pool/result/node cache hit rates;
- playlist-enrichment requests and items examined;
- cold versus warm request cost and time-to-first-result.

## 11. Open decisions and release gates

1. Obtain YouTube compliance guidance on whether BuddyForStudy learning-resource curation, metadata-derived relevance/coverage/freshness/fit scores, and offline ranked-list benchmark metrics are permitted under the default policy or can be accepted under the 2026 amendment.
2. Until that decision exists, suspend API-derived scoring/hidden-gem metrics for production and do not run/persist the automated golden-set ranking metrics as if policy approval were established.
3. Decide whether the pilot benchmark may run as a frozen human-labelled review exercise without an automated ranking-metric pipeline, and document the approved handling of source IDs and review notes.
4. Verify the actual Google Cloud API Project quota and use the observed values, not just the checked-in defaults.
5. Add endpoint-level quota telemetry and live-run preflight before the full golden-set evaluation.
6. Measure real cold/warm per-node and per-normal-search quota consumption in a quota-capped staging environment.
7. Revisit the 90/9,000 application caps only after a representative usage baseline and any necessary YouTube quota audit/extension.

**Approval boundary:** This ADR defines a proposed benchmark, quota model and operating guardrails only. It does not authorize product-code changes, live golden-set evaluation, YouTube API policy acceptance, quota-extension applications, environment changes, Render dashboard changes, PR creation/merge or deployment.

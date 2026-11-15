# Course Curation Decision Engine evaluation

**Status:** Evaluation design exists; do not run the full live benchmark until the YouTube API policy gate and quota preflight are resolved.

The helper functions in `server/src/services/courseCurationEvaluation.service.js` currently implement NDCG@K, precision@K, recall@K, hidden-gem recall@K, junk rate@K, and top-result reported coverage. Their presence does not mean a representative benchmark exists or that the current metrics are permitted for the production YouTube API use case.

**Policy gate:** YouTube's default Developer Policy restricts using API Data to create new or derived metrics. The 2026 additional-metrics pathway requires acceptance of the amendment and an accepted Analytics & Reporting use case; it is not general permission for learning-resource recommendation scoring. No approval for BuddyForStudy is recorded. See [ADR-004 — YouTube resource lifecycle and policy controls](../architecture/ADR-004-youtube-resource-data-lifecycle.md) and [ADR-005 — Curation quality benchmark and YouTube quota model](../architecture/ADR-005-curation-quality-and-youtube-quota-model.md). Do not run, persist or expose automated ranking metrics from YouTube API-derived output until the exact benchmark/use case has been reviewed and approved.

## Prepare an expert-labelled dataset

The checked-in `server/data/course-curation-golden-set.example.json` is a schema template, **not** a labelled benchmark.

After the policy gate is resolved, copy the example to `server/data/course-curation-golden-set.json`. Replace placeholders with a real search topic and the **exact** `sourceId` returned for a YouTube video, playlist or assembled series. Human reviewers—not the engine's score—must assign relevance:

- `3`: strongly relevant, suitable learning resource
- `2`: relevant with notable limitations
- `1`: marginally relevant
- omit or use `0`: not relevant
- `junkResourceIds`: resources human reviewers judge misleading, spammy, off-topic or otherwise unsuitable

Do not use `hiddenGemResourceIds` until the use of exposure/popularity data and any resulting hidden-gem metric has been expressly cleared. The current production hidden-gem bonus is based on YouTube view-derived percentile data.

Use a diverse, human-reviewed set of roughly 30–50 topics as an initial pilot, stratified across domain, learner level, course intent and requested language. Keep all variants of a topic family in one development/holdout split. Review the actual resource in the official YouTube player; title/description/playlist metadata is not proof that the video teaches the advertised concepts.

The top-result reported coverage metric is based on metadata evidence. It must not be described as verified video or course coverage.

## Quota warning before live evaluation

The current runner calls the live curation service once per topic. A cold normal-search curation can issue up to 8 video-search queries plus up to 2 structured-playlist search pages: up to 10 `search.list` calls per topic. Therefore, 30–50 cold topics could consume approximately 300–500 search calls. Google's default YouTube Data API allowance is 100 `search.list` calls per day in a separate bucket. Do not run a full live golden set as a single cold batch.

Prefer a frozen, policy-approved candidate/result snapshot for repeatable offline evaluation. If a live refresh is necessary, estimate the total calls, confirm remaining project quota in Google Cloud Console, and run a small quota-capped batch. See the quota formulas and current application caps in ADR-005.

## Run it (only after policy and quota approval)

From `server/` with MongoDB configured:

```sh
node src/scripts/evaluateCourseCuration.js data/course-curation-golden-set.json
```

Optional configuration: `CURATION_EVAL_K=10`, `CURATION_EVAL_MAX_JUNK_RATE=0.05`.

The runner uses the live curation service and logs the engine version and per-topic cache state. It currently evaluates all metrics at one K (default 10); P@5 and NDCG@10 require separate evaluations or a future runner change. The 5% junk-rate value is a configured target, not a measured result. No execution result or achieved benchmark score is claimed by this document.

## Proposed quality targets

See ADR-005 for proposed pilot targets: NDCG@10 ≥ 0.80, Precision@5 ≥ 0.80, Recall@10 ≥ 0.70, junk rate@10 ≤ 0.05, zero surfaced explicit-language mismatches and zero hard-gate violations. These are not current test results and remain subject to YouTube policy clearance for automated derived metrics.

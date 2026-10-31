# Build with AI v2 — Rollout Plan

This plan covers rollout only. All rollout controls are opt-in unless noted below. Change flags one at a time, deploy, observe, and keep the previous value ready for rollback. Do not enable live selector comparison from CI.

## Verified implementation notes

- The guide is named `Build with AI v2 Implementation Guide.md`; `docs/BUILD_WITH_AI_V2.md` is not present on the Phase 7 branch.
- Server flags are parsed in `server/src/config/env.js`. Boolean flags are enabled only by the exact string `true`.
- `INTENT_V2` is also consumed by the frontend as `VITE_INTENT_V2=true`; server-side `INTENT_V2` and frontend `VITE_INTENT_V2` are separate settings.
- `ASYNC_ROADMAP` is a server flag and the frontend also has `VITE_ASYNC_ROADMAP=true`.
- `ENABLE_CURATION_COMPLIANCE_WORKERS` exists in the server config in addition to the flags enumerated in the guide; it is included in the table.
- `AI_PRIVATE_COURSES_SKIP_REVIEW` defaults off. Do not enable it as part of the initial rollout; only consider it after verifying the private-course approval hooks and confirming private visibility is the only affected scope.
- The old selector is `searchBestYouTubeCourse`; the shared engine is exposed to roadmap nodes through `curateForNode`, which calls `curateNormalSearch`.
- Node curation exposes `cacheHit`, `searchCalls`, `quotaUnits`, and a node state in its metadata. The quota service exposes the current state, units, budget, reset day and storage backend.
- Current README lacked a Build with AI section. No source `.env` file was read.

## Environment flags and controls

| Name | Default | What it does | Rollout notes |
| --- | --- | --- | --- |
| `USE_CURATION_ENGINE_FOR_AI` | `false` | Uses the shared normal-search curation engine for Build with AI node selection; legacy selector remains the fallback. | First selector rollout flag. |
| `INTENT_V2` (server) | `false` | Enables server-side intent/question-plan behavior where checked. | Coordinate with frontend flag. |
| `VITE_INTENT_V2` (frontend) | unset / `false` | Enables the intent-driven Build with AI question flow in the client. | Rebuild frontend to change. |
| `ASYNC_ROADMAP` (server) | `false` | Enables async roadmap draft/finalize/poll/events endpoints. | Keep frontend async mode off until server routes are deployed and smoke-tested. |
| `VITE_ASYNC_ROADMAP` (frontend) | unset / `false` | Enables the client’s async draft and polling flow. | Enable only after server flag and auth flow are verified. |
| `YT_COMBINED_SEARCH` | `false` | Requests video and playlist types together in YouTube search, then filters results to video IDs in the current service. | Enable only after comparing result coverage and request costs; current implementation filters playlists from the combined response. |
| `ENABLE_TRUSTED_CHANNELS` | `false` | Enables trusted-channel candidate expansion where implemented. | Watch whether it reduces rather than increases search.list calls. |
| `ENABLE_CURATION_COMPLIANCE_WORKERS` | `false` | Enables Phase 7 curation compliance/background workers. | Verify worker schedule and dry-run/refresh behavior before enabling in a shared environment. |
| `YT_DAILY_QUOTA_BUDGET` | `9000` | Application quota budget used by the YouTube quota guard. | Conservative internal budget below the nominal 10,000-unit daily project quota. |
| `YT_SOFT_LIMIT_PCT` | `80` | Percentage of the internal budget at which the quota service enters degraded mode and refuses search.list calls. | Watch state transitions and cache-only behavior. |
| `NODE_CACHE_TTL_DAYS` | `14` | TTL for persistent per-node curation cache; clamped to 1–25 days. | Keep at or below 25 days. |
| `NODE_CONCURRENCY` | `3` | Maximum node curation concurrency configured for the async resolver. | Increase only after observing provider pressure and tail latency. |
| `AI_PRIVATE_COURSES_SKIP_REVIEW` | `false` | Controls the private generated-course review bypass proposal/hook. | Do not enable during routine rollout without confirming only private courses are affected. |

The quota guard uses a 100-unit cost for `search` and 1 unit for other YouTube API endpoints. The quota state is `ok`, `degraded`, or `exhausted`; the service resets by Pacific Time day. Do not compare raw unit totals without the reset day and configured budget.

## Enablement order

### Development

Enable one stage at a time. Run tests and one controlled manual roadmap after each change.

| Step | Change | What to watch after enabling |
| --- | --- | --- |
| 0 | Keep all new boolean flags off; record a baseline with the current selector. | Baseline quota state/units, `search.list` calls per roadmap, node cache hit rate, and fallback rate. |
| 1 — Phase 1 | Verify quota guard and gateway behavior; then use the configured daily budget/soft limit. Keep `YT_COMBINED_SEARCH=false` initially. | Quota counter and transitions; `search.list` calls per roadmap; confirm 1-unit requests continue in degraded state and search calls stop. |
| 2 — Phase 2 | Set `USE_CURATION_ENGINE_FOR_AI=true`. Leave trusted channels and combined search off initially. | Per-node `cacheHit`, `searchCalls`, `quotaUnits`; roadmap search.list total; fallback-to-legacy rate; low-confidence/failed/queued node counts. |
| 3 — Phase 3 | Deploy template cache and skill registry changes; no extra flag is listed for this phase. | Template hit rate, build latency, Gemini fallback rate, and whether identical skills cause fewer search.list calls. |
| 4 — Phase 4 | Set server `INTENT_V2=true` and frontend `VITE_INTENT_V2=true` together. | Invalid-intent/fallback-plan rate, question skip/change rate, roadmap completion and Gemini timeout rate. |
| 5 — Phase 5 | Deploy goal modules. No separate flag is listed for this phase. | Per-goal fallback rate; missing-evidence interview/exam nodes; queued/failed nodes; search.list calls per roadmap. |
| 6 — Phase 6 | Set server `ASYNC_ROADMAP=true`; smoke-test endpoints; then set frontend `VITE_ASYNC_ROADMAP=true`. | Time to skeleton, node completion latency, resume after refresh, poll/SSE errors, stuck queued nodes, and per-node cache/search/quota metrics. |
| Optional | Test `YT_COMBINED_SEARCH=true` and `ENABLE_TRUSTED_CHANNELS=true` separately, one at a time. | Compare search.list calls and selected-resource coverage before and after; revert if coverage degrades or calls rise. |
| Compliance workers | Set `ENABLE_CURATION_COMPLIANCE_WORKERS=true` only after verifying the worker schedule and retention behavior. | Refresh success/failure, stale resources, persisted statistics, and quota use. |
| Private review bypass | Keep `AI_PRIVATE_COURSES_SKIP_REVIEW=false` unless a separate approval confirms the private-only behavior. | Confirm public/catalog courses remain subject to normal review. |

### Staging

1. Deploy the code with all feature flags off and verify that normal search and the existing synchronous Build with AI path still work.
2. Repeat steps 1–6 above in the same order, with a small internal tester cohort. Change one flag group at a time; do not enable all flags in a single deployment.
3. Enable the frontend flag only after its matching server endpoint is deployed and verified.
4. Hold each stage long enough to capture representative traffic and compare with the baseline. If traffic is too low to establish a reliable rate, label the metric inconclusive instead of treating zero events as success.
5. Roll back the last flag change first if quota, fallback rate, latency, node failure, or user-visible behavior regresses. Keep the legacy selector available through the observation window.


## Rollback behavior and data preservation

The rollback controls change application behavior; they are not data migrations and must not be used as a database cleanup mechanism.

- `USE_CURATION_ENGINE_FOR_AI=false` returns Build with AI node selection to the legacy selector. It does not delete curated resources or course records.
- `YT_COMBINED_SEARCH=false` restores video-only YouTube search requests. Existing course resources and cache entries are not deleted by this switch.
- `ENABLE_TRUSTED_CHANNELS=false` disables trusted-channel expansion. It does not remove stored channel/resource metadata.
- `ENABLE_CURATION_COMPLIANCE_WORKERS=false` stops the nightly refresh/prior-rebuild job from starting. Previously persisted resource and skill-prior records remain in storage.
- `INTENT_V2=false` and `VITE_INTENT_V2=false` restore the legacy intent/question experience; coordinate the frontend rebuild with the server deployment.
- `ASYNC_ROADMAP=false` removes the async draft/events/cancel/poll routes and restores the synchronous `POST /api/ai/roadmap` handler. Existing draft/course documents are not deleted by route registration.

### Safe rollback order for async roadmap

1. Stop new async client submissions first: set `VITE_ASYNC_ROADMAP=false` and deploy the frontend. Verify the client uses the synchronous roadmap request.
2. Stop admitting new async drafts: set `ASYNC_ROADMAP=false` and deploy the backend. Confirm `POST /api/ai/roadmap` responds through the synchronous handler.
3. Before restarting or scaling down the old backend process, inspect active `RoadmapDraft` records in `queued` or `building` state and allow active builds to drain where possible.
4. If a process exits while holding an admission lease, the lease expires after the configured two-minute lease window. `recoverExpiredRoadmapAdmissions` marks the matching queued/building draft failed with `ROADMAP_ADMISSION_LEASE_EXPIRED`, clears its draft result/reference, and archives any partially generated course as private/unpublished. It does not delete the `Course` or `RoadmapDraft` document. The learner must retry the failed build.
5. Verify completed courses remain available, partial courses are archived/private, failed drafts are retryable, and no duplicate active lease remains. Do not manually delete draft/course records as part of rollback.

### Rollback limitations

- This is not a zero-interruption rollback for in-flight async builds. A process restart can cause queued/building drafts to fail safely; it does not transparently resume generation.
- The frontend and backend flags are separate build/runtime settings. A mismatched deployment can cause async API 404s or a client/server flow mismatch; follow the order above.
- Feature-flag changes require a deployment/restart to take effect because server flags are read from environment at startup.
- `AI_PRIVATE_COURSES_SKIP_REVIEW` is not approved as a routine rollout toggle. Keep it off until its exact consumer and private-only behavior are separately verified.

## Metrics and alert conditions

Track these for every stage, ideally by roadmap and node:

- **Quota state:** `ok`, `degraded`, `exhausted`; current units / budget / reset day / storage source.
- **YouTube search cost:** `search.list` calls and estimated quota units per roadmap. Search costs 100 units; other YouTube API calls cost 1 unit.
- **Node cache hit rate:** cache-hit nodes divided by all node resolutions, excluding requests that did not attempt node resolution.
- **Fallback rate:** legacy selector fallback, structured topic fallback, and failed/low-confidence nodes tracked separately. Do not merge these into one metric.
- **Build quality and reliability:** time to skeleton, completion time, queued nodes older than the expected retry interval, and refresh-resume success.
- **Gemini:** timeout/error rate and structured fallback rate; do not log prompts containing user-provided private data.

Pause rollout if the quota service reaches `exhausted`, search.list calls per roadmap increase materially from baseline without a coverage improvement, the node-cache hit rate regresses for repeated skills, or fallback/failed-node rates rise beyond the agreed baseline tolerance. Set explicit numeric alert thresholds from staging observations rather than inventing universal limits.

## Dead code candidates after two stable weeks

Do **not** delete these during Phase 8. After at least two stable weeks of staging/production metrics, tests, and rollback review, assess each item and remove only if its usage is demonstrably zero:

1. `searchBestYouTubeCourse` and its private scoring/search helpers in `server/src/services/youtube.service.js` — only if shared-engine coverage is complete and legacy fallback rate is zero.
2. The legacy AI-selection fallback branch in `attachYouTubeResources` — only if the fallback metric remains zero for two weeks.
3. The old fixed-form Build with AI UI path in `src/pages/Courses.tsx` — only if `INTENT_V2` is fully rolled out and no supported environment requires the old path.
4. The synchronous roadmap generation path in `server/src/controllers/ai.controller.js` and its route — only after async rollout is stable and rollback is no longer required.
5. Any temporary comparison fixtures/adapters introduced only for rollout — only after results have been recorded and CI coverage retained elsewhere.

These are candidates, not an assertion that every listed symbol is unused. Confirm references with repository search before any later deletion.

## Selector comparison

Run the mock harness:

```sh
node scripts/compareSelectors.js
```

The mock harness injects deterministic provider and dependency fixtures while retaining the real legacy selector and the real shared curation/ranking pipeline. It does not contact YouTube or Gemini. The report sets `comparisonValid: true` only when all ten fixed skills receive a selection from both selectors; otherwise inspect the row-level results and treat the run as inconclusive. `selectorAgreement` reports matching selected fixture IDs, not a claim that either selector is objectively correct.

Optional live mode is explicitly capped at five skills and makes real provider calls:

```sh
node scripts/compareSelectors.js --live
```

Do not run `--live` in CI or as part of this rollout change. Capture quota state before and after if an operator deliberately runs it in a controlled environment.

# ADR-001 — Normal Search is local-first and Gemini-free

**Status:** Accepted — product-owner approval recorded 2026-11-15  
**Scope:** Learner-facing Normal Course Search on the Courses page  
**Related requirements:** D-01, D-02, D-03; NS-01 through NS-08  
**Tracking:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)

## 1. Decision

Normal Search is a deterministic, local-first discovery flow. The catalog is authoritative. External YouTube discovery is a fallback, not a supplementary section.

The approved request order is:

1. Search eligible published BuddyForStudy courses using the requested query and filters.
2. Only if no direct course matches exist, search eligible published modules and their approved/published standalone course representations.
3. Only if neither local search path produces an eligible public result, invoke deterministic YouTube discovery.
4. Keep Build with AI as a separate, explicit Gemini-powered journey.

The Normal Search call graph must make **zero Gemini model-generation calls**, whether direct or indirect. This includes topic-syllabus generation, metadata judging and any legacy endpoint accidentally invoked by the Courses page.

This decision preserves deterministic candidate retrieval and factual eligibility gates only where permitted by the applicable YouTube API Services policies. D-01 defines the Gemini boundary; it does not grant permission to derive or persist custom ranking/quality metrics from YouTube API Data. ADR-004, ADR-005 and the Learning Resource Candidate and Selection Contract are controlling: until the precise educational-resource curation use case and method are cleared, do not use API-derived views/likes/subscriber statistics, percentiles, aggregate scores, fit/coverage/quality/confidence scores or custom ranked ordering. Normal Search may present factual provider metadata and apply policy-cleared eligibility checks, but must not represent an unapproved derived ranking as a verified recommendation. Any stage that currently calls Gemini must be removed or replaced with a policy-cleared deterministic path. A heuristic or generic fallback outline is not an authoritative syllabus and must not be presented as verified curriculum coverage.

## 2. Why this boundary

The approved product decisions separate two different user intents:

- Normal Search asks, “What suitable learning is already available for this topic?”
- Build with AI asks, “Create a personalized learning path for my goal, level and schedule.”

Calling Gemini or YouTube before checking the catalog adds unnecessary latency, provider dependency and quota usage to a request that may already have a suitable local answer. Supplementary YouTube cards also compete with the authoritative BuddyForStudy catalog.

## 3. Current implementation evidence

The source audit of `main` at `eb2f4af7ea85723d1f4940e61ffcb7962319e494` found:

- `client/src/pages/Courses.tsx` calls `GET /api/courses` for normal catalog search. It has a legacy `GET /api/discovery/search` playlist lookup when the returned discovery payload omits `curatedResources`.
- `server/src/services/course.service.js:listPublished` searches direct course fields and then eligible module-derived standalone courses, but currently calls `curateNormalSearch` unconditionally after the local lookup.
- The current service sets `hasLocalResults` from the current page's returned rows. Fallback eligibility must instead use the total eligible local match count, independent of the requested page.
- `server/src/services/courseCurationDecisionEngine.service.js` has Gemini-backed paths in `getTopicSyllabus` and `evaluateCandidatesWithMetadataRubric`. Both are reachable through `curateNormalSearch`.
- `GET /api/discovery/search` uses deterministic playlist search. The distinct `GET /api/discovery/course-search` calls `searchCourseBySkills`, which uses a Gemini-generated search specification. The Courses page's normal-search handler currently calls neither `/api/discovery/course-search` nor its AI course-generation flow; that separation must remain explicit.

These are implementation gaps, not claims that the approved architecture has already shipped.

## 4. Target component responsibilities

| Component | Responsibility | Prohibited responsibility |
|---|---|---|
| `Courses.tsx` | Submit catalog filters; render returned local courses; render YouTube fallback only when the API returns fallback mode | Launching a second, hidden playlist search after the primary search has already completed |
| `course.controller.js:list` | Validate/normalize request parameters, enforce existing optional-auth entitlement middleware, serialize the service result | Selecting external resources or calling Gemini |
| `course.service.js:listPublished` | Orchestrate direct local search → eligible module/standalone search → external fallback | Calling Gemini; requesting YouTube before local eligibility is known |
| `courseCurationDecisionEngine.service.js:curateNormalSearch` | Deterministic provider candidate retrieval and policy-permitted eligibility checks/presentation | Any Gemini call or unapproved API-derived score, metric, percentile or ranking |
| `youtube.service.js` and `youtubeGateway.js` | Retrieve candidate metadata, apply provider safeguards and quota accounting | Creating public BuddyForStudy courses as a side effect of search |
| Build with AI intent/roadmap services | Own Gemini calls, schema validation, personalization and roadmap generation | Being invoked implicitly by Normal Search |

The curation code may retain shared pure utilities only where they perform policy-permitted deterministic transformations or factual eligibility checks. Do not treat a pure function as policy-exempt merely because it is deterministic: API-derived score/rank outputs remain blocked pending ADR-004/ADR-005 clearance. Provider orchestration and policy must remain flow-specific. This ADR does not require one universal orchestrator for Normal Search and Build with AI.

## 5. Normal Search decision tree

### Stage A — direct published course matches

Use the existing publication filter and query fields (title, description, category and learning outcomes), plus category/level filters.

Calculate the **total** eligible direct-course count before pagination. If it is greater than zero:

- Return the requested page of direct course results.
- Do not search modules.
- Do not call YouTube.
- Do not return a `discovery` payload.

Direct course matches have precedence over module-derived standalone courses.

### Stage B — eligible published module matches

Only when the total direct-course count is zero:

- Search modules and lessons within eligible published, non-deleted, non-archived parent courses.
- Create or reuse one standalone course per source course/module identity, following D-03.
- Deduplicate by source course/module identity.
- Return only standalone records that pass the configured approval, readiness and public publication checks.
- Calculate the total eligible standalone result count independently of pagination.

Pending, rejected, draft, private or otherwise non-public standalone records do not count as public local search results and must not leak into the response. A matching source module alone must not bypass the standalone approval/publication policy.

If the total eligible standalone result count is greater than zero, return its requested page and do not call YouTube.

### Stage C — external YouTube fallback

Only when both Stage A and Stage B have zero eligible public results:

- Invoke `curateNormalSearch` in deterministic mode.
- Use the existing candidate gateway and factual eligibility gates that are confirmed policy-permitted.
- Until YouTube policy clearance is documented, do not derive or persist custom scores, quality/coverage metrics, percentiles, engagement features or a custom ranked order from API Data; present eligible candidates with factual metadata and clear source attribution.
- Do not invoke Gemini for a syllabus, query plan, metadata judge or any other reason.
- Return recommendations with their original provider identity and URL. Do not automatically persist them as public BuddyForStudy courses.
- Apply the existing YouTube quota guard and bounded provider retry policy.

If YouTube is unavailable, quota is exhausted or quota storage refuses the request, preserve the successful catalog response and return an empty fallback list with a safe, non-blocking error message. Do not fall back to Gemini.

### Pagination invariant

The local-result decision is based on the full eligible result count, never `localCourses.length` for the requested page.

For example, if 73 direct courses match and the client requests page 3, an empty page 3 must not cause the system to search modules or YouTube. It is still a direct-course result set with total 73.

## 6. Sequence — Normal Search

```mermaid
sequenceDiagram
    actor Learner
    participant UI as Courses page
    participant API as GET /api/courses
    participant Service as course.service.listPublished
    participant DB as MongoDB catalog
    participant Curator as deterministic curation engine
    participant YT as YouTube gateway and quota guard

    Learner->>UI: Search topic and filters
    UI->>API: GET /api/courses?q=...&page=...&limit=...
    API->>Service: listPublished(criteria)
    Service->>DB: Count and fetch eligible direct course matches
    alt Direct course total > 0
        DB-->>Service: Direct course page + total
        Service-->>API: Local courses + pagination; no discovery
    else No direct course matches
        Service->>DB: Find/reuse eligible module standalone courses
        DB-->>Service: Eligible standalone page + total
        alt Eligible module total > 0
            Service-->>API: Standalone courses + pagination; no discovery
        else No eligible local results
            Service->>Curator: curateNormalSearch(query, deterministic policy)
            Curator->>YT: Search candidates through quota-guarded gateway
            YT-->>Curator: Candidate metadata or provider/quota error
            Curator-->>Service: Ranked metadata-only recommendations
            Service-->>API: Empty local page + YouTube fallback payload
        end
    end
    API-->>UI: 200 response
    UI-->>Learner: Local courses OR fallback recommendations
```

## 7. Separate Build with AI boundary

Build with AI remains an explicit learner action. Its existing intent and roadmap APIs (including `POST /api/intent/parse` and `POST /api/ai/roadmap`) own Gemini-backed parsing/generation, structured output validation, skill graph construction and personalized roadmap creation.

Normal Search must not call `/api/discovery/course-search`, `searchCourseBySkills`, or any AI-assisted course assembly route as an automatic fallback. Any future product action that invokes those endpoints must be visibly separate and have its own entitlement, cost and UX contract.

## 8. API contract — `GET /api/courses`

### Request

Existing route and query parameters are retained:

| Parameter | Target contract |
|---|---|
| `q` | Optional search string; when present, trim and validate length (target: 2–200 characters) |
| `page` | Positive integer; default 1 |
| `limit` | Integer 1–50; default 20 |
| `category` | Optional catalog category filter |
| `level` | Optional supported course level |
| `sort` | `recent` or `popular`; recent remains the default |

The route remains public for guests and retains the existing optional-auth `course_search` entitlement check for signed-in learners. This ADR does not change entitlement policy.

### Response when a local course or eligible standalone module course exists

Return the normal success envelope with `courses` and complete `pagination` fields. Omit `discovery` entirely. The frontend must clear any fallback from a previous search when this response arrives.

```json
{
  "success": true,
  "message": "Courses retrieved successfully",
  "courses": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

The empty array above is illustrative of the response schema; a real local-match response contains the requested course page and a positive total.

### Response when no eligible local match exists

Return the same success envelope and include one fallback payload:

```json
{
  "success": true,
  "message": "Courses retrieved successfully",
  "courses": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 },
  "discovery": {
    "mode": "youtube_fallback",
    "query": "requested topic",
    "curatedResources": [],
    "curationMeta": {
      "evidenceMode": "metadata_only",
      "searchCalls": 0,
      "quotaUnits": 0
    },
    "youtubeError": ""
  }
}
```

This is a shape example, not literal runtime data. Runtime metadata must report actual provider calls and quota units. A failed/unavailable provider returns an empty `curatedResources` array and a safe `youtubeError`, while the API remains a successful catalog response.

### Error behavior

- Invalid query/pagination/filter input: use the established validation response (target HTTP 400).
- Optional-auth or entitlement denial: preserve the existing middleware response.
- Catalog database failure: return the established server error; do not disguise it as an empty catalog or a YouTube outage.
- YouTube configuration, provider, quota-budget or quota-storage failure: keep the catalog response usable, return zero external resources and a non-blocking fallback error.
- No failure path may invoke Gemini.

## 9. Resource evidence contract

External search cards must remain explicitly labelled as YouTube recommendations, not BuddyForStudy courses.

Preserve provider-sourced identity and metadata, including the available resource type, provider ID, title, channel/source, original URL, thumbnail, actual runtime and candidate metadata. Unknown values remain unknown; do not infer language, duration, level or syllabus coverage when the provider did not supply evidence.

Title, description, tags, playlist structure, chapters, language tags, duration and engagement fields are provider metadata, not proof of instructional quality or correctness. Their availability does not itself authorize derived scoring or ranking. Until the exact method is cleared under ADR-004/ADR-005, do not derive or persist custom ranking, relevance, quality, coverage, freshness, engagement or confidence metrics from YouTube API Data; do not request or use views/likes/subscriber statistics for ranking. Preserve only policy-permitted factual metadata, hard eligibility outcomes and first-party learner choice/feedback, separately labelled.

Use the deterministic heuristic scorer and hard gates. Gemini metadata judging is disabled for this flow. Any displayed explanation must state metadata-derived evidence accurately and avoid calling the fallback outline an official or verified syllabus.

## 10. Cache, quota and operational rules

- Always re-run the local catalog eligibility decision before using a cached external fallback. A newly published local course must suppress previously cached YouTube recommendations.
- Keep candidate/result caches versioned by normalized query and all ranking-affecting filters/preferences (including language and policy version). A policy/engine change must invalidate incompatible cached ranking outputs.
- Retain a short negative-cache interval for empty external results; do not let negative cache suppress a fresh local catalog lookup.
- Use the existing YouTube quota ledger/gateway for reservation, refusal and provider accounting. Verify provider quota units and production limits during the deferred pre-launch checks; do not infer Google's provider quota from an application-side counter.
- Record request ID, selected branch (direct/module/fallback), eligible local count, candidate/result count, provider search calls, internal quota usage, cache outcome, latency and sanitized provider error category.
- A local result should normally require zero YouTube calls and zero Gemini calls. A fallback result can require YouTube calls but must always require zero Gemini calls.
- Do not log API keys, bearer/cookie tokens, raw learner profile fields or sensitive user data.

## 11. Regression and acceptance matrix

| Scenario | Expected outcome | Provider calls |
|---|---|---|
| Direct published course matches | Return direct course page; omit discovery | Gemini 0; YouTube 0 |
| Multiple direct matches, requested page has no rows | Preserve direct total; do not search modules or YouTube | Gemini 0; YouTube 0 |
| No direct course, eligible published module standalone exists | Return standalone course page | Gemini 0; YouTube 0 |
| Module-derived standalone is pending/unpublished/private | Do not expose it; continue to fallback if no other eligible local result exists | Gemini 0; YouTube allowed |
| No eligible local course or standalone result | Return YouTube fallback payload | Gemini 0; YouTube quota-guarded |
| YouTube quota exhausted/provider unavailable | Return empty fallback payload with safe error; preserve catalog response | Gemini 0; no unguarded retry |
| Gemini key configured and local result exists | Normal Search must not use Gemini | Gemini 0; YouTube 0 |
| Gemini key configured and fallback is needed | Policy-cleared deterministic candidate presentation completes without custom API-derived ranking | Gemini 0; YouTube quota-guarded |
| New local course published after fallback cache was created | Local result takes precedence over cached YouTube result | Gemini 0; YouTube 0 |
| Build with AI explicitly launched | Dedicated Gemini workflow remains available under its own auth/entitlement rules | Separate Build with AI contract |

## 12. Implementation sequence

1. Add unit-level provider spies/assertions proving `curateNormalSearch` cannot call Gemini when `GEMINI_API_KEY` is configured; replace both Gemini stages with deterministic-only behavior for Normal Search.
2. Refactor `listPublished` so it computes full local totals, applies direct-course precedence, then eligible module/standalone precedence, and only invokes YouTube after both totals are zero.
3. Make local result pagination independent from fallback eligibility. Add regression coverage for later pages and empty requested pages with non-zero total local matches.
4. Standardize the fallback response to `mode: "youtube_fallback"`; remove the Courses page's automatic second playlist lookup so one API response owns fallback state and provider calls.
5. Add integration/browser tests for local-vs-fallback behavior, stale fallback clearing, provider/quota failure, and Gemini/YouTube call counts.
6. Run the release gates on a dedicated implementation branch. Do not modify `main`, merge a PR or change production flags as part of this ADR.

## 13. Consequences and remaining work

**Benefits:** local catalog authority, predictable latency, lower unnecessary provider usage, one fallback decision point, explicit Gemini boundary and testable zero-provider-call invariants.

**Trade-offs:** until a policy-permitted selection method is approved, external fallback may be a factual provider-candidate presentation with hard eligibility checks rather than a custom ranked recommendation list. No claim of instructional quality or curriculum coverage is established by metadata. Any later selection/ranking method requires the ADR-004/ADR-005 policy gate and the independent human-review process; the benchmark protocol does not itself authorize API-derived metrics.

This ADR settles the Normal Search orchestration boundary and fallback contract. It does not settle Build with AI's full JSON schemas, canonical skill registry, durable queue technology, global caching policy, YouTube legal data-retention policy, security threat model, benchmark thresholds or production rollout. Those remain open Task 04–08 items.

# Normal Search — Implementation Specification and Regression Test Plan

**Specification version:** 1.0  
**Prepared:** 2026-11-16  
**Working branch:** docs/build-with-ai-engineering-readiness  
**Status:** Implementation preparation; no code changes authorized  
**Accepted architecture:** [ADR-001 — Normal Search is local-first and Gemini-free](ADR-001-normal-search-local-first-gemini-free.md)  
**Product decisions:** D-01, D-02 and D-03  
**Related controls:** ADR-004, ADR-005, Learning Resource Candidate and Selection Contract  
**Tracker:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Implementation backlog:** [P0-01, P0-06 and P0-07](../BUILD_WITH_AI_IMPLEMENTATION_BACKLOG.md)  
**Decision register:** [DEC-YT-01 and DEC-RELEASE-01](../BUILD_WITH_AI_DECISION_RESOLUTION_REGISTER.md)

---

## 1. Purpose and authorization boundary

This specification converts accepted Normal Search decisions D-01 through D-03 and ADR-001 into a concrete implementation and test plan.

It is intended to be used when a separate implementation phase is authorized. It does not authorize product-code changes, a YouTube provider call, a policy exception, deployment, feature-flag changes, merge or production rollout.

### Approved behavior

- **D-01:** Normal Search must make zero direct or indirect Gemini model-generation calls.
- **D-02:** Normal Search is local-first. YouTube is a fallback only after no suitable eligible local course and no suitable eligible module-derived standalone course exist.
- **D-03:** when no direct course match exists, eligible published modules may be represented by deduplicated standalone BuddyForStudy courses. Direct course matches retain precedence.
- Build with AI remains a separate, explicit learner action. Its Gemini-based intent and curriculum generation must not be triggered by pressing Normal Search.

### Non-negotiable gates

1. YouTube fallback implementation and activation must comply with DEC-YT-01. Until the exact remaining discovery method is reviewed and cleared, do not enable an API-derived ranking/quality pipeline or assume that a deterministic heuristic is policy-permitted.
2. All product-code work still requires DEC-RELEASE-01 implementation authorization and a separate branch from the then-current main.
3. D-07 privacy and publication rules remain in force: only eligible public content may enter Normal Search; private learner courses must not be discoverable.
4. Do not treat test-branch history or the historical Search Flow v2 checklist as proof of current-main implementation.

---

## 2. Source snapshot reviewed

The files below were fetched from docs/build-with-ai-engineering-readiness on 2026-11-16. Blob identifiers are recorded so the implementation team can re-check the exact baseline before coding. The readiness branch is an audit snapshot; this review does not claim that the same blobs are currently deployed or that current main has been freshly tested.

| Source | Blob SHA | Relevant finding |
|---|---|---|
| docs/architecture/ADR-001-normal-search-local-first-gemini-free.md | 42c5c01338c1a5349833185fa310346c4969a617 | Accepted local-first sequence, fallback-only contract and zero-Gemini boundary |
| server/src/routes/course.routes.js | 8accb43eeb682e26a3db476dd965477955b65f59 | GET / uses optional auth and course_search entitlement middleware |
| server/src/controllers/course.controller.js | 97aaa2d929f4177511560bcf799bb3202438083c | list controller normalizes page/limit and delegates to listPublished |
| server/src/services/course.service.js | 85c5a99babc65ab39d25b5bb7c5aa0e1cf194804 | Direct search, module standalone materialization and unconditional curation call |
| server/src/services/courseCurationDecisionEngine.service.js | d2227aace5781761d431b50e6151389f84527269 | Gemini syllabus and metadata-judge paths are reachable from curateNormalSearch |
| server/src/services/nodeCuration.service.js | 486ed321add80f62a79dca65f6eaee3ddf9dcd64 | Build with AI node curation imports curateNormalSearch as its selector |
| server/src/models/Course.js | eec1d8716272c184a8ae03873c389f72452680b2 | Course visibility, generated-module identity and current compound index definitions |
| client/src/pages/Courses.tsx | ced1f443ef652bb98fe99332202d8734e4401605 | Courses page currently fetches catalog pages in a client loop and handles legacy discovery modes |
| server/test/courseCurationDecisionEngine.test.js | 731e12bd797adbda023472901584d9011599c803 | Existing curation tests include ranking, score and provider-metadata assumptions |

### 2.1 Current request path

1. Courses page submits GET /api/courses with query, filters, sort, page and limit.
2. Course route applies optional authentication and the signed-in learner’s course_search entitlement requirement.
3. Controller delegates to course.service.listPublished.
4. For a non-empty query, listPublished fetches direct course candidates, slices the requested page, and calls getStandaloneModuleCourses only when the current direct page has no rows.
5. listPublished currently invokes curateNormalSearch after the local lookup whether or not local courses exist.
6. curateNormalSearch can call getTopicSyllabus and evaluateCandidatesWithMetadataRubric, both of which call Gemini when configured.
7. The service returns youtube_supplementary, including when local courses exist.
8. The Courses page accepts both youtube_fallback and youtube_supplementary. If curatedResources is absent, it makes a second GET /api/discovery/search request to obtain playlists.

### 2.2 Source-mapped implementation gaps

| ID | Current source behavior | Required correction |
|---|---|---|
| NSG-01 | Local-result eligibility is inferred from the rows returned for the requested page. An empty requested page can fall through to module lookup and external curation even when the complete direct-course result set is non-empty. | Use full eligible totals before pagination to choose the branch. |
| NSG-02 | YouTube curation is invoked for every non-empty search after the local lookup. | Invoke fallback only when the full direct-course total and full eligible module-standalone total are both zero. |
| NSG-03 | The curation engine can generate a Gemini syllabus and invoke a Gemini metadata judge. | Normal Search must use a separate Gemini-free path across its entire call graph. |
| NSG-04 | Curation creates ranked/scored result objects using signals derived from YouTube API Data. | Do not use or persist those metrics/rankings until the exact method is cleared under DEC-YT-01. |
| NSG-05 | The Courses page repeatedly calls the API in batches of 50 until it reaches the end of the catalog, and may receive fallback metadata on multiple pages. | Align the UI with the API page contract; one API request per user-visible page and one fallback decision for the empty-local result set. |
| NSG-06 | The client handles the legacy supplementary mode and can make a second playlist lookup. | Remove supplementary behavior and the hidden second discovery request; one API response owns fallback state. |
| NSG-07 | Direct and module-derived course filters do not explicitly require visibility=public. | Add an explicit public-visibility condition to all Normal Search local queries as defense in depth. |
| NSG-08 | Module matching includes lesson video title, description, channel title and playlist title, which can be YouTube API Data. | Until DEC-YT-01 clears those fields for this use, match module discovery using first-party course/module/lesson text only. |
| NSG-09 | The Course schema has a compound index on generation.mode, generation.sourceCourse and generation.sourceModuleId, but the inspected index definition is not marked unique. | Audit existing duplicates and approve a safe unique partial index/migration or another atomic deduplication strategy before relying on concurrent materialization. |
| NSG-10 | Module materialization copies lesson resource/video metadata into a standalone course. | Preserve provider snapshot provenance and retention/deletion linkage; do not create an untracked second copy of YouTube API Data. |
| NSG-11 | The client exposes a title A–Z sort, but the controller currently maps only popular specially and otherwise sends recent; search results are sorted by createdAt in the service. | Preserve the visible title sort when moving pagination to the server; add a deterministic title sort with a stable tie-break. |
| NSG-12 | Module matching and direct matching use different text-normalization semantics. | Document and test each supported search rule; do not silently change match semantics as part of the routing fix. |

---

## 3. Target architecture and component responsibilities

| Component | Target responsibility | Must not do |
|---|---|---|
| Courses page | Submit one request for the current page and render only the response branch returned by the API | Fetch every page in a loop; independently fetch playlists; start AI discovery |
| course.routes.js | Preserve current route, optional-auth behavior and entitlement gate | Weaken authentication or course_search entitlement |
| course.controller.js | Validate query, page, limit, category, level and sort; call service; return stable response envelope | Call YouTube, Gemini or module creation logic directly |
| course.service.js | Own direct course → eligible module standalone → optional external fallback orchestration | Call Gemini; call external provider before both local totals are known |
| Module materialization service/helper | Create or reuse one eligible standalone course per source course/module identity under the approved D-03/D-07 policy | Publish pending content, leak private sources or duplicate a module under concurrent requests |
| Normal Search provider adapter | Retrieve provider candidates only when the DEC-YT-01-approved fallback capability is enabled; enforce allowed fields and factual eligibility gates | Use Gemini, use unapproved scoring/ranking, or create public Course documents as a side effect |
| Build with AI services | Retain the explicit Gemini intent/curriculum-generation workflow behind its own user action and entitlement checks | Be invoked as a fallback by Normal Search |

### 3.1 Curation-engine separation

The current nodeCuration service imports curateNormalSearch as its selector, while curateNormalSearch itself contains Gemini-backed syllabus and metadata-evaluation stages.

Implementation must separate flow orchestration rather than merely deleting GoogleGenAI from a shared module and unintentionally breaking Build with AI. The desired boundary is:

- A Normal Search entrypoint that is provider-policy-aware and has a testable zero-Gemini guarantee.
- A Build with AI resource-node entrypoint whose inputs are the explicit skill/query/profile/syllabus from the roadmap flow.
- Shared helpers only for provider transport, data normalization and factual eligibility checks that are permitted by DEC-YT-01.
- No custom API-derived metrics or ranking in either workflow until the provider-policy decision explicitly permits the exact method. Gemini-generated scores based on YouTube API Data are still derived outputs; using Gemini does not bypass the policy.
- Build with AI's independent Gemini curriculum/intent generation remains separate and must not be removed by the Normal Search refactor.

Do not consider the Normal Search Gemini gate satisfied merely because the normal controller does not import GoogleGenAI. Tests must observe the complete transitive call graph.

---

## 4. Target request and decision algorithm

### 4.1 Request normalization

Preserve the existing GET /api/courses route and signed-in learner entitlement behavior.

| Field | Target rule |
|---|---|
| q | Optional. Empty/whitespace means normal catalog browsing. Non-empty search target is 2–200 trimmed characters, following ADR-001. |
| page | Positive integer; default 1. Reject invalid or unsafe values rather than silently selecting unrelated data. |
| limit | Positive integer; API maximum 50. The Courses page should request 12 to preserve its current 12-card page size. |
| category | Exact supported catalog category filter when present. |
| level | Beginner, Intermediate or Advanced when present. |
| sort | recent, popular or title. Preserve the existing visible A–Z option. |
| authentication | Guest search remains supported; signed-in users retain course_search entitlement enforcement. |

The implementation must confirm whether the existing API response helper returns validation errors in the standard project envelope and retain that convention. Do not change the entitlement or guest-access policy in this workstream.

### 4.2 Eligibility filter

Every local search branch must use a shared eligible-public filter. It should require:

- isPublished=true;
- deletedAt=null;
- status is not archived;
- visibility is explicitly public;
- the existing publication approval filter passes;
- category and level filters, where supplied.

Learner-private courses and user-specific generated courses must never count as public local matches, suppress the external fallback for another user, or appear in a guest response.

The direct query should exclude module-generated standalone records so that the direct course branch and module-derived branch have unambiguous precedence.

### 4.3 Branch A — direct public BuddyForStudy courses

Search first-party catalog fields already used by direct search: title, description, category and learning outcomes.

Required algorithm:

1. Normalize query using the explicitly approved direct-search semantics.
2. Build the eligible-public filter plus direct text query and supplied filters.
3. Compute the complete eligible direct total independently from page retrieval.
4. If direct total is greater than zero, fetch only the requested page with deterministic sort and return it.
5. Do not inspect modules, invoke YouTube, return discovery metadata or call Gemini.

The full total determines the branch. The rows in the requested page do not.

### 4.4 Branch B — module-derived standalone courses

Only when direct total is exactly zero:

1. Find eligible public, published, non-deleted, non-archived parent courses that satisfy the category and level filters.
2. Match first-party authored module and lesson fields: module title/description and lesson title/description. Do not include provider-derived playlist/video metadata in this match until the policy decision explicitly clears it.
3. For each eligible source module, identify the source by the pair sourceCourseId + sourceModuleId.
4. Create or reuse one standalone course for that source identity under the configured D-07 manual/automatic approval mode.
5. Return only standalone records that are public, published, non-archived, not deleted and approved under the existing publication filter.
6. Compute the complete eligible standalone total independently of pagination.
7. If the standalone total is greater than zero, return the requested page and do not invoke YouTube or Gemini.

#### D-07 approval semantics

- Manual remains the default when no admin setting is present or the setting is not automatic.
- In manual mode, a newly materialized standalone course remains pending/unpublished and is not returned as an eligible public result.
- In automatic mode, approval may be recorded automatically, but publication still depends on course-readiness checks. A readiness failure remains unpublished.
- A pending/rejected/unpublished/private standalone record must never be returned as a result.
- A private learner course must never be changed to public or reused as a public standalone module result.

#### Deduplication and concurrency

The current schema has a compound index over generated module identity, but the inspected index is not unique. Before implementation:
- count existing duplicate sourceCourseId/sourceModuleId pairs;
- define a deterministic duplicate reconciliation rule that preserves enrollments/progress and references;
- review a unique partial compound index for generation.mode=module and valid non-null source identity fields, or an equivalent atomic design;
- validate the proposed index against existing null/missing legacy records and the actual MongoDB deployment;
- add a concurrent-request test proving two searches cannot create two standalone courses for the same source module.

Do not add a unique index blindly without a duplicate audit and migration plan.

### 4.5 Branch C — YouTube fallback

Only when both complete local totals are zero may the service consider external fallback.

**Policy gate:** DEC-YT-01 must explicitly clear the exact fallback method and fields. Until then, the fallback must remain disabled. A deterministic algorithm is not automatically policy-permitted merely because it contains no Gemini call.

When the approved capability is enabled:

- Invoke the Normal Search provider adapter once for the logical request.
- Use only the data fields and transformations included in the accepted DEC-YT-01 scope.
- Apply only policy-cleared factual eligibility rules.
- Do not use views, likes, comments, subscriber counts, API-derived percentiles, scores, engagement, quality, fit, coverage, freshness or custom ranked ordering unless explicitly permitted in writing for the exact method.
- Do not call Gemini for syllabus creation, query expansion, metadata judging or any other step.
- Keep provider resources distinct from first-party BuddyForStudy courses; do not automatically create/publish a Course document from the search result.
- Preserve original provider identity and link, required attribution, player rules and Made For Kids controls.
- Use the YouTube quota gateway and bounded error/retry behavior.

If DEC-YT-01 does not clear any usable fallback behavior, return the empty local catalog result without making a YouTube request. The UI should show the local no-match state and a separate explicit Build with AI action; it must not imply that a YouTube search occurred.

### 4.6 Failure behavior

| Failure | Target response |
|---|---|
| Invalid query, page, limit or sort | Standard validation response; no database/provider work beyond validation |
| Catalog database failure | Established server error; do not disguise as no matches |
| Module materialization failure | Preserve already valid direct/local response where possible; otherwise return a safe catalog error; never continue as if the module branch succeeded |
| YouTube transient error | Keep the catalog response successful; empty fallback resources and safe user message |
| YouTube transient 429 | Bounded retry according to the provider contract; no Gemini fallback |
| YouTube daily quota exhausted | Empty fallback resources; report safe quota-limited state; do not retry-loop |
| Quota-store unavailable | Fail closed for provider admission; no unaccounted request; preserve empty local response |
| Gemini not configured | Normal Search is unaffected; it must not depend on Gemini availability |
| Gemini configured | Zero Normal Search Gemini calls in every branch |

Never convert a catalog database failure into a successful empty search or use Gemini as a recovery provider.

---

## 5. API response contract

### 5.1 Local course result

When a direct or eligible standalone module result exists, return the ordinary course-list success response with:
- courses for the requested page;
- complete pagination fields (page, limit, total and pages);
- no discovery property.

The response must not return a supplementary YouTube section when a local result exists.

### 5.2 No local match and fallback disabled

When both local totals are zero and DEC-YT-01 has not cleared an external method:
- return an empty courses array;
- return pagination with total=0 and pages=0;
- omit discovery because no external provider search occurred;
- let the client show the local no-match state and separate Build with AI action.

Do not use a fake youtube_fallback payload to imply that YouTube was called.

### 5.3 No local match and approved fallback enabled

Return the normal success envelope with courses=[] and pagination total=0, plus exactly one discovery object:
- mode = youtube_fallback;
- query = normalized user query;
- curatedResources = policy-permitted provider results;
- curationMeta = approved factual evidence mode and accurate provider/quota telemetry only;
- youtubeError = safe, non-sensitive error category/message or empty string.

Do not return youtube_supplementary. Do not return provider-derived scores or ranked labels unless the approved policy record expressly allows them.

### 5.4 Pagination and sort stability

- page and limit must be reflected exactly in response.pagination.
- total is the full eligible branch total, not the current page length.
- pages is ceil(total / limit), or zero for total zero.
- Sort order must be deterministic. Use a stable unique tie-break after the primary sort.
- Preserve recent, popular and title A–Z sort options. Popular remains based on first-party enrollment/review data as currently defined; no YouTube popularity statistic may be used.
- An empty requested page with a positive total remains on the selected local branch and never invokes the next branch.

---

## 6. Frontend behavior

### 6.1 One request per selected page

The current Courses page loops through pages of 50 until it receives a short batch, then applies a separate client page size of 12. Align the page with the API pagination contract:
- request page=catalogPage and limit=12;
- use response.pagination for page count and displayed totals;
- remove the fetch-all-pages loop;
- retain the existing visible Previous/Next page controls;
- reset catalogPage to 1 when query, level, category or sort changes.

The backend must implement the title sort so the client does not need to fetch all results and sort only the current batch. Use a stable tie-break for equal titles.

### 6.2 Fallback state ownership

- Clear prior discovery state when the request parameters change.
- Render external fallback only when the response contains mode=youtube_fallback.
- Remove the youtube_supplementary branch.
- Remove the second GET /api/discovery/search playlist lookup from the Normal Search path.
- Use one response property to carry the full permitted fallback collection; do not split provider fetching between hidden requests.
- On a local result response, ensure stale fallback cards from an earlier query cannot remain visible.
- On a provider error, render a non-blocking empty fallback message; keep the search page usable.
- On catalog failure, show the catalog error state rather than the YouTube fallback state.

### 6.3 Request race protection

A slower response for an older query/filter/page must not overwrite a newer request's data. Implement a request identity or cancellation mechanism consistent with the existing apiFetch capabilities. Test quick successive searches, filter changes and page navigation while requests are pending.

### 6.4 Build with AI separation

The Build with AI button remains a separate explicit action. Its open/close state, topic profile, authentication and feature entitlements must remain independent from Normal Search. A Normal Search test must observe zero calls to:
- Gemini model-generation APIs;
- POST /api/intent/parse;
- POST /api/ai/roadmap;
- GET /api/discovery/course-search;
- any hidden AI course-generation path.

An explicit Build with AI action may use its own approved APIs; that does not waive Normal Search's zero-call invariant.

---

## 7. Data, security and operational guardrails

### 7.1 Public visibility and ownership

- Every local query uses visibility=public explicitly.
- Normal Search never returns visibility=private or createdForUser-owned learner courses.
- Module-derived standalone content must not inherit private ownership or bypass D-07 publication rules.
- Do not alter enrollment, pricing, payment or approval state as a side effect of search.

### 7.2 YouTube data lifecycle

- Every copied provider snapshot must remain identifiable as YouTube API Data with its own source identity and actual successful fetchedAt/lastVerifiedAt.
- A generated standalone module must not create an unmanaged duplicate metadata snapshot with no refresh/delete linkage.
- Preserve YouTube source attribution and player requirements.
- Keep API Data refresh/delete and user deletion handling separate from ordinary course record lifecycle.
- The 30-day Non-Authorized API Data limit and the user-related deletion obligation are governed by current policy and DEC-YT-01; use the current approved policy record, not a cache TTL guess.
- No audiovisual content may be downloaded or stored.

### 7.3 Quota, telemetry and privacy

Internal telemetry should distinguish:
- logical Normal Search requests;
- direct local branch, module branch or fallback branch;
- eligible direct/module total;
- candidate count and displayed provider count;
- cache hit/miss and elapsed time;
- YouTube search.list call count;
- shared quota units for non-search methods;
- quota refusal/store outage/transient provider error.

Do not merge search calls into shared quotaUnits. Do not log API keys, cookies, bearer tokens, raw learner profile fields or full provider payloads. Do not expose internal ranking metrics or policy-prohibited scores in public response metadata.

---

## 8. Regression test plan

The tests below are required acceptance evidence for the implementation workstream. They are proposed test cases, not tests that were run during Task 16.

### 8.1 Backend service tests

| ID | Scenario | Expected assertion |
|---|---|---|
| NS-T01 | One eligible direct course | Direct course returned; module and YouTube adapters not called |
| NS-T02 | Several eligible direct courses | Direct branch wins; no module or provider call |
| NS-T03 | Direct total is exactly 50 with page size 50; request page 2 | Empty page but total=50; no module/provider fallback |
| NS-T04 | Direct total is 73; request page 3 | Empty page but total=73; no module/provider fallback |
| NS-T05 | Direct course exists only on a later server page | Module and YouTube not called from earlier pages |
| NS-T06 | Direct course title/description/category/learning outcome match | Direct search returns eligible record according to approved match semantics |
| NS-T07 | Direct course is private, deleted, archived, pending or unpublished | Excluded from local total and response |
| NS-T08 | No direct course; one eligible published module match | Standalone module course returned; YouTube not called |
| NS-T09 | Two modules match in one source course | Each source module has its own stable standalone identity and result |
| NS-T10 | Existing standalone course for source identity | Reuse it; do not create another |
| NS-T11 | Two concurrent requests materialize the same module | Exactly one standalone record survives; no data loss for progress/enrollments |
| NS-T12 | Manual approval mode | New standalone remains unpublished/pending and is never returned |
| NS-T13 | Automatic approval with readiness pass | Approved standalone may publish and be returned according to D-07 |
| NS-T14 | Automatic approval with readiness failure | Remains unpublished and is not counted as eligible result |
| NS-T15 | Private parent or learner-private standalone | Excluded; no visibility/ownership mutation |
| NS-T16 | Search query matches only YouTube-derived video title/description/channel/playlist metadata | Must not count as a first-party module match unless DEC-YT-01 explicitly clears that use |
| NS-T17 | Module result pagination | Complete eligible standalone total and stable page order |
| NS-T18 | No eligible direct or module result; fallback capability disabled | YouTube and Gemini both zero calls; empty local result |
| NS-T19 | No eligible local result; policy-approved fallback capability enabled | Exactly one logical provider fallback; Gemini zero calls |
| NS-T20 | Local result appears after fallback cache was previously populated | Local result wins; cached provider fallback is not returned |
| NS-T21 | Catalog database throws | Standard server error; no provider fallback |
| NS-T22 | Module materialization throws | Error is not disguised as zero eligible local matches |
| NS-T23 | Query has Unicode letters/marks or technical punctuation | Match behavior follows the explicitly versioned normalization contract |
| NS-T24 | Same title or equal popular score across records | Deterministic tie-break provides stable pagination |

### 8.2 Provider and Gemini isolation tests

Use provider spies or injected test adapters at the actual outbound client boundary.

| ID | Scenario | Gemini calls | YouTube calls |
|---|---|---:|---:|
| NS-P01 | Empty query/catalog browse | 0 | 0 |
| NS-P02 | Direct local match | 0 | 0 |
| NS-P03 | Direct local match on a later page | 0 | 0 |
| NS-P04 | Eligible module standalone match | 0 | 0 |
| NS-P05 | No local match but policy gate closed | 0 | 0 |
| NS-P06 | No local match and approved fallback enabled | 0 | Bounded, quota-guarded |
| NS-P07 | YouTube returns 5xx | 0 | Bounded attempts only |
| NS-P08 | YouTube transient 429 | 0 | Retry only according to approved bounded retry contract |
| NS-P09 | Daily quota exhausted | 0 | No hot loop or unguarded call |
| NS-P10 | Quota store unavailable | 0 | No call admitted without reservation |
| NS-P11 | Gemini API key configured | 0 | Same branch-dependent count as above |
| NS-P12 | Build with AI explicitly launched after a separate click | Calls belong only to Build with AI APIs | Its own policy-governed resource calls |

Tests must include the case where Gemini is configured. A test that passes only because the API key is absent does not establish D-01.

### 8.3 Controller/API contract tests

- page, limit, q length, category, level and sort validation;
- guest access and signed-in course_search entitlement behavior remain unchanged;
- direct/module response omits discovery;
- fallback response has exactly mode=youtube_fallback;
- legacy youtube_supplementary is not returned;
- total/pages are full branch totals;
- safe provider error is non-sensitive;
- provider failure is non-fatal only after an otherwise successful local/catalog lookup;
- database failure remains a catalog error;
- private courses and owner identifiers never appear in public results.

### 8.4 Frontend component tests

- Search submit creates the expected query request.
- One request is made for the selected page, with limit 12.
- Query/filter/sort changes reset page to 1.
- Title sort is server-driven and stable.
- Local response clears any old fallback cards.
- Fallback cards appear only for mode=youtube_fallback.
- The page does not make a second GET /api/discovery/search request.
- Catalog failure does not show a successful empty state.
- A stale response cannot replace the newest query's results.
- Build with AI remains a separate action and does not open automatically after a Normal Search miss.

### 8.5 Browser E2E journeys

The readiness inventory found no dedicated Normal Search browser journey. Add at least:

1. Existing direct course search → expected local course appears; no YouTube/Gemini request.
2. Module-only topic → eligible standalone course appears when approval/publication conditions pass.
3. Unknown topic with policy gate disabled → empty local state; no external request and no Gemini request.
4. Unknown topic with a separately approved provider fallback test configuration → YouTube fallback shown once with attribution; no Gemini request.
5. Search A then quickly Search B with delayed A response → B remains displayed.
6. Change level/category/sort then paginate → correct totals, stable page and no duplicate fallback.
7. Click Build with AI explicitly → dedicated AI flow opens; Normal Search remains a separate interaction.

### 8.6 Performance and operational tests

- Measure direct-course count/page query with realistic catalog volume and approved indexes.
- Measure module parent scan/materialization with realistic course/module counts; bound batch sizes and avoid unbounded collection materialization.
- Confirm unique module source identity under concurrent requests.
- Verify no extra provider request is generated per local page.
- Record separate YouTube search-call and shared-unit reservations.
- Use quota-capped staging checks only after DEC-YT-01 and the provider budget are approved.
- Do not use live 30–50-topic cold golden-set runs as routine validation.

---

## 9. Existing test-suite handling

The inspected server test inventory includes:
- server/test/courseCurationDecisionEngine.test.js;
- server/src/services/courseCurationDecisionEngine.phase5.test.js;
- server/src/services/nodeCuration.phase2.test.js, recorded in the readiness inventory.

The existing course curation test file includes tests and fixtures for scoring, percentile, learner-feedback blending, hidden-gem/ranking slots and score-based ordering. These tests must be reviewed against ADR-004/ADR-005 before they are treated as acceptable production evidence for either Normal Search or Build with AI.

Do not delete the entire curation suite indiscriminately:
- retain factual eligibility tests that remain permitted;
- separate Normal Search orchestration tests from Build with AI resource-node tests;
- move or remove policy-prohibited metric/ranking expectations from any production path until explicit approval is recorded;
- ensure tests do not encode a prohibited metric as a required product behavior;
- preserve tests for Build with AI's Gemini curriculum/intent generation, which is a separate approved product capability, without treating this as approval for Gemini evaluation of YouTube API Data.

No source-test inventory or full repository test run was performed as part of Task 16; the paths above are the matching files found in the fetched directory listing.

---

## 10. Implementation sequence and PR boundaries

All steps below require DEC-RELEASE-01 implementation authorization. The order is proposed; it does not create a branch or authorize a PR.

| Phase | Proposed implementation | Exit evidence |
|---|---|---|
| NS-I0 — preflight | Re-fetch current main source; reconcile current ADR/DEC-YT status; identify existing module duplicates; verify indexes and existing test commands | Source SHA snapshot, duplicate audit and approved scope |
| NS-I1 — test harness | Add service/API provider spies; create direct/module/fallback fixtures; prove the expected current failures first | Focused failing regression tests against the current authorized implementation baseline |
| NS-I2 — local query correctness | Add explicit public visibility, complete totals, direct precedence and stable server pagination/sort | NS-T01–NS-T17 and API tests pass |
| NS-I3 — safe module materialization | Resolve duplicate identity migration; enforce idempotent source course/module materialization and data lifecycle linkage | Concurrent duplicate, publication and privacy tests pass |
| NS-I4 — curation boundary | Separate Normal Search from Build with AI node selector; remove Gemini transitive calls from Normal Search; suppress unapproved API-derived outputs | NS-P01–NS-P12 pass; provider policy gate respected |
| NS-I5 — frontend contract | Replace page-fetch loop with one request per page; remove supplementary and second playlist path; handle stale responses | Component and E2E search journeys pass |
| NS-I6 — observability and staging | Add separate quota telemetry and sanitized branch metrics; execute capped staging check only when permitted | CI, quota accounting and approved staging evidence |
| NS-I7 — release review | Review PR, security/privacy, product, provider-policy and operations evidence | Explicit workstream Go/No-Go and rollout approval |

Recommended PR separation after authorization:
- PR A: Normal Search branch-selection service/controller tests.
- PR B: module standalone deduplication/index/data-lifecycle migration.
- PR C: Gemini-free, policy-gated provider adapter separation.
- PR D: Courses page pagination and single-response fallback UI.
- PR E: E2E, telemetry and operational runbook.
Dependencies must be merged in an approved order; no direct main commits are implied.

---

## 11. Definition of done

Normal Search implementation is complete only when:

1. ADR-001's direct → module standalone → optional fallback order is enforced by full eligible totals.
2. Direct local matches always suppress module lookup and YouTube, including empty requested pages with positive totals.
3. Module standalone results are deduplicated by source course/module identity and obey publication approval, visibility and D-07 rules.
4. No private learner course or private source course is exposed or made public by search.
5. Normal Search makes zero direct or indirect Gemini model-generation calls with Gemini configuration present.
6. No unapproved YouTube API-derived score, ranking, metric, percentile or quality claim is computed, persisted, returned or displayed.
7. YouTube fallback is disabled unless and until DEC-YT-01 has cleared the exact method and its data handling.
8. A provider fallback is requested once per logical empty-local search, not once per page or by a second hidden UI request.
9. Pagination totals, page rows and sort are stable; title A–Z behavior is preserved.
10. Catalog errors, module materialization errors, quota refusal and provider outage remain distinguishable and safe.
11. All focused unit/integration/contract/browser tests pass on the implementation commit.
12. Current CI, staging configuration, worker/provider requirements and residual risks are reviewed under DEC-RELEASE-01.

---

## 12. Open decisions and conditions

| Item | Required owner | State |
|---|---|---|
| Exact YouTube fallback method and allowed API fields/transforms | Product + compliance/legal + written YouTube decision where needed | Blocked by DEC-YT-01 |
| Whether external provider fallback is removed from the first launch if no method is cleared | Product owner | Pending product choice |
| Unique partial index and duplicate reconciliation plan for module standalone identity | Engineering/DB owner + data owner | Required before concurrent materialization |
| Preserve title sort with backend pagination | Product/API owner | Required to preserve existing UI control |
| Confirm first-party-only fields for module matching until policy scope is clear | Product + compliance | Conservative guardrail in this spec; confirm during DEC-YT-01 |
| Current-main source rebase and implementation authorization | Product + engineering + security/privacy + operations | Blocked by DEC-RELEASE-01 |

The recommendation does not approve any of these owner decisions. If an item conflicts with accepted ADR-001 or D-01–D-03, update the controlling decision record first.

---

## 13. Task 16 completion record

**Task 16 output:** this Normal Search implementation specification and regression test plan, prepared on docs/build-with-ai-engineering-readiness.

**Task 16 status:** Complete — documentation/implementation preparation only.

**Important boundary:** no application code, tests, builds, CI, provider calls, staging checks, production settings, database, index migration, feature flags, deployment, merge or main-branch changes were made. The recommendations do not authorize implementation.

**Overall readiness:** NO-GO for broad rollout remains unchanged.

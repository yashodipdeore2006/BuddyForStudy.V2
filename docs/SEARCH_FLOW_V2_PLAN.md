# Search Flow v2 — test branch

> **Historical status:** This file records a proposed/implemented-on-test-branch flow, not proof of the current `main` behavior or a production rollout. The canonical current product contract is [ADR-001 — Normal Search local-first and Gemini-free](architecture/ADR-001-normal-search-local-first-gemini-free.md). YouTube metadata, retention and derived-metric limits are governed by [ADR-004](architecture/ADR-004-youtube-resource-data-lifecycle.md), [ADR-005](architecture/ADR-005-curation-quality-and-youtube-quota-model.md) and the [Learning Resource Candidate and Selection Contract](architecture/LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md). Where this historical file conflicts with those documents, the current contracts prevail.

## Goal

Make the main Courses search predictable and useful without consuming Gemini quota.

## Target decision tree

1. Search the published BuddyForStudy catalog by course-level fields.
   - If one or more existing courses match, return those courses.
   - This has highest priority.
2. If no existing course matches, inspect published course curricula.
   - If a module/playlist/lesson matches, create or reuse one standalone BuddyForStudy course for each matching module and return those standalone courses.
3. If neither a course nor a module matches, do not call Gemini.
   - Search YouTube directly for long-form course/tutorial videos.
   - Apply only factual eligibility checks and present policy-permitted provider metadata with clear evidence limitations. Do not derive or persist custom ranking, relevance, topic-coverage, quality, engagement or confidence scores, percentiles, or ranked ordering from YouTube API Data (including views, likes or subscriber counts) unless the exact curation use case and metric method receive the required written policy clearance under ADR-004/ADR-005.
   - Return the top 3 as YouTube course recommendations.
   - Return a separate list of relevant YouTube playlists.
4. Keep YouTube fallback results as recommendations rather than inserting them into MongoDB automatically. This prevents database pollution and duplicate courses.
5. Keep Build with AI as the explicit Gemini-powered path. Pressing the normal Search button must never require Gemini.

## UI

- [x] Existing BuddyForStudy course matches remain normal course cards.
- [x] Standalone module matches remain normal course cards.
- [x] No local match shows a YouTube learning options section with up to 3 long-form course/video recommendations and up to 6 playlists.
- [x] YouTube recommendations link to their original YouTube resources.
- [x] API/YouTube failures are non-fatal to catalog search: the page can still show zero local courses with a clear fallback message.

## Verification scenarios

- [x] Search `java` when Java Full Stack exists -> return Java Full Stack, do not create a Java module course.
- [x] Search `javascript` when JavaScript exists only as a module -> return/create standalone JavaScript course.
- [x] Search an unknown topic such as `php` when no course/module exists -> show up to 3 YouTube course/video options plus playlists.
- [x] Search must not call Gemini.

The checked boxes below record the historical test-branch document's own verification claims only. They do not establish that the behavior is present on current `main`, that the current ADR-001 product contract is implemented, or that any YouTube-derived ranking/metric method has policy approval.
- [x] Repeating an unknown search must not create duplicate MongoDB Course documents.

## Implementation status

The original implementation was recorded as implemented on the `test` branch. It was not independently proven by this current cross-document audit to be present on `main` or deployed. The current main-branch state and runtime flags require a separate source/runtime verification.

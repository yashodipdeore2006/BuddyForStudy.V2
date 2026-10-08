# Search Flow v2 — test branch

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
   - Rank candidates using relevance, topic coverage, duration, views, likes, subscribers, recency and embeddability.
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
- [x] Repeating an unknown search must not create duplicate MongoDB Course documents.

## Implementation status

Implemented on the `test` branch. The repository-side changes have been reviewed through the GitHub file contents. A local build/runtime test could not be executed in this environment because the repository is not available to the local container.

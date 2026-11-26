# Build with AI — Learner Progress Experience

## Goal

Show learners meaningful, accessible feedback while BuddyForStudy generates a personalized roadmap. Reuse the existing asynchronous roadmap draft, polling API, and per-lesson build states. Do not create a second job system or imply progress that the backend cannot measure.

## Design decisions

- Use a three-stage tracker: **Designing your learning path → Finding learning resources → Finishing your roadmap**.
- While the curriculum is being generated and no lesson nodes exist, use an indeterminate progress indicator and a plain-language status. Do not show a percentage.
- Once the skeleton and lesson nodes exist, show the actual number of processed resource lessons out of the total. The visual progress value is derived from terminal node states only.
- Count \`ready\`, \`low_confidence\`, \`failed\`, \`quota_limited\`, and \`unavailable\` as processed. Surface non-ready outcomes separately as “need attention”; never present them as successful matches.
- Exclude quiz nodes because resource curation does not run for quiz lessons.
- Keep the existing 1.2-second polling fallback and persisted draft ID. On refresh, restore the progress dialog and continue polling.
- Keep the synchronous API path functional. It receives a truthful indeterminate state because it does not expose intermediate server progress.
- Progress remains understandable without animation and uses the existing design system and dependencies.

## Scope

1. Add a pure progress derivation helper and tests.
2. Add an accessible progress panel using the existing Tailwind and Lucide dependencies.
3. Wire async draft and poll responses into the panel.
4. Expose the lesson type in poll results so quiz nodes are excluded.
5. Restore the in-progress panel after a page refresh.
6. Run frontend lint, typecheck, unit tests, production build, and backend async-roadmap tests.

## Acceptance criteria

- No fabricated elapsed-time estimate or arbitrary percentage.
- Progress is based on the backend's real node states.
- Quiz lessons do not block completion.
- \`failed\` and \`quota_limited\` are visible as attention states, not successes.
- Refresh resumes the same draft without creating a duplicate.
- Existing sync and async Build with AI flows remain available.
- No auth, billing, course schema, quota, or generation behavior is changed.

## Task tracking

| Task | Status |
| --- | --- |
| Inspect async roadmap and frontend contracts | DONE |
| Finalize progress UX and data rules | DONE |
| Add progress derivation helper and tests | DONE |
| Add accessible progress panel | DONE |
| Wire async generation and polling | DONE |
| Exclude quiz nodes from resource progress | DONE |
| Restore progress after refresh | DONE |
| Run frontend and backend verification | IN_PROGRESS |

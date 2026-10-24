# Build with AI v2: Implementation Guide

For: an AI coding assistant working in the BuddyForStudy.V2 repository (React 18 + TypeScript in src/, Express 5 + Mongoose in server/src/, Gemini via @google/genai).

Purpose: change the Build with AI flow so that it follows the new architecture: one intent profile, one video selection engine, a validated skill graph, cached and quota-safe retrieval, and a streamed result.

## 1. Rules for the assistant

1. Read the code before changing it. Function names, file paths and signatures in this guide come from an audit summary, not from the source. Every place marked ASSUMPTION must be verified, and any difference reported.
2. Work in the phases of section 6, in order. Each phase must ship on its own, behind a feature flag, and leave the app working.
3. Normal search must behave exactly as before unless a phase says otherwise. Add the regression tests of Phase 0 before touching curateNormalSearch.
4. Do not change the Course schema, quiz generation, project brief generation, auth, admin features or the normal-search routes, except for the optional fields named in this guide.
5. Never print or log secrets. Never invent YouTube URLs, company facts, hiring rounds or official exam syllabi.
6. Use small pure functions with unit tests. Mock YouTube and Gemini in all automated tests, and never spend real quota in tests.
7. After each phase, stop and send the report in section 10.

## 2. Goal

Today the app has two disconnected selection paths. Normal search ranks videos with curateNormalSearch (7-signal score, hidden gems, metadata judge, 14-day cache). Build with AI picks videos with searchBestYouTubeCourse (fixed formula, in-memory cache). The AI builder also uses a fixed form, searches per lesson, waits for everything before responding, and persists YouTube data in courses.

Target flow: search -> parseIntent -> adaptive questions -> roadmap graph (validated, canonical skill IDs) -> per-skill curation through the shared engine -> streamed result with schedule, projects, quizzes and goal-specific modules (interview, exam, project, learn).

Non-goals: transcripts, replacing Gemini or MongoDB, a new UI library, changes to billing or admin.

## 3. Current state and target

| Area | Current | Target |
| --- | --- | --- |
| Intent | Fixed form fields; keyword rules in normal search | Shared IntentProfile from parseIntent and a question plan |
| Roadmap prompt | One long prompt with Data Analytics and web rules inside | Neutral base prompt plus one domain playbook |
| Skill IDs | Kebab-case per roadmap | Canonical registry reused across roadmaps |
| Video selection (builder) | searchBestYouTubeCourse per lesson | curateForNode per skill, using curateNormalSearch |
| Caching (builder) | In-memory, 1 hour and 24 hours | Persistent node cache and template cache |
| YouTube calls | Direct fetch, no accounting, no retry | One gateway, youtubeRequest, with a quota budget |
| Response | One blocking JSON | Skeleton first, then streamed node updates |
| Stored YouTube data | Persisted in courses with no refresh | IDs and fetchedAt only, plus a nightly refresh |
| Goal content | None | Interview module (job), exam modules, project path, learn path |

## 4. Contracts

### 4.1 IntentProfile (server, Zod)

```js
const Goal = z.enum(['job_ready', 'exam', 'project', 'learn']);
export const IntentProfile = z.object({
  topic: z.string().min(2).max(200),
  domain: z.string().max(40).default('general'),
  scope: z.enum(['narrow', 'broad']).default('narrow'),
  goal: Goal.nullable().default(null),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Beginner'),
  knownSkills: z.array(z.string()).max(50).default([]),
  minutesPerDay: z.number().int().min(15).max(720).default(60),
  deadline: z.string().max(40).nullable().default(null),
  language: z.string().max(10).default('en'),
  targetRole: z.string().max(120).nullable().default(null),
  targetCompany: z.string().max(120).nullable().default(null),
  examName: z.string().max(120).nullable().default(null),
  examDate: z.string().max(40).nullable().default(null),
  syllabusText: z.string().max(20000).nullable().default(null),
  projectIdea: z.string().max(200).nullable().default(null),
});
```

Legacy mapping, so old clients keep working: a goals\[\] entry of 'Career or work growth' maps to job\_ready; 'Exam or certification' maps to exam; 'Create something' or 'Create a project or deliverable' maps to project; every other legacy goal maps to learn. Keep accepting topic, level, goals, studyTimeMinutesPerDay and knownSkills.

### 4.2 Question plan

parseIntent returns questionPlan: an ordered list of questions. Each has id, type (single, multi, text, paste, checklist, time), optional options (max 6, each max 40 characters), allowText, optional (boolean) and when (for example goal=job\_ready). Fixed ids: goal, role, company, examType, examDate, syllabus, projectIdea, depth, knownSkills, time, language. The client walks the plan locally. A question is dropped when its field already has a confidence of 0.8 or more.

### 4.3 Roadmap node fields (additive)

Each skill node keeps its existing fields and gains: canonicalSkillId; nodeType (skill, project, checkpoint, interview, revision, mock\_test); durationPolicy {minMinutes, targetMinutes, maxMinutes}; state (pending, queued, ready, low\_confidence, failed, unavailable); and source (user, typical, generated) for syllabus-derived nodes.

### 4.4 Endpoints

| Endpoint | Purpose |
| --- | --- |
| POST /api/intent/parse | Query to partial profile, confidences, domain, question plan |
| POST /api/ai/roadmap/draft | Starts template generation when the goal is tapped. Returns draftId |
| POST /api/ai/roadmap | Existing route, extended: takes draftId and profile, returns the skeleton |
| GET /api/ai/roadmap/:id | Polling fallback with the same node states |
| GET /api/ai/roadmap/:id/events | Server-sent events: node, progress, done, error |

Keep the requireFeature checks (ai\_course\_builder, personalized\_roadmaps) and add rate limits. The finalize response contains roadmapId, status, summary, modules (with states), schedule, scheduleWarning and eventsUrl. Each node event contains nodeId, state, best, alternatives and flags.

ASSUMPTION: check how apiFetch authenticates. EventSource cannot set headers, so if auth is header-only, use fetch streaming or a short-lived stream token, and always keep the polling fallback.

### 4.5 Environment flags (server/src/config/env.js)

USE\_CURATION\_ENGINE\_FOR\_AI (default false until Phase 2 passes), INTENT\_V2, ASYNC\_ROADMAP, YT\_COMBINED\_SEARCH, ENABLE\_TRUSTED\_CHANNELS, YT\_DAILY\_QUOTA\_BUDGET (default 9000), YT\_SOFT\_LIMIT\_PCT (80), NODE\_CACHE\_TTL\_DAYS (default 14, max 25), NODE\_CONCURRENCY (default 3), AI\_PRIVATE\_COURSES\_SKIP\_REVIEW.

## 5. Cross-cutting rules

Quota. Verify against Google's current quota documentation: the default is 10,000 units per day per project, search.list costs 100 units, and most other read calls cost 1. Anything that can use a 1-unit call must not use search.list. A cold node may cost at most 3 video queries plus 1 playlist search.

Data retention. YouTube API data (statistics, titles, thumbnails and so on) must be refreshed or deleted within 30 days. Verify in the YouTube API Services Developer Policies. Our own limit is 25 days. Persist IDs and fetchedAt, never view, like or subscriber counts. Statistics may live only in expiring caches.

Honesty. Interview and exam content must come from retrieved metadata or text the user pasted. Anything inferred is labelled (community reported, typical topics) in the data and in the UI.

Failure. A quota, Gemini or YouTube failure must never fail the whole request. Degrade as in section 8.

## 6. Phases

### Phase 0: Safety net

- Add the flags from 4.5, all off.
- Add fixtures with mocked YouTube and Gemini responses for the query MERN stack, and snapshot: (a) the curateNormalSearch ranked IDs and scores (rounded to 2 decimals); (b) the course produced by buildCourse for a fixed Gemini response.
- Add structured log fields: requestId, skillId, cacheHit, searchCalls, quotaUnits.

Done when: the snapshots pass on the current code.

### Phase 1: YouTube gateway and quota guard

Files: youtube.service.js (youtubeRequest), discovery.service.js, new quota.service.js, config/cache.js.

1. Find every fetch to googleapis.com/youtube and route it through youtubeRequest(endpoint, params).
2. COST table: search 100, everything else 1.
3. quota.service.js: tryConsume(cost) and getState(). Daily counter in Redis (INCRBY with expiry), with a Mongo fallback when Redis is absent. Use Google's reset boundary (verify it, likely Pacific time).
4. States: ok below YT\_SOFT\_LIMIT\_PCT of the budget; degraded from there to 100% (search.list refused, 1-unit calls allowed); exhausted at 100% or on a 403 quotaExceeded from Google (all calls refused until reset). Refusals throw QuotaBudgetError carrying the state.
5. Retry 429, 5xx and network errors twice (300 ms, then 900 ms, plus jitter), with an 8 s timeout. Never retry quotaExceeded or other 4xx errors.
6. Test on a dev key whether search.list accepts type=video,playlist in one call. Adopt it behind YT\_COMBINED\_SEARCH only if the results are equivalent.

Done when: no direct YouTube fetch remains; unit tests cover costs, thresholds, retry and refusal; the quota state is logged per request.

### Phase 2: One selection engine for both flows

Files: courseCurationDecisionEngine.service.js, new nodeCuration.service.js, youtube.service.js (attachYouTubeResources), CourseCurationCache model.

2.1 Extend curateNormalSearch(query, options) with optional, backwards-compatible options: syllabus (skips getTopicSyllabus), overrides {mode, minVideoSeconds, maxVideoSeconds, minPlaylistSeconds, minPlaylistItems, halfLifeDays}, maxQueries (default 8), extraQueries, cacheScope. With no options the behavior must be identical.

2.2 Cache keys. The result key is the existing key plus cacheScope plus a hash of the overrides. The candidate-pool key stays query-based, so nodes and normal searches share raw candidates. Node cache entries use CourseCurationCache with kind node, a key built from engine version, canonicalSkillId, mode, level, language and bounds hash, and TTL NODE\_CACHE\_TTL\_DAYS.

2.3 curateForNode({ skill, profile, durationPolicy }):

1. Build the syllabus from skill.topics with equal weights (or \[skill.name\]).
2. Build overrides from durationPolicy: mode full\_course if targetMinutes >= 180, crash\_course if >= 60, otherwise quick\_reference; bounds from min and max minutes; minPlaylistItems 2.
3. Query = skill.name. If it is generic (basics, fundamentals, introduction, overview, intermediate, advanced, projects), prefix profile.topic.
4. extraQueries = skill.searchQueries, at most 2.
5. Call curateNormalSearch with cacheScope node:\<canonicalSkillId>, passing profile.level and profile.language.
6. Return { best, alternatives (up to 2), meta {cacheHit, searchCalls, lowConfidence} }. lowConfidence is true when best.finalScore is below the engine's own threshold (read it; use 45 if there is none).
7. If nothing passes the gates, retry once with widened bounds (min x 0.5, max x 1.5), then return best null.

2.4 Rewrite attachYouTubeResources:

- Group tutorial lessons by skill. Call curateForNode once per skill, with concurrency NODE\_CONCURRENCY.
- Playlist or composed learning path: spread the items across the skill's tutorial lessons in order, reusing normalizeMultiVideoLessons.
- Single video with chapters (extractCurationChapters): give each tutorial lesson the same video with start and end seconds matched to its topics (token overlap, else proportional).
- Single video without chapters: ASSUMPTION about the lesson schema. Attach it to the first tutorial lesson and merge or reference the rest. Report which option you chose.
- Store only videoId, playlistId, title, channelTitle, durationSeconds, thumbnail, chapters, fetchedAt and a short reason. Store alternatives (up to 2) in an optional field.
- Fallback: when USE\_CURATION\_ENGINE\_FOR\_AI is off, or the engine throws or returns nothing, call searchBestYouTubeCourse as before. Keep it for at least two weeks after rollout.
- On QuotaBudgetError set the node state to queued (section 8).

2.5 Trusted channels (behind ENABLE\_TRUSTED\_CHANNELS). New TrustedChannel model {channelId, domain, skillIds, wins, lastSeen}. After each node pick, increment wins for the chosen channel. readTrustedChannels(skill) reads the playlists and uploads of channels with wins >= 2 in the domain, using 1-unit calls, and merges them into the candidate pool before any search. Skip search.list when the pool already holds at least 3 candidates that pass the gates.

Done when: the Phase 0 snapshots still pass; curateForNode tests pass (bounds enforced, syllabus injection skips the Gemini call, cache isolation from normal search); a second roadmap for the same skills makes 0 search.list calls.

### Phase 3: Skills registry, prompt refactor, template cache

Files: aiRoadmap.service.js, new Skill model, new domainPlaybooks.js, new RoadmapTemplate model.

1. Skill model {\_id: canonicalId, name, aliases, domain, createdAt}. resolveCanonicalSkill(name): exact alias, then normalized slug, then token-set match above a threshold, otherwise create a new entry. getRelevantCanonicalSkills(topic, 40) feeds the prompt with the instruction to reuse those IDs when the skill is the same.
2. Move the Data Analytics paragraph and the web, full-stack and MERN paragraphs out of generateWithGemini into domainPlaybooks.js, keyed by domain (software\_web, data, exam, language, creative, general). The base prompt stays neutral and only the playbook matching profile.domain is appended. Do not change the wording of moved paragraphs.
3. In buildCourse, map every skill ID through resolveCanonicalSkill before ordering.
4. validateSkillGraph(skills): unique IDs; drop prerequisites that do not exist; break cycles by removing the lowest-importance edge; keep 3 to 14 skills; log every repair.
5. RoadmapTemplate {key = sha256 of canonicalTopic, goal, level, language and promptVersion; roadmap JSON before personalization; createdAt}, TTL 30 days. It holds Gemini output only and no YouTube data. generateAIRoadmap checks it first. Personalization (known skills removed, schedule, goal modules) is a pure function applied after loading and is never part of the cached template.

Done when: tests cover resolution, graph repair and personalization; two users with different known skills get different courses from one cached template.

### Phase 4: Intent and question plan

Backend: parseIntent(query) with Gemini (LOW thinking, response schema, max 2,500 output tokens, 3 s timeout). It returns valid, profile, a confidence per field, domain, scope, and options for roles, exams and project ideas. Cache by normalized query for 30 days (LLM output only). On timeout or failure return the static plan: goal chips, and free text for role and exam. When valid is false (gibberish), skip all later calls. buildQuestionPlan(parsed) is a pure function. Extend the ai.controller.js schema to accept IntentProfile with the legacy mapping from 4.1.

Frontend (Courses.tsx): behind INTENT\_V2, replace the fixed builder fields with a chip-based flow driven by questionPlan. Include a progress bar, Skip on every question, free text, and the banner 'We assumed: job-ready, TCS. Change?' when the goal was inferred. Do not add libraries.

Done when: the scenarios in section 7 produce the right question sequences in unit tests.

### Phase 5: Goal modules

Add these as pure builders called from buildCourse after personalization.

- Job-ready: buildInterviewModule(profile, skills). Nodes for interview experiences, interview questions, hiring process and rounds (labelled community reported), and HR and behavioural questions. Queries: targetCompany plus targetRole first, then company, then role, then generic, each result labelled with the level that matched. Curate with mode quick\_reference and halfLifeDays about 540. Check whether hasStructureEvidence blocks short videos in that mode and relax it only for interview nodes. Question bank: generateCourseQuiz with scope interview and focus topics taken from the role's skill topics. A rounds summary may only use titles and descriptions of retrieved videos and must list the evidence video IDs; with no evidence, return nothing.
- Exam: buildExamModules(profile). Syllabus source order: pasted syllabusText (a Gemini syllabus-to-units call that must not invent units), otherwise typical objectives marked source typical and shown with a banner. Weight maps to hours. The schedule counts backwards from examDate. The last 20 percent is a revision block. Add mock\_test nodes (practice questions and mock walkthrough queries). Units with no good video are flagged, not hidden.
- Project: Gemini marks which skills the project requires and the rest are pruned. The project becomes the capstone, with milestone nodes and long-form build tutorials.
- Learn: fundamentals graph with a quiz per module and one small project. No interview or exam module.
- buildSchedule(nodes, minutesPerDay, deadline): total minutes from durationPolicy and projects, 6 study days a week by default. If the deadline needs more than 1.5 times the daily time, set scheduleWarning and mark the lowest-priority nodes optional.

Done when: each goal has unit tests with fixtures, and the company fallback chain is tested.

### Phase 6: Async build and streaming

1. Draft: POST /api/ai/roadmap/draft stores RoadmapDraft {draftId, userId, query, goal, status, createdAt} with a 1 hour TTL, enqueues template generation (Phase 3) and returns draftId immediately. ASSUMPTION: read jobs/worker.js to see the job pattern. If it cannot host on-demand jobs, use an in-process queue with the same concurrency limit and report it.
2. Finalize: wait up to 2 s for the draft, otherwise generate inline. Run personalization and the goal modules, create the course (private, createdForUser) and return the skeleton with node states. Idempotency key = sha256 of userId and the stable profile; return the same roadmapId for 10 minutes.
3. Resolve nodes: enqueue one job per node (curateForNode, concurrency NODE\_CONCURRENCY). Write each result to its lesson with an atomic update, then emit an event. States: pending, queued, ready, low\_confidence, failed.
4. Events endpoint plus polling endpoint, with a heartbeat every 15 s. ASSUMPTION: hosting is unknown, so proxies may buffer or time out. Polling must work on its own.
5. Frontend: render the skeleton at once, show a loading state per node, and update on events.
6. AI\_PRIVATE\_COURSES\_SKIP\_REVIEW: read the approval hooks in Course.js. If private generated courses wait for admin review, propose the smallest change that skips review for visibility private only. Do not change catalog or public courses.

Done when: the skeleton returns in under 1 second on a template hit; a node failure does not affect other nodes; a refresh mid-build resumes from the stored states.

### Phase 7: Compliance, feedback and workers

Files: jobs/worker.js, CourseCurationFeedback model, scoreFinalCandidates.

1. Add fetchedAt to every embedded video object. Write scripts/stripYouTubeStats.js (dry run by default) to remove view, like and subscriber counts from Course.generation.snapshot and from lessons.
2. refreshStaleVideos (nightly): find courses and node cache entries with fetchedAt older than 25 days, batch videos.list at 50 IDs per call, update the metadata, and for deleted, private or non-embeddable videos swap to the next alternative or set state unavailable.
3. Feedback events: helpful, outdated, wrong\_level, completed, abandoned, with optional skillId and courseId on CourseCurationFeedback. Record them from the course player and the result UI.
4. rebuildSkillPriors (nightly): aggregate feedback per (canonicalSkillId, videoId) into SkillResourcePrior {score from -1 to 1, n, updatedAt}. In scoreFinalCandidates add the prior only when n is at least 5, capped at plus or minus 5 points.
5. Check engagementFeatures. If it has no low-view smoothing, use the Wilson lower bound of likes over views as the engagement input.

Done when: the refresh job passes tests with mocked videos.list, and no persisted course contains statistics.

### Phase 8: Rollout

1. Enable flags in dev, then staging, in this order: Phase 1, 2, 3, 4, 5, 6.
2. Write scripts/compareSelectors.js: it runs both selectors on a fixed list of 10 skills against mocks, with an optional live mode capped at 5 skills that prints the quota counter.
3. Remove dead code only after two stable weeks.

## 7. Scenario tests

| Scenario | Expected |
| --- | --- |
| Python for everything, then job-ready, role, company | Role and company questions asked; skill nodes, projects, capstone, interview module with company queries first |
| Job-ready, company skipped | Interview module with role-only queries |
| Job-ready, role typed freely | Mapped to the closest role and shown as a changeable chip |
| Exam, certification, date given | Syllabus-mapped modules, revision block, mock tests, backward schedule |
| Exam, syllabus pasted | One node per unit; units without a good video flagged |
| Exam, unknown name, no syllabus | Typical topics with a banner and an Add syllabus chip |
| Project | Pruned skills, milestones, build tutorials, no interview or exam module |
| Learn | Fundamentals, quizzes, one small project |
| Python for TCS interview | Goal and company questions skipped, assumed banner shown |
| Same topic again | Template hit; skeleton under 1 second; 0 search.list calls for cached skills |
| All questions skipped | Defaults: learn, beginner, 60 minutes, English |

## 8. Failure handling

| Failure | Behavior |
| --- | --- |
| parseIntent fails or takes over 3 s | Static question plan |
| Not a learnable query | valid false, no further calls, show examples |
| Gemini roadmap fails | Retry once, then generateCoursePlan, then buildTopicFallback; if all fail return a retryable error |
| Quota degraded or exhausted | Cache only; uncached nodes get state queued and are resolved later by the worker |
| No video passes the gates | Widen bounds once; otherwise best near miss with low\_confidence, or null with state failed |
| No company interview videos | Fall back company+role, company, role, generic, each labelled |
| Double submit | Idempotency key returns the same roadmapId |
| Video later removed | Nightly refresh swaps to an alternative |
| User changes an answer after the skeleton | Non-goal changes re-personalize in code with no Gemini call; a goal change starts a new draft |

## 9. Acceptance checklist

- Normal search output is unchanged for the same query (Phase 0 snapshots).
- Build with AI picks come from curateNormalSearch for every skill, with the old selector only as fallback.
- No direct YouTube fetch exists outside youtubeRequest.
- No persisted course holds YouTube statistics, and every video has fetchedAt.
- A second roadmap with overlapping skills makes 0 search.list calls for them.
- Every section 7 scenario has a passing test.
- The app works with every new flag off.

## 10. Report back after each phase

Send: files changed (with function names), a diff summary, test results, every assumption verified or corrected, and deviations from this guide with the reason. From Phase 2 onward, also send a log of one real roadmap showing cache hit or miss, search.list calls and quota units per node. Do not include secrets.

# Product Requirements Draft — Normal Search & Build with AI

**Status:** Draft v0.4 — source review completed; D-01, D-05 and D-07 approved on 2026-11-14; remaining product decisions open  
**Reviewed baseline:** `main` at `eb2f4af7ea85723d1f4940e61ffcb7962319e494`  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Tracking issue:** [#43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Scope:** Learner-facing Normal Course Search and Build with AI. This is a requirements artifact only; no product code or production configuration has been changed.

## 1. Purpose and product boundary

BuddyForStudy exposes two distinct ways to find learning:

1. **Normal Search** helps a learner discover already-published BuddyForStudy courses and relevant learning resources for a topic.
2. **Build with AI** creates a personalized learning roadmap/course based on the learner's goal, current skills, level, available study time, deadline, and resource-language preferences.

These experiences may share the resource-candidate and ranking infrastructure, but they have different user intent, latency expectations, data lifecycle, and output contracts. They must not be presented as the same action.

## 2. Verified current behavior on `main`

### 2.1 Normal Search

**Frontend path**
- `client/src/pages/Courses.tsx` owns the catalog search form and filter state.
- Submitting Search sets the catalog query; the page calls `GET /api/courses` with query, level, category, sort and pagination parameters.
- When the response includes discovery metadata, the page renders supplementary discovery resources. A legacy playlist lookup can call `GET /api/discovery/search` when the curation response does not already include curated resources.
- The page also offers a distinct **Build with AI** action.

**Backend path**
- `server/src/controllers/course.controller.js:list` delegates to `course.service.listPublished`.
- For non-empty queries, `course.service.listPublished` first searches published course-level fields.
- When there are no direct local course results, it searches published modules/lessons and creates or reuses standalone module-course records. A standalone result is returned only when the generated-course approval/publication checks pass.
- The same non-empty search request then calls `curateNormalSearch` and returns its resources as `youtube_supplementary`, whether or not local course results were found.
- Curation failures are caught; the course-list response can still return local courses with an empty discovery result and an error field.

**Approved product decision D-01 (2026-11-14): Gemini is reserved for Build with AI.** Normal Search must not invoke Gemini directly or indirectly. It may use the catalogue and YouTube discovery/candidate/ranking services, subject to Task 04 defining a no-Gemini curation path. The current implementation does not yet satisfy this decision because the curateNormalSearch path can invoke a Gemini-backed topic-syllabus generator. This is a documented implementation gap, not a completed code change.

**Important implementation/documentation discrepancy**
- `docs/SEARCH_FLOW_V2_PLAN.md` describes a desired flow in which Gemini is never called by Normal Search and YouTube fallback happens only when no local course or module matches. That file labels itself as a test-branch plan.
- Current `main` instead calls `curateNormalSearch` for every non-empty search query. The curation engine contains a Gemini-backed topic-syllabus path. Therefore, the test-branch document must not be treated as proof that the current `main` search path is Gemini-free.
- Current `main` also returns supplementary curation resources even when local course results exist. This differs from the strict fallback-only decision tree in the test-branch plan.

### 2.2 Build with AI

**Frontend path**
- `client/src/pages/Courses.tsx` opens Build with AI as a separate modal/action from Normal Search.
- The source includes an intent-driven flow that calls `POST /api/intent/parse`, builds conditional questions, and gathers a learner profile. However, the frontend constant `INTENT_V2` is currently hardcoded to `false`; do not assume the intent-driven flow is enabled in the live UI.
- The page also contains a compact/legacy profile flow with topic, level, course depth, study time, language/resource-language preferences, and known-skills inputs.
- The frontend async roadmap path is controlled separately by `VITE_ASYNC_ROADMAP`. When enabled, the page creates a draft, finalizes it, polls for status and stores a draft ID in local storage so a build can be resumed after refresh.

**Backend path**
- `POST /api/ai/roadmap` is authenticated and requires the `ai_course_builder` and `personalized_roadmaps` entitlements.
- The synchronous route is active when server-side `ASYNC_ROADMAP` is false. When true, draft, finalize, poll, cancel and event routes are registered.
- `POST /api/intent/parse` is authenticated, entitlement-gated, rate-limited, and returns 404 unless server-side `INTENT_V2` is enabled.
- The intent profile schema supports topic, domain, scope, goal, level, known skills, minutes per day, deadline, language, role/company, exam/syllabus, project idea, outcome and preferences.
- Supported goal values in the schema are `job_ready`, `exam`, `project` and `learn`.

**Target behavior in the Build with AI implementation guide (not a claim that every detail is currently live)**
- One intent profile and adaptive question plan.
- Canonical skill graph with prerequisite validation.
- Per-skill resource curation through the shared decision engine.
- Goal-specific learning content for job-ready, exam, project and learn journeys.
- A roadmap with schedule, projects, quizzes and node-level resource states.
- Partial failures should not discard successfully generated curriculum or already-resolved resources.

## 3. Proposed learner journeys

These are the working product requirements for review. Items marked **Decision required** are intentionally not settled by this draft.

### Journey A — Normal Search

1. Learner opens the Courses page.
2. Learner enters a subject, skill, framework, or course name and presses **Search**.
3. The system queries the published BuddyForStudy catalog and applies selected level/category filters.
4. Matching catalog courses are presented as BuddyForStudy course cards.
5. If direct course matches are absent, matching published modules may be surfaced as standalone course options, subject to the approval/publication policy.
6. Relevant external learning resources may be shown as discovery recommendations with enough metadata to assess topic fit, level, language, duration and source.
7. Learner opens a BuddyForStudy course to inspect details or follows an external resource to its original provider.
8. A learner who needs a customized syllabus can explicitly switch to **Build with AI**.

**Proposed behavioral requirements**
- Searching must never silently start a personalized roadmap or enroll the learner.
- Catalog access and external YouTube-discovery failures must be isolated: a YouTube outage must not erase valid catalog results. Normal Search must not depend on Gemini availability because D-01 prohibits Gemini calls in this flow.
- External recommendations must remain distinguishable from published BuddyForStudy courses and must not be represented as enrolled/owned courses.
- Search results must be deduplicated and stable across pagination.
- Resource metadata must not claim that a video covers content that has not been verified. Current curation evidence is based on metadata/structure; it does not watch the video or verify a transcript.

### Journey B — Build with AI

1. Learner explicitly selects **Build with AI** and enters a learning topic or outcome.
2. The system checks authentication and feature entitlement before starting paid/limited AI work.
3. The topic is parsed into a structured intent profile. Unsupported or invalid topics receive clear guidance and examples; they do not proceed to curriculum generation.
4. The learner is asked only for missing/low-confidence information. Questions are conditional on the goal and domain; already-known values are not asked again.
5. The learner can skip optional questions, edit inferred answers, and review the resulting profile before generation.
6. The profile captures, as applicable: goal, domain, narrow/broad scope, level, known skills, daily study time, study days, deadline, language, target role/company, exam/date/syllabus, project idea and learning preferences.
7. The system generates an ordered roadmap and explains its structure, expected workload and any assumptions.
8. Each skill/lesson receives a suitable learning resource or an explicit state explaining why a resource is pending, unavailable, low-confidence or failed.
9. The learner can inspect the roadmap, then use the supported course details/enrollment path when the generated course is approved and available.
10. For async generation, learners can see progress, refresh/resume, retry eligible failures and cancel a build where supported.

**Goal-specific content target from the implementation guide**
- **Job-ready:** skill path plus interview preparation; company/role-specific content only when supported by retrieved evidence, with community-reported information labelled.
- **Exam:** syllabus-mapped units, an exam-date-aware revision plan and mock-test/practice nodes. Typical objectives must be labelled as typical when the official/user-provided syllabus is unavailable.
- **Project:** skills required for the stated project, milestones and build tutorials; unrelated skills should not be added without a reason.
- **Learn:** fundamentals, practice/assessment and a small applied project; no interview or exam module by default.

## 4. Product requirements and acceptance criteria

### 4.1 Shared requirements
- **PR-01 — Separation of intent:** Normal Search and Build with AI remain distinct actions with distinct success states.
- **PR-02 — Honest source labels:** distinguish BuddyForStudy catalog courses, generated learner-private courses, and external YouTube recommendations.
- **PR-03 — Authorization:** AI generation, roadmap access, enrollment, and private generated-course access enforce authentication, plan entitlements and ownership on the server.
- **PR-04 — No fabricated evidence:** do not invent video URLs, course duration, official syllabi, exam rounds, hiring facts or provider metadata.
- **PR-05 — Explain partial availability:** show what is ready and what is missing; do not label an incomplete roadmap as fully resource-covered.
- **PR-06 — Accessible resilient UX:** loading, empty, error, retry, cancel and partial states must be keyboard-accessible and understandable without relying only on color.

### 4.2 Normal Search requirements
- **NS-01:** return only published, non-deleted, non-archived and publication-approved catalog courses.
- **NS-02:** direct course matches take precedence over generated standalone module matches.
- **NS-03:** a standalone module result must be deduplicated by its source course/module identity and pass publication/readiness rules.
- **NS-04:** external recommendations display source, title, level/language where known, and actual runtime where available; unknown values remain unknown rather than inferred.
- **NS-05:** external recommendations are not silently persisted as public BuddyForStudy courses.
- **NS-06:** an external provider failure must leave valid catalog results usable and show a non-blocking fallback message.
- **NS-07:** normal catalog search must have a bounded latency/quota budget and a documented provider-call policy.
- **NS-08 (D-01):** Normal Search must make zero Gemini calls, including indirect calls through shared curation services. If the shared ranking engine is reused, Normal Search must use a deterministic/non-LLM syllabus or topic-expansion path, or bypass that stage entirely.

### 4.3 Build with AI requirements
- **AI-01:** a roadmap must be based on a validated profile with explicit/inferred fields and confidence/assumption visibility.
- **AI-02:** question order and applicability depend on goal/domain; high-confidence known fields are not redundantly asked.
- **AI-03:** optional questions can be skipped; learners can revise assumptions before generation.
- **AI-04:** known skills and selected depth influence the roadmap graph and workload.
- **AI-05:** the system distinguishes curriculum study time, learner schedule time and external video runtime. They must not be represented as interchangeable numbers.
- **AI-06 (D-05 approved):** prioritize the learner's selected resource language. Never silently substitute another language. Other-language resources may be offered as clearly labelled alternatives, and must not enter the learning path unless the learner explicitly selects one. Continue to enforce the approved level/duration policy or transparently state that the requested match could not be found.
- **AI-07:** roadmap nodes have explicit states; one failed resource lookup must not erase unrelated completed nodes.
- **AI-08:** sync and async modes return equivalent learner-visible roadmap data and failure semantics.
- **AI-09:** generation is idempotent under duplicate submissions, and a learner can safely refresh/resume an async build.
- **AI-10:** learner-specific generated roadmaps/courses remain private to their owner. Admin-configured automatic approval may publish only eligible non-private, non-archived AI courses after readiness checks pass; manual approval requires admin review. Publication, visibility, pricing and enrollment must remain separately enforced.

## 5. Decisions that require product-owner confirmation

**Decision log**
- **D-01 — APPROVED (2026-11-14):** Gemini is used only by Build with AI. Normal Search must not call Gemini directly or indirectly. Normal Search may continue to use deterministic catalogue and YouTube discovery/ranking logic. The current curateNormalSearch path is not compliant until its Gemini-backed topic-syllabus dependency is removed or bypassed.
- **D-02 through D-04, D-06 and D-08 — OPEN:** pending separate product-owner decisions. **D-05 approved (2026-11-14):** the learner's selected resource language is the preferred language; other-language resources may be shown as clearly labelled alternatives, and the learner must explicitly select a fallback before it is added to the learning path. **D-07 approved (2026-11-14):** retain the admin-configurable `manual` / `automatic` AI-course approval policy; learner-specific private courses remain private and unpublished; automatic approval can publish only non-private, non-archived courses that pass readiness checks. Visibility, pricing and enrollment remain explicit policy-controlled states rather than side effects of approval.


| ID | Decision | Why it matters | Current evidence / conflict |
|---|---|---|---|
| D-01 | Should Normal Search call Gemini at all? | Latency, cost and separation of intent | APPROVED 2026-11-14: No. Gemini is reserved for Build with AI. Current main still has a Gemini-capable path under curateNormalSearch; remove that indirect dependency when implementing the approved behavior. |
| D-02 | Should external recommendations appear alongside local courses, or only when local results are absent? | Relevance and page density | OPEN. Current main returns supplementary resources for any non-empty query; test-branch plan specifies fallback-only. D-01 only prohibits Gemini and does not decide placement. |
| D-03 | Should module matches create/reuse a standalone BuddyForStudy course, or remain a non-persistent recommendation? | Catalog integrity, moderation and pricing | Current main creates/reuses module-course records and applies approval/publication policy. |
| D-04 | Which goal/depth/language defaults should be visible and editable? | Learner control and answer quality | Legacy defaults and target intent profile coexist; live Intent V2 frontend is hard-disabled in source. |
| D-05 | Is resource language a strict requirement or a ranked preference with clearly-labelled fallbacks? | Prevents silent language substitution and preserves learner control. | **APPROVED 2026-11-14 — Preferred language + transparent fallback:** prioritize the learner's selected language; show any other-language resources as clearly labelled alternatives; require explicit learner selection before adding a fallback to the learning path. |
| D-06 | What is the authoritative meaning of roadmap duration? | Prevents confusion between estimated study hours and video runtime. | Profile has schedule/depth fields and nodes have duration policies; UI currently exposes depth bands. |
| D-07 | What approval policy applies to generated AI courses before enrollment/public listing? | Protects catalog quality and learner access. | **APPROVED 2026-11-14:** keep the existing admin-configurable `manual` / `automatic` policy. Manual remains the default when unset. Automatic approval may publish only a non-private, non-archived course after readiness checks pass. Learner-specific private roadmaps/courses remain private and unpublished even under automatic approval. Approval does not itself grant enrollment or override separate visibility/pricing rules. Verified in `contentApprovalPolicy.service.js`, `typedSettingsRegistry.js`, `Course.js` and `courseApprovalPolicy.test.js`. |
| D-08 | Which retry/resume guarantees are required after server restart? | Determines durable queue and worker architecture. | Async drafts/admission records exist; the worker is not yet deployed in Render and roadmap-job durability needs a separate Task 04 decision. |

## 6. Product metrics to define before launch

Do not set numeric targets without a baseline. Define and measure:
- Normal Search: successful search rate, zero-result rate, useful catalog click-through, external recommendation click-through, provider failure rate, p50/p95 latency, quota units/search.
- Build with AI: intent parse success/fallback rate, question skip/change rate, build start-to-ready time, successful completion rate, refresh/resume success, node resource coverage, language-match rate, duration-policy match rate and retry rate.
- Learning outcomes: roadmap enrollment conversion, module/lesson completion and learner feedback (`helpful`, `outdated`, `wrong_level`, `completed`, `abandoned` where collected).

## 7. Non-goals for this requirements phase

- No frontend redesign or API changes.
- No schema migration or data backfill.
- No live Gemini/YouTube smoke calls.
- No Render worker creation or production feature-flag changes.
- No automatic enabling of Intent V2 or Async Roadmap.

## 8. Evidence reviewed

- `client/src/pages/Courses.tsx`
- `server/src/controllers/course.controller.js`
- `server/src/services/course.service.js`
- `server/src/services/courseCurationDecisionEngine.service.js`
- `server/src/services/discovery.service.js`
- `server/src/routes/ai.routes.js`
- `server/src/controllers/ai.controller.js`
- `server/src/routes/intent.routes.js`
- `server/src/controllers/intent.controller.js`
- `server/src/services/intent.service.js`
- `docs/Build with AI v2 Implementation Guide.md`
- `docs/BUILD_WITH_AI_V2_ROLLOUT.md`
- `docs/SEARCH_FLOW_V2_PLAN.md` (document describes itself as a test-branch plan; treated as a proposal, not proof of current-main behavior)

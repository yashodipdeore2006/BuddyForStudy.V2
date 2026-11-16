# Product Requirements Draft — Normal Search & Build with AI

**Status:** Draft v1.0 — product decisions D-01 through D-08 approved as of 2026-11-15; architecture, implementation and validation remain pending  
**Reviewed baseline:** `main` at `eb2f4af7ea85723d1f4940e61ffcb7962319e494`  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Tracking issue:** [#43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Scope:** Learner-facing Normal Course Search and Build with AI. This is a requirements artifact only; no product code or production configuration has been changed.

## 1. Purpose and product boundary

BuddyForStudy exposes two distinct ways to find learning:

1. **Normal Search** helps a learner discover already-published BuddyForStudy courses and relevant learning resources for a topic.
2. **Build with AI** creates a personalized learning roadmap/course based on the learner's goal, current skills, level, available study time, deadline, and resource-language preferences.

These experiences may share policy-cleared resource-candidate discovery utilities, but they have different user intent, latency expectations, data lifecycle, and output contracts. They must not be presented as the same action. Shared code does not waive YouTube API policy review for derived metrics or ranking.

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

**Approved product decision D-01 (2026-11-14): Gemini is reserved for Build with AI.** Normal Search must not invoke Gemini directly or indirectly. It may use the catalogue and policy-permitted YouTube candidate discovery/factual metadata services, subject to Task 04 defining a no-Gemini path. Custom API-derived scores, metrics or ranked ordering remain blocked until ADR-004/ADR-005 policy clearance. The current implementation does not yet satisfy this decision because the curateNormalSearch path can invoke a Gemini-backed topic-syllabus generator. This is a documented implementation gap, not a completed code change.

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
6. Show external YouTube recommendations only as a fallback when neither a suitable direct published course nor a suitable published module/standalone course is available (D-02). Include enough metadata to assess topic fit, level, language, duration and source.
7. Learner opens a BuddyForStudy course to inspect details or follows an external resource to its original provider.
8. A learner who needs a customized syllabus can explicitly switch to **Build with AI**.

**Proposed behavioral requirements**
- Searching must never silently start a personalized roadmap or enroll the learner.
- Catalog access and external YouTube-discovery failures must be isolated: a YouTube outage must not erase valid catalog results. Normal Search must not depend on Gemini availability because D-01 prohibits Gemini calls in this flow.
- External recommendations must remain distinguishable from published BuddyForStudy courses and must not be represented as enrolled/owned courses.
- Search results must be deduplicated and stable across pagination.
- Resource metadata must not claim that a video covers content that has not been verified. Current curation evidence is based on metadata/structure; it does not watch the video or verify a transcript.

### Journey B — Build with AI

1. Learner explicitly selects **Build with AI** and enters a learning topic or outcome. A topic alone is a valid starting point; the learner is not required to complete a long questionnaire first.
2. The system checks authentication and feature entitlement before starting paid/limited AI work.
3. The topic is parsed into a structured intent profile. Unsupported or invalid topics receive clear guidance and examples; they do not proceed to curriculum generation.
4. Under approved D-04 adaptive onboarding, AI proposes a provisional learning goal and skill level. It asks only a few targeted questions for missing or low-confidence information, adapting follow-ups to the learner's answers. A learner may answer that they are unsure.
5. The learner can skip optional questions, correct inferred answers, and review the profile before generation. The review must distinguish learner-confirmed values, AI-inferred assumptions and unknown fields; the learner confirms the profile before roadmap generation.
6. The profile captures, as applicable: goal, domain, narrow/broad scope, level, known skills, daily study time, study days, deadline, language, target role/company, exam/date/syllabus, project idea and learning preferences.
7. The system generates an ordered roadmap and explains its structure, expected workload and any assumptions.
8. Each skill/lesson receives a suitable learning resource or an explicit state explaining why a resource is pending, unavailable, low-confidence or failed.
9. The learner can inspect the roadmap, then use the supported course details/enrollment path when the generated course is approved and available.
10. For async generation, learners can see progress, refresh/resume, retry eligible failures and cancel a build where supported.

**D-04 approved adaptive topic-only onboarding**
- A topic-only entry must be accepted without requiring the learner to know their career goal, level or preferred roadmap structure in advance.
- AI proposes a provisional goal and skill level from the topic and available context. These are assumptions, not confirmed facts; confidence and unknowns must remain visible.
- Ask a small number of high-value, adaptive questions to resolve missing or low-confidence information, such as learning goal, prior experience/known skills and available study time. Do not repeat questions for high-confidence fields already supplied by the learner.
- Allow an explicit “not sure” answer and allow optional questions to be skipped.
- Before generation, show a profile review that separates learner-confirmed values from AI-inferred values and unknowns. Learners can edit the assumptions and must confirm the profile before the roadmap is generated.
- This is a product behavior decision, not approval to enable the currently hard-disabled Intent V2 frontend or change production feature flags; those remain subject to architecture, QA and rollout gates.

**Goal-specific content target from the implementation guide**
- **Job-ready:** skill path plus interview preparation; company/role-specific content only when supported by retrieved evidence, with community-reported information labelled.
- **Exam:** syllabus-mapped units, an exam-date-aware revision plan and mock-test/practice nodes. Typical objectives must be labelled as typical when the official/user-provided syllabus is unavailable.
- **Project:** skills required for the stated project, milestones and build tutorials; unrelated skills should not be added without a reason.
- **Learn:** fundamentals, practice/assessment and a small applied project; no interview or exam module by default.


### Journey B lifecycle, partial completion and recovery

The learner-facing lifecycle must make the difference between generation progress, curriculum readiness and resource coverage explicit.

**Roadmap lifecycle states**

| State | Learner experience | Allowed next actions |
|---|---|---|
| `draft` | Confirmed profile is saved; generation has not been finalized | Edit profile, finalize, or discard |
| `queued` | Build is accepted and waiting for a worker | View progress or cancel |
| `running` | Curriculum and/or lesson resources are being prepared | View progress, refresh/resume, or cancel |
| `cancelling` | Cancellation was accepted and in-flight work is settling | View final cancellation result |
| `completed` | Curriculum and required resource work completed under the selected quality policy | View roadmap |
| `completed_with_warnings` | Usable roadmap exists, but one or more nodes remain unresolved or have alternatives only | View ready nodes, inspect warnings, retry eligible nodes |
| `cancelled` | No new work will be scheduled; already completed outputs remain inspectable | View saved partial result or explicitly start a new build |
| `failed` | Build cannot continue automatically because a non-retryable error occurred or retry budget was exhausted | View actionable error and support/retry guidance |

A state transition must be persisted before it is exposed as authoritative. Terminal states are `completed`, `completed_with_warnings`, `cancelled` and `failed`. A refresh or reconnect must read the persisted state; it must never infer that a build is new merely because the browser lost its in-memory state.

**Per-node states**

Use the node states defined in the target architecture: `pending`, `queued`, `ready`, `low_confidence`, `unavailable`, `quota_limited`, `failed_retryable`, `failed_permanent` and `skipped`. A node's state must not overwrite the state or selected resource of another node. A roadmap is not fully resource-covered while any required node is unresolved.

**Progress presentation**

- Show overall lifecycle state, completed/total node counts, and a concise current activity label.
- Show curriculum generation separately from resource curation; video runtime is not a proxy for roadmap completion.
- Each node shows its own state and, where relevant, a safe reason such as provider quota, no suitable preferred-language match, or a retryable provider error.
- Label partial output as **Ready with warnings** or **Partially ready**; never use the fully completed state or a 100% resource-coverage claim while required nodes remain unresolved.
- Progress must be derived from persisted job/node state, not from a client-side timer or an optimistic counter.

**Refresh, reconnect and resume**

1. The client retains the opaque draft/job identifier and retrieves the owner-scoped status after refresh or reconnect.
2. If the job is queued or running, the client resumes observing the same job through the event stream or bounded polling; it does not submit a second build.
3. If the job is terminal, the client renders the persisted result and does not enqueue work again.
4. Completed curriculum and ready nodes remain unchanged during recovery. Only pending, expired-lease or retry-eligible work is resumed.
5. A changed confirmed profile is a new build with a new idempotency identity; it must not mutate the input of an existing job.

**Retry**

- Retry is offered only for `failed_retryable`, `quota_limited` or otherwise explicitly retryable nodes.
- Retry preserves ready nodes and the generated curriculum; it does not restart the entire roadmap.
- Permanent failures and exhausted retry budgets do not expose an enabled retry action. Show a safe reason and support path instead.
- Retries use bounded attempts/backoff and stable operation identities so duplicate clicks or reconnects cannot duplicate side effects.
- A provider quota outage is reported as a temporary availability problem, not as evidence that the learner's skill or curriculum is invalid.

**Cancellation**

- Cancellation is owner-authorized and idempotent. Repeated cancellation requests return the same job state.
- Queued work is prevented from starting. In-flight provider calls may finish, but their late results must not schedule additional nodes or cause duplicate course creation, publication, enrollment or billing side effects after cancellation wins.
- The job transitions through `cancelling` when work is settling and then to `cancelled`.
- Completed curriculum and node outputs remain saved and inspectable; unfinished nodes remain marked as unfinished. Cancellation does not silently publish a course or enroll the learner.
- Cancellation is distinct from deletion. Any later deletion follows the separate privacy/data-deletion contract.

**Sync/async parity**

- Both modes validate the same confirmed-profile DTO and enforce the same authentication, entitlement, ownership, quality, language, duration and privacy rules.
- Both modes return the same learner-visible roadmap, schedule, resource summary, per-node states, warnings and typed failure categories.
- Sync returns a final result or a typed failure; it must not leave hidden background work running after the request has ended.
- Async returns a job identifier and persisted lifecycle state; refresh/resume observes that same job.
- The sync/async transport difference must not change course ownership, approval, visibility, pricing or enrollment behavior.



### D-07 — Admin approval, publication, visibility, pricing and enrollment lifecycle

D-07 preserves the existing admin-configurable `content_approval_ai_courses` modes (`manual` and `automatic`). The mode controls the moderation decision for generated/assembled courses; it does not collapse approval, publication, visibility, pricing or learner access into one state.

**Course lifecycle dimensions**

| Dimension | Current persisted values / controls | Meaning |
|---|---|---|
| Moderation | `aiReviewStatus: not_required / pending / approved / rejected`; `aiReviewSource: manual / automatic` | Whether the generated course passed the configured content-approval policy and how that decision was made |
| Publication | `status: draft / published / archived` and `isPublished` | Whether the course is available in the public catalogue; the boolean and status must remain consistent |
| Visibility | `visibility: public / private`; `createdForUser` | Who may discover/open the course; learner-specific roadmaps are owner-private |
| Readiness | `evaluateCourseReadiness(course)` | Whether required course metadata, outcomes, modules and usable learning items satisfy publication readiness |
| Pricing | `pricing.mode: free / paid`, base price, compare-at price, currency and optional sale fields | What the learner is charged; it does not approve or publish a course |
| Enrollment | `enrollmentEnabled` plus a separate Enrollment record | Whether an eligible learner may request access and the resulting access source/status |

**Target transition matrix**

| Event / condition | Moderation result | Publication / visibility result | Pricing / enrollment result |
|---|---|---|---|
| Generated course created in manual mode (default if unset) | `pending`, source `manual` | `draft`, unpublished; learner-specific course remains private and owner-scoped | Pricing policy may assign a price independently; no enrollment is created |
| Generated non-private course created in automatic mode and passes readiness | `approved`, source `automatic` | `published`, public, unless explicitly archived | Apply the configured generated-course pricing policy; no enrollment is created |
| Generated non-private course created in automatic mode but fails readiness | `approved`, source `automatic` | Remains `draft` and unpublished until readiness is repaired and publication is re-evaluated | Pricing remains independent; no enrollment is created |
| Learner-specific course under automatic mode | Automatic policy provenance may be recorded, but private ownership is preserved | Must remain `draft`, unpublished and `private`; `createdForUser` must identify the owner | No public catalogue listing or public enrollment; owner access follows the private-course access policy |
| Manual admin rejects a submission | `rejected`, with reviewer and decision note/audit | Must remain unpublished and unavailable in public search | Existing price configuration does not override rejection; no new enrollment |
| Manual admin approves a submission | `approved`, with reviewer and timestamp | Approval alone is not publication: publish only after readiness passes, the course is non-private, non-archived and an explicit publication action/policy permits it | Pricing remains a separate admin/policy decision; enrollment remains a separate learner action |
| Course is archived or soft-deleted | Approval history is retained | `archived` or deleted; excluded from public discovery and new enrollment | Existing enrollment/access handling must follow an explicit archival/deletion policy; never silently create new enrollment |
| Admin changes price or free/paid mode | No moderation change | No automatic publication or visibility change | Validate pricing; paid courses require a valid positive price and eligible checkout/access path |
| Learner enrolls in an eligible free course | No moderation change | Course must be available to that learner (published public course or approved owner-private course) | Create/reuse enrollment separately; free individual enrollment does not require a subscription |
| Learner enrolls in an eligible paid course | No moderation change | Same availability/ownership checks | Require verified individual purchase or an active plan with the published-course entitlement; reject invalid pricing closed |
| Admin disables enrollment | No moderation change | Course may remain visible according to publication/visibility policy | Block new enrollment; do not confuse this with unpublishing or revoking an existing enrollment |
| Enrollment is cancelled/revoked | No course moderation change | Course remains published/visible according to its own state | Update the enrollment/access record; admin revocation must not be bypassed by learner self-reactivation |

**Manual moderation workflow**

1. New generated/assembled course enters `pending` review and remains a draft/unpublished.
2. Admin reviews course quality/readiness and records approve or reject, reviewer identity, timestamp and decision note.
3. Rejection keeps the course unpublished. A correction/resubmission path must be explicit and auditable; do not silently convert rejected content to approved.
4. Approval changes moderation state only. A separate publication decision checks readiness, public/private visibility and archive/deletion state.
5. Only a public, published, non-deleted, non-archived and approval-eligible course can enter Normal Search.

**Automatic moderation workflow**

- The setting is admin-controlled and accepts only `manual` or `automatic`; when unset or invalid, use the safe `manual` default.
- Automatic approval records `aiReviewSource: automatic` and an approval timestamp.
- Publication still requires `evaluateCourseReadiness(course).ready`, non-private ownership, and non-archived state.
- Learner-specific courses must remain private/unpublished regardless of automatic mode. The current Course model hook has a special guard for `visibility: private` plus `createdForUser`; the synchronous Build with AI creation path was previously identified as missing those ownership fields and must be corrected in implementation.
- Automatic approval does not grant enrollment, payment, subscription entitlement, or admin permission.

**Pricing and enrollment invariants**

- Generated-course pricing policy is independent from content approval. The current default generated pricing policy is enabled for `discovery` courses only; other generation modes must not be assumed to receive that policy unless configured in `applyTo`.
- Pricing supports free/paid modes, INR currency defaults, base price, compare-at price and optional sale price. Paid pricing must have a positive base price; an enabled sale must be positive and lower than the base price.
- A missing/unknown pricing mode fails closed for learner enrollment; it must never be treated as free.
- Enrollment requires an eligible published public course or an approved private course owned by that learner, `enrollmentEnabled !== false`, and the applicable payment/subscription check.
- Free courses may be enrolled individually without a subscription. Paid courses require a verified individual payment or an active plan with the published-course entitlement.
- Creating or approving a course never creates an Enrollment record. The learner must explicitly enroll or complete the supported purchase flow.
- Enrollment access source (`self`, `admin`, `subscription`) and enrollment status (`active`, `completed`, `cancelled`) remain distinct from learning progress (`not-started`, `in-progress`, `completed`).
- An admin-revoked enrollment must not be reactivated by the learner; access removal is separate from course unpublishing.

**Known current-code evidence and gaps**

- `content_approval_ai_courses` is registered as a typed enum with `manual` and `automatic`; `contentApprovalPolicy.service.js` defaults missing/invalid values to `manual`.
- `Course.js` applies generated-course pricing and moderation in its pre-validation hook. Automatic approval records provenance, but publishes only when readiness passes and the course is neither learner-private nor archived. Manual mode forces a generated course to draft/unpublished and pending review.
- `evaluateCourseReadiness` checks required course fields, outcomes, modules, lesson types and usable tutorial/project/quiz content. A YouTube video is not mandatory if a tutorial has usable text/resources.
- `enrollment.service.js` separately checks course publication/owner-private eligibility, enrollment enablement, pricing validity, verified payment or subscription entitlement, and existing/revoked enrollment state.
- The current Course model contains no separate `rejected` publication status; rejection belongs to `aiReviewStatus`. Keep moderation state and publication status separate.
- Target implementation must verify that manual approval/rejection endpoints consistently write reviewer, timestamp and note; that approval does not bypass readiness; and that sync/async generated-course creation applies the same owner-private policy.


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
- **NS-02 (D-03 approved):** when a query matches a module in an existing published course and there is no direct course match, create or reuse a standalone BuddyForStudy course for that module. Direct course matches retain precedence.
- **NS-03:** a standalone module result must be deduplicated by its source course/module identity and pass the configured approval, publication and readiness rules before appearing in the public search catalogue.
- **NS-04 (D-02):** external YouTube recommendations are fallback-only. Attempt suitable direct published course matches first; if absent, attempt eligible published module/standalone-course matches. Invoke external YouTube recommendation discovery only when neither local path produces a suitable result. Recommendations display source, title, level/language where known, and actual runtime where available; unknown values remain unknown rather than inferred.
- **NS-05:** external recommendations are not silently persisted as public BuddyForStudy courses.
- **NS-06:** an external provider failure must leave the no-local-result state usable and show a non-blocking fallback message. Do not call the external provider when suitable local results already satisfy the query.
- **NS-07:** normal catalog search must have a bounded latency/quota budget and a documented provider-call policy.
- **NS-08 (D-01):** Normal Search must make zero Gemini calls, including indirect calls through shared curation services. If shared candidate-discovery components are reused, Normal Search must use a deterministic/non-LLM topic-expansion path or bypass that stage entirely; shared components must still comply with the YouTube API-derived metric gate in ADR-004/ADR-005.

### 4.3 Build with AI requirements
- **AI-01 (D-04):** a roadmap must be based on a validated profile with learner-confirmed, AI-inferred and unknown fields visibly distinguished; inferred values must include confidence/assumption visibility.
- **AI-02 (D-04):** question order and applicability depend on goal/domain; ask only a few targeted questions for missing/low-confidence information and do not redundantly ask for high-confidence known fields.
- **AI-03 (D-04):** optional questions can be skipped, “not sure” is a valid response where applicable, and learners can revise AI assumptions and confirm the profile before generation.
- **AI-12 (D-04):** topic-only entry is a supported starting point. The system proposes a provisional learning goal and skill level, uses adaptive follow-up questions to resolve material unknowns, and presents an editable profile review before generation. It must not represent inferred values as learner-confirmed facts. Enabling Intent V2 or changing production flags is not implied by this product approval.
- **AI-04:** known skills and selected depth influence the roadmap graph and workload.
- **AI-05 (D-06):** the system displays estimated total learning effort in hours, estimated completion timeline in weeks, and the recommended weekly/daily study schedule as separate values. External video runtime is displayed separately and must not be conflated with curriculum effort or completion timeline. Calculate the week estimate from the estimated learning effort and the learner's available study schedule; state assumptions such as study days per week. If the learner has not supplied a schedule, show a clearly labelled provisional estimate or ask for the minimum missing input rather than presenting false precision.
- **AI-06 (D-05 approved):** prioritize the learner's selected resource language. Never silently substitute another language. Other-language resources may be offered as clearly labelled alternatives, and must not enter the learning path unless the learner explicitly selects one. Continue to enforce the approved level/duration policy or transparently state that the requested match could not be found.
- **AI-07:** roadmap nodes have explicit states; one failed resource lookup must not erase unrelated completed nodes.
- **AI-08:** sync and async modes return equivalent learner-visible roadmap data and failure semantics.
- **AI-09 (D-08):** generation is idempotent under duplicate submissions, and a learner can safely refresh/resume an async build. The job record and per-step/node state must survive API and worker restarts. Recovery must automatically reclaim unfinished work, preserve completed outputs, and retry only eligible unfinished/failed steps without duplicating side effects. Permanent failures must remain visible with a safe retry or support path; the learner must not be forced to restart the entire roadmap.
- **AI-10:** learner-specific generated roadmaps/courses remain private to their owner. Admin-configured automatic approval may publish only eligible non-private, non-archived AI courses after readiness checks pass; manual approval requires admin review. Publication, visibility, pricing and enrollment must remain separately enforced.
- **AI-11 (D-08):** roadmap generation uses durable background processing or an equivalent recoverable job store. Persist job identity, owner, idempotency key, lifecycle state, attempts/lease metadata, progress and completed node outputs. A restarted worker must resume pending or expired-lease work from persisted state. Reprocessing must be idempotent; retries must be bounded and classified; exhausted/permanent failures must be observable and actionable. Do not assume Redis, MongoDB or a specific queue product until Task 04 evaluates deployment topology and trade-offs.

## 5. Decision register and approvals

**Decision log**
- **D-01 — APPROVED (2026-11-14):** Gemini is used only by Build with AI. Normal Search must not call Gemini directly or indirectly. Normal Search may use deterministic catalogue logic and policy-permitted YouTube candidate discovery with factual metadata. Custom API-derived ranking/quality metrics are not authorized until ADR-004/ADR-005 policy clearance. The current curateNormalSearch path is not compliant until its Gemini-backed topic-syllabus dependency is removed or bypassed.
- **D-06 approved (2026-11-14):** display total estimated learning effort in hours, completion timeline in weeks calculated from study availability, and the recommended study schedule separately; show video runtime independently. Make assumptions visible and avoid false precision when study availability is unknown. **D-02 approved (2026-11-15):** external YouTube recommendations are fallback-only; search suitable published courses first, then eligible published module/standalone-course matches, and call external YouTube discovery only if neither local path yields a suitable result. **D-04 approved (2026-11-14):** use adaptive onboarding for topic-only learners; AI proposes a provisional goal and level, asks a few targeted adaptive questions for missing/low-confidence information, accepts “not sure” and skipped optional questions, and presents an editable review that separates confirmed values, inferred assumptions and unknowns before generation. **D-03 approved (2026-11-14):** retain the standalone-course approach for module matches: when no direct course match exists, create or reuse a standalone course sourced from the matching published module. Deduplicate by source course/module identity and enforce approval, publication and readiness gates. Direct course matches take precedence. **D-05 approved (2026-11-14):** the learner's selected resource language is the preferred language; other-language resources may be shown as clearly labelled alternatives, and the learner must explicitly select a fallback before it is added to the learning path. **D-07 approved (2026-11-14):** retain the admin-configurable `manual` / `automatic` AI-course approval policy; learner-specific private courses remain private and unpublished; automatic approval can publish only non-private, non-archived courses that pass readiness checks. Visibility, pricing and enrollment remain explicit policy-controlled states rather than side effects of approval. **D-08 approved (2026-11-14):** roadmap generation must survive API/worker restarts with durable job and node state, automatic recovery, idempotent processing, bounded retries and visible actionable failures. Exact queue/storage technology remains a Task 04 architecture decision.


| ID | Decision | Why it matters | Current evidence / conflict |
|---|---|---|---|
| D-01 | Should Normal Search call Gemini at all? | Latency, cost and separation of intent | APPROVED 2026-11-14: No. Gemini is reserved for Build with AI. Current main still has a Gemini-capable path under curateNormalSearch; remove that indirect dependency when implementing the approved behavior. |
| D-02 | Should external recommendations appear alongside local courses, or only when local results are absent? | Relevance and page density | **APPROVED 2026-11-15 — Fallback-only (explicit product-owner selection):** search suitable published BuddyForStudy courses first; if none, search eligible published modules/standalone courses; show external YouTube recommendations only when neither local path yields a suitable result. Current main returns supplementary resources for any non-empty query, so this is an implementation gap for the later implementation phase. |
| D-03 | Should module matches create/reuse a standalone BuddyForStudy course, or remain a non-persistent recommendation? | Catalog integrity, moderation and pricing | **APPROVED 2026-11-14 — Create/reuse a standalone course:** if there is no direct course match, a matching published module is represented as a standalone BuddyForStudy course. Reuse/deduplicate by source course/module identity. The standalone course must pass configured approval, publication and readiness rules before public search visibility. Direct course matches take precedence. This retains the current main behavior. |
| D-04 | How should a learner who enters only a topic be onboarded? | Minimize onboarding friction while avoiding unsupported assumptions in personalization. | **APPROVED 2026-11-14 — Adaptive onboarding:** accept topic-only entry; propose a provisional goal and skill level; ask a few targeted adaptive questions for missing/low-confidence fields; allow “not sure” and optional skips; show confirmed, inferred and unknown profile values separately; let the learner edit and confirm before generation. This does not itself enable Intent V2 or change production flags. |
| D-05 | Is resource language a strict requirement or a ranked preference with clearly-labelled fallbacks? | Prevents silent language substitution and preserves learner control. | **APPROVED 2026-11-14 — Preferred language + transparent fallback:** prioritize the learner's selected language; show any other-language resources as clearly labelled alternatives; require explicit learner selection before adding a fallback to the learning path. |
| D-06 | What is the authoritative meaning of roadmap duration? | Prevents confusion between estimated study hours and video runtime. | **APPROVED 2026-11-14 — Display hours and weeks separately:** show estimated total learning effort in hours, estimated completion timeline in weeks based on the learner's study schedule, and the recommended study schedule. Show external video runtime as a separate metric. State schedule assumptions and avoid false precision when availability is unknown. |
| D-07 | What approval policy applies to generated AI courses before enrollment/public listing? | Protects catalog quality and learner access. | **APPROVED 2026-11-14:** keep the existing admin-configurable `manual` / `automatic` policy. Manual remains the default when unset. Automatic approval may publish only a non-private, non-archived course after readiness checks pass. Learner-specific private roadmaps/courses remain private and unpublished even under automatic approval. Approval does not itself grant enrollment or override separate visibility/pricing rules. Verified in `contentApprovalPolicy.service.js`, `typedSettingsRegistry.js`, `Course.js` and `courseApprovalPolicy.test.js`. |
| D-08 | Which retry/resume guarantees are required after server restart? | Determines durable queue and worker architecture. | **APPROVED 2026-11-14 — Durable processing with automatic recovery:** job and per-step/node state survive API/worker restarts; unfinished work is automatically recovered; completed outputs are preserved; processing is idempotent with bounded, classified retries and visible permanent failures. Exact queue/storage technology, lease protocol and deployment topology remain Task 04 architecture decisions. Current async flow uses an in-process queue with Mongo-backed draft/admission records; the Render worker is not yet deployed. |

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

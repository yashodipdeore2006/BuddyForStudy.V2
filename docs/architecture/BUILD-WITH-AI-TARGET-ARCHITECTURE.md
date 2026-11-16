# Build with AI — Target Architecture and API Contracts

**Status:** Architecture draft v0.2 — source-mapped and cross-document wording aligned 2026-11-16; owner approval, implementation and technical validation pending  
**Baseline:** `main` at `eb2f4af7ea85723d1f4940e61ffcb7962319e494`  
**Product decisions:** D-04 adaptive topic-only onboarding; D-05 explicit language fallback; D-06 distinct learning effort/timeline/video runtime; D-07 manual/automatic moderation with private learner roadmaps; D-08 durable restart recovery  
**Tracking:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)

## 1. Purpose and boundaries

Build with AI is an explicit, authenticated journey that turns a learner's topic and confirmed learning profile into a personalized, prerequisite-ordered curriculum, a study schedule, and node-level learning resources.

It is separate from Normal Search:

- **Build with AI** may call Gemini for intent classification and curriculum-template generation.
- **Normal Search** is governed by [ADR-001](ADR-001-normal-search-local-first-gemini-free.md) and must make zero Gemini calls.
- YouTube resource retrieval is a separate provider task. Gemini must not invent, select or return YouTube URLs.
- Course publication, visibility, pricing and enrollment are separate policy-controlled states. Generating a roadmap must not silently enroll a learner.

This document distinguishes verified current behavior from the target contract. It is not evidence that the target architecture is already implemented or enabled in production.

## 2. Current implementation map

### 2.1 Intent intake

- `POST /api/intent/parse` is registered in `server/src/routes/intent.routes.js`. It requires authentication, `ai_course_builder` and `personalized_roadmaps` entitlements, and a 20-request-per-minute limiter.
- `server/src/controllers/intent.controller.js` checks server-side `INTENT_V2`; it returns 404 when the flag is off.
- `server/src/services/intent.service.js` defines `IntentProfile`, calls Gemini for an intent classification (not curriculum generation), validates the returned profile with Zod, derives a deterministic question plan from per-field confidence and caches parsed intent for 30 days.
- Intent parse has a 3-second timeout and returns a static question plan when the provider fails. Parsed results include profile values, confidence values, domain/scope, option lists, questionPlan and assumptions.
- The main-branch `client/src/pages/Courses.tsx` has `INTENT_V2 = false`. The intent-driven UI is therefore not enabled by default in the checked-in client. Frontend and backend rollout flags must be coordinated.

### 2.2 Roadmap generation

- `POST /api/ai/roadmap` is authenticated and protected by `ai_course_builder` and `personalized_roadmaps` feature middleware in `server/src/routes/ai.routes.js`.
- `server/src/controllers/ai.controller.js` validates the legacy input or `IntentProfile`, checks personalized-roadmap/project entitlements, consumes roadmap allowance and obtains a roadmap-admission lease before invoking `generateAIRoadmap`.
- `server/src/services/aiRoadmap.service.js` loads the active prompt, finds or generates a shared curriculum template, personalizes it, builds course modules/lessons, adds goal-specific modules and schedule, and resolves YouTube resources.
- The Gemini curriculum response uses a JSON response schema (`roadmapSchema`). The provider response is parsed as JSON and currently receives a minimal non-empty-skills check before later normalizers and graph repair. A strict, versioned server-side schema validation boundary is required before the template is cached.
- `server/src/services/roadmapTemplate.service.js` caches generic curriculum templates for 30 days, then applies known-skill filtering and learner personalization separately.
- `server/src/services/skillRegistry.service.js` resolves canonical skills and repairs graph structure. `buildCourse` maps skills into modules, tutorial/quiz/project lessons, and goal-specific content.
- In synchronous mode, `generateAIRoadmap` attaches resources before returning. In async mode it saves a curriculum skeleton first; `asyncRoadmap.service.js` resolves individual lesson/project nodes through `curateForNode`.

### 2.3 Current architecture gaps relevant to the approved decisions

1. **Intent UI flag mismatch:** client Intent V2 is hardcoded off while the backend also has a separate server flag. One rollout contract is required.
2. **Clarification/profile contract:** the final generation request must contain the learner's answers and explicitly confirmed profile, not merely the original topic or re-inferred defaults. The main-branch client currently has a legacy/self-paced submission path; do not assume the adaptive intake is live.
3. **Post-parse validation:** Gemini's provider-side `responseSchema` is not a replacement for server-side strict schema validation and semantic checks before caching/persisting.
4. **Template cache identity:** `buildSharedRoadmapTemplateProfile` carries course depth separately, while `buildRoadmapTemplateKey` hashes the normalized topic, goal, level, language, prompt version, outcome and preferences. The cache identity must explicitly include every generation-affecting input, including course depth and schema/prompt version, to prevent incompatible template reuse.
5. **Skill registry matching:** current resolver checks normalized exact names/aliases, slug matches and token similarity at a threshold of 0.8; it reads the full registry and its exact/token matching is not domain-scoped. Ambiguous cross-domain matches need an explicit policy before canonical IDs are treated as stable.
6. **Private-course ownership:** the async path creates courses with private visibility and `createdForUser`; the synchronous `Course.create` call in `generateAIRoadmap` sets `isPublished: true` without setting `createdForUser` or private visibility. The Course model's policy hook can then auto-publish eligible non-private generated courses in automatic mode. This conflicts with D-07 for learner-specific roadmaps. Both sync and async paths must converge on the learner-private ownership contract.
7. **Async durability:** `RoadmapDraft` persists a draft and events, and admission leases have heartbeats; however, `asyncRoadmap.service.js` dispatches work through a process-local array (`queue`). The draft collection also has a one-hour TTL on `createdAt`. Process restart recovery, durable per-step resume and retention must be designed; the present queue does not meet D-08.
8. **Partial resource state:** async node resolution persists node build states and handles quota-limited nodes, but the overall course/draft lifecycle and retry contract must preserve successful outputs and make permanent versus retryable failures explicit.
9. **Language selection:** the node selector is called with one language at a time. The D-05 contract requires preferred-language-first selection and an explicit learner action before an alternative language is attached to the learning path.
10. **Duration semantics:** estimated curriculum learning effort, availability-derived completion timeline, recommended study schedule and external video runtime must remain separate values in both sync and async responses.

## 3. Target component architecture

| Layer | Component | Owns | Must not own |
|---|---|---|---|
| UI | Build with AI wizard | Topic entry, adaptive answers, skip/not-sure actions, profile review/edit/confirm, progress/error presentation | Trusting unreviewed inferred values as confirmed; selecting provider URLs |
| API | Intent controller/service | Auth/entitlements, query validation, Gemini intent classification, confidence normalization, deterministic question plan | Curriculum generation or persistence of a course |
| API | Roadmap controller | Validate confirmed build request, auth/entitlements, allowance/admission, sync/async compatibility | Prompt construction or resource ranking |
| Orchestration | Roadmap application service | Idempotent build lifecycle, template retrieval, skill normalization, personalization, schedule, node job creation, ownership/publication state | Direct raw Gemini response persistence |
| LLM adapter | Gemini intent adapter | Intent classification under `IntentParseV1` | Generating YouTube URLs or deciding user authorization |
| LLM adapter | Gemini curriculum adapter | Generic curriculum template under `RoadmapTemplateV1` | Resource URL retrieval, enrollment/publication, private learner data in shared cache |
| Domain | Skill registry and graph validator | Canonical IDs, aliases, domain context, prerequisites, DAG invariants, topological order | Treating unresolved fuzzy matches as established facts |
| Domain | Curriculum composer | Convert validated skills into modules, lessons, projects, quizzes and goal-specific sections | Inventing verified exam syllabus units |
| Resource | Node curation service | Per-node candidate discovery, factual eligibility, language/duration policy, categorical evidence, provider metadata snapshot, quota and cache | Unapproved API-derived scores/rankings, modifying the canonical skill graph or invoking Gemini |
| Persistence | Template store | Reusable non-user-specific curriculum blueprint | Learner answers, progress or private roadmap course |
| Persistence | Course and roadmap store | Private learner-owned course, module/lesson content, per-node state, source/evidence snapshot | Publishing private learner content |
| Persistence | Durable job store/queue (technology pending) | Job state, node state, leases, attempts, idempotency, recovery and events | Process-local-only queue state |

### Request flow

```mermaid
sequenceDiagram
    actor Learner
    participant UI as Build with AI wizard
    participant Intent as Intent API
    participant Gemini as Gemini
    participant API as Roadmap API
    participant Orchestrator as Roadmap orchestrator
    participant Template as Template store
    participant Skills as Skill registry/graph validator
    participant DB as Course/job persistence
    participant Resources as Node curation/YouTube

    Learner->>UI: Enter topic
    UI->>Intent: POST /api/intent/parse
    Intent->>Gemini: IntentParseV1 request
    Gemini-->>Intent: Profile + confidence + options (JSON)
    Intent-->>UI: Validated profile + adaptive question plan
    Learner->>UI: Answer/skip questions; edit assumptions
    UI-->>Learner: Confirm profile review
    Learner->>UI: Confirm and generate
    UI->>API: RoadmapBuildInputV1
    API->>Orchestrator: Authorized, validated and idempotent request
    Orchestrator->>Template: Lookup compatible generic template
    alt Template cache miss
        Orchestrator->>Gemini: RoadmapTemplateV1 request
        Gemini-->>Orchestrator: Curriculum JSON
        Orchestrator->>Orchestrator: Strict schema + semantic validation
        Orchestrator->>Template: Store valid generic template
    end
    Orchestrator->>Skills: Canonicalize skill IDs and validate DAG
    Skills-->>Orchestrator: Valid topological graph + repair report
    Orchestrator->>Orchestrator: Personalize, compose goal modules and schedule
    Orchestrator->>DB: Persist private course skeleton and build job
    loop Each resource-bearing node
        Orchestrator->>Resources: Resolve preferred-language resource
        Resources-->>Orchestrator: Ready / low-confidence / unavailable / quota-limited
        Orchestrator->>DB: Persist node state and evidence
    end
    Orchestrator-->>API: Roadmap result + per-node states
    API-->>UI: Ready or partial result
    UI-->>Learner: Roadmap, schedule, sources and remaining work
```

## 4. Gemini responsibilities and structured-output contracts

**Versioning and validation proposal:** ADR-006 defines immutable task contract versions, independent prompt versions, strict server-side validation, semantic checks before cache writes, explicit compatibility readers and rollback. Until approved and implemented, the schemas below are target contracts rather than evidence of strict runtime enforcement.

Gemini is a bounded domain adapter, not the system of record. Each model task has its own schema version, prompt version, validation function, timeout, retry policy and telemetry category. Do not pass raw model output directly to Mongoose.

### 4.1 `IntentParseV1`

**Input:** normalized learner topic (2–200 characters), plus no unnecessary personal data.

**Output contract:**
- `valid: boolean`
- `profile: IntentProfile` with topic, domain, scope, goal, level, knownSkills, minutesPerDay, deadline, language, targetRole, targetCompany, examName, examDate, syllabusText, projectIdea, outcome and preferences.
- `confidences`: optional field-keyed model-reported values constrained to 0–1. These are not calibrated probabilities and must retain model/prompt/schema provenance. They may be advisory context for clarification, but must not be exposed as objective accuracy or used as a numeric gate unless a field-specific calibration method/dataset and threshold are approved under the Evidence and Confidence Model.
- `domain`, `scope`, bounded option lists and bounded optional learner-specific questions.
- No generated course modules, provider URLs, credentials, or unsupported sensitive inferences.

**Validation:**
- Apply strict Zod validation server-side after JSON parsing.
- Reject invalid enum, over-limit, malformed or extra fields; normalize language and date formats.
- A missing confidence is unknown/low confidence, not a high-confidence default.
- Defaults inserted by Zod must not be represented as learner-confirmed facts.
- Derive the core question plan deterministically from confidence and goal applicability; any model-suggested learner questions are capped, filtered and treated as untrusted text.
- Cache by normalized topic plus schema/prompt/model version and expiry. Do not treat the intent cache as a learner profile or as proof that a previous user confirmed values.

### 4.2 `RoadmapTemplateV1`

**Input:** canonical topic, domain, level, selected depth and the active prompt/schema version. Shared template generation must not include a user ID, private profile, user answers, deadline, progress or known-skill list.

**Structured output fields:**
- `canonicalTopic`, `title`, `description`, `careerOutcome`, `category`, `learningOutcomes[]`.
- `skills[]`: stable proposed `id`, `name`, `category`, `importance`, `prerequisites[]`, `topics[]`, `searchQueries[]`, `courseDuration` (min/target/max minutes), `practiceProject`, `projectPlacement`, `projectPlan` and `quizPolicy`.
- `capstoneProjects[]`: structured project title, scenario, rationale, features, architecture, milestones, testing checklist, industry skills and video-search query hints.

The current `roadmapSchema` is the baseline for this contract. Version the target contract (for example `roadmap-template.v1`) and validate it with a server-owned strict Zod schema after parsing. Keep list bounds, string lengths, enum values, duration ranges, project fields and quiz-policy bounds explicit. Reject or safely repair malformed values before template caching.

**Semantic validation before cache write:**
- Require a non-empty canonical topic and title.
- Require 3–14 meaningful skills after normalization; do not pass an empty graph or silently invent generic topic coverage to satisfy the minimum.
- Enforce unique skill IDs, valid prerequisites, no self-dependency, no duplicate edges and acyclic graph.
- Enforce realistic ordered duration bounds: `minMinutes <= targetMinutes <= maxMinutes`, all positive and bounded.
- Enforce bounded topics, search queries, project plan fields and quiz policies.
- Reject model-generated video URLs or claims that a resource has already been found.
- Persist only the validated generic template, with prompt/schema version and provenance.

### 4.3 `ExamSyllabusExtractV1`

Only used when the learner supplied syllabus text and the chosen goal is exam preparation.

**Output:** `units[]`, each of which must be checked server-side as a literal substring of the supplied source text. If extraction fails or yields no supported headings, do not invent official units. Keep the exam plan's verified-syllabus coverage empty and explain the limitation.

### 4.4 Provider failure policy

- Intent parse timeout, quota or invalid JSON: return the deterministic static question plan and mark `fallback: true`; do not block topic-only onboarding.
- Curriculum generation: use a compatible validated cached template or approved knowledge-base/topic fallback when available. Otherwise return a typed retryable provider error. Never persist malformed model output.
- Apply bounded retry only to classified transient provider failures; do not loop on invalid schemas, unsupported topics or user validation errors.
- A failed Gemini call must not silently switch to an unrelated curriculum.
- Record model/provider, schema/prompt version, latency, token/cost metadata where available, validation outcome and sanitized error category. Never log API keys or raw private profile text.

## 5. Canonical skill registry and graph contract

### 5.1 Canonical skill record

Target record:

```json
{
  "id": "canonical-skill-id",
  "name": "Canonical display name",
  "aliases": ["recognized alias"],
  "domain": "software",
  "status": "active",
  "registryVersion": 1
}
```

The current `Skill` collection has string `_id`, `name`, `aliases`, `domain` and `createdAt`. The target contract adds explicit registry status/version and a domain-aware matching policy.

### 5.2 Resolution rules

1. Normalize Unicode, case, whitespace and punctuation consistently.
2. Resolve exact canonical ID or exact alias within the relevant domain first.
3. Use an explicit domain-scoped alias/slug match next.
4. Fuzzy matching may resolve only when the best candidate is above a calibrated threshold **and** has a clear margin over the next candidate. Ambiguous matches must not merge aliases automatically; create a proposed new skill or require review.
5. Preserve the source name/alias in the roadmap snapshot, while storing the canonical skill ID as the stable relationship.
6. Canonical ID changes require an alias/migration record; never silently orphan existing roadmaps.

The current resolver has a 0.8 token-similarity threshold, but exact/token lookup is not domain-scoped and only the top score is used. Threshold and margin must be benchmarked before production changes.

### 5.3 Graph invariants

- 3–14 unique canonical skill nodes for the current roadmap contract.
- Every prerequisite points to an existing node; no self-edge or duplicate edge.
- Directed acyclic graph (DAG); output order is a valid topological order.
- Known skills are marked as satisfied/omitted from learner work only after matching against canonical IDs and recognized aliases; retain the learner's original answer and the skipped-node explanation in personalization metadata.
- Repair events must be structured and auditable. Safe deterministic repair may remove invalid/duplicate edges; a cycle repair must report the removed edge and rationale. If a repair would change semantic meaning, reject or request a controlled fallback instead of silently guessing.
- Re-run graph validation after canonical ID mapping and after known-skill filtering.

The existing validator already removes duplicate IDs, invalid/duplicate/self prerequisites, breaks cycles, trims to 14 by importance and inserts generic nodes when fewer than 3 remain. The target must retain audit visibility but avoid presenting synthetic generic nodes as AI-authored topic-specific curriculum.

## 6. Curriculum composition and personalization

The curriculum composer consumes only a validated template and a confirmed profile.

1. Apply course depth (short/medium/complete) using versioned rules and ensure the template cache identity includes depth.
2. Resolve canonical skill IDs and topological ordering.
3. Apply known skills without dropping dependent prerequisites needed for remaining skills.
4. Convert skill topics into tutorial lesson chunks, quiz nodes and skill/project milestones.
5. Add goal-specific structures:
   - **job_ready:** interview preparation and role-relevant modules;
   - **exam:** source-backed syllabus units, date-aware revision and practice;
   - **project:** project requirements, milestones and build workflow;
   - **learn:** core concepts, practice and suitable applied work, without defaulting to interview/exam content.
6. Build the study schedule from confirmed minutes per day, study days per week and relevant deadline/exam date.
7. Return the estimated curriculum learning effort in hours, completion timeline in weeks, recommended weekly/daily schedule, and selected-resource video runtime as four distinct concepts (D-06). State assumptions and never treat video runtime as the curriculum's total study effort.
8. Store both confirmed profile values and inferred/unknown provenance. Do not put learner-specific values into the generic template cache.

## 6.1 Evidence, provenance and confidence

The cross-flow evidence model is specified in [Build with AI Evidence and Confidence Model](BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md). It applies to intent parsing, learner profile, curriculum claims, skill identity, exam-source grounding, resource selection and learning outcomes.

Key constraints:
- Preserve the source class and provenance of every decision-relevant claim: learner-confirmed, learner event, trusted document, provider metadata, human review, model inference, platform rule or unknown.
- Treat model-reported confidence as model output, not a calibrated probability.
- Do not use a universal confidence score. Numeric confidence requires an assessment-specific calibrated method and dataset version.
- A valid Gemini schema is structural validation, not factual verification.
- A watched/completed resource is activity evidence, not proof of mastery.
- Resolve conflicts by claim-specific authority; stale, ambiguous or missing evidence remains stale/unknown/disputed.
- Enforce privacy, retention and provider-specific rules independently of the generic evidence ledger.

## 7. Learning resource selection and evidence contract

The detailed candidate, selected-resource, provider-snapshot and first-party learner-state interface is specified in [Learning Resource Candidate and Selection Contract](LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md). That contract is subordinate to the policy and freshness constraints in [ADR-004](ADR-004-youtube-resource-data-lifecycle.md): it does not authorize API-derived ranking/quality metrics. Selection method approval remains a release gate.

### 7.1 Separation

Gemini generates curriculum structure and search hints. It does not select YouTube videos or verify their content.

Each tutorial/project resource node is sent to the node curation service with:
- canonical skill ID and skill/topic context;
- learner level;
- requested language;
- node-specific required topics and bounded search queries;
- actual node duration bounds and content-type policy;
- goal/role/exam/project context that is allowed for policy-approved candidate selection or factual eligibility checks; it does not authorize an API-derived ranking formula.

The current `curateForNode` source baseline uses the shared candidate engine, injected topic syllabus from skill topics, at most two search queries, a node cache keyed by canonical skill/mode/level/language/duration policy, a numeric low-confidence threshold of 45, and returns a best candidate plus alternatives. These are current implementation facts, not approved target policy. The numeric threshold/score must not be carried into the target selection contract while API-derived scoring is blocked; `low_confidence` may be used only after an approved, policy-permitted, assessment-specific method exists. Quota refusal is represented as retryable `quota_limited`.

### 7.2 Target node state and resource record

Node states should include:
- `pending`, `queued`, `ready`, `low_confidence`, `unavailable`, `quota_limited`, `failed_retryable`, `failed_permanent`, and `skipped`.

A selected-resource record stores provider/type/ID, canonical URL, factual title/channel/duration/language metadata where permitted, snapshot version and successful retrieval timestamp, categorical evidence/provenance, decision/policy version, selected reason or learner-choice requirement, and alternatives. Missing provider metadata remains unknown. Do not persist `matchScore`, numerical resource confidence, quality/coverage/freshness metrics, percentiles or API-derived ranking values unless the exact method is approved under ADR-004/ADR-005 and the evidence model's assessment-specific calibration gate. The candidate-selection contract's categorical evidence vocabulary is authoritative until then.

### 7.3 Language policy (D-05)

1. Search and evaluate the learner's explicitly selected preferred language first.
2. Do not attach a different-language resource to the learning path silently.
3. Other-language matches may be displayed as clearly labelled alternatives.
4. A learner must explicitly select an alternative before it becomes the selected learning-path resource.
5. Store preferred-language evidence and actual resource-language evidence separately; do not infer language from channel country or creator identity.
6. If no suitable preferred-language resource exists, expose the missing-resource state and available labelled alternatives. Preserve the learner's choice; do not downgrade the requested language invisibly.

### 7.4 Evidence limits

Titles, descriptions, tags, chapters, playlist order, duration and language fields are provider metadata/structure evidence. They do not prove that the video was watched, transcript-checked, factually verified or pedagogically effective, and their presence does not authorize custom score/rank derivation. Do not request or use views, likes, subscriber counts or other statistics for candidate ranking while the ADR-004/ADR-005 policy gate is unresolved. UI labels and explanations must reflect categorical evidence and this limitation.

**Quota/provider degradation:** [Build with AI — YouTube Quota and Provider Degradation Contract](BUILD-WITH-AI-YOUTUBE-QUOTA-AND-DEGRADATION-CONTRACT.md) defines separate search/shared quota states, soft/hard degradation, provider/store outage behavior, bounded retries, and the requirement to preserve curriculum and completed nodes. The contract records current sync/async differences and is proposed pending approval and implementation. Its soft-degradation admission policy is not current runtime behavior; see ADR-005 and the quota contract's source-mapped baseline.

## 8. Course ownership, approval and publication (D-07)

- A learner-specific roadmap/course is private to its owner and unpublished by default in both sync and async modes.
- Persist `createdForUser`, `visibility: private`, ownership and the confirmed profile/provenance snapshot for every learner-specific generated course.
- A learner-private course must remain private/unpublished even if admin policy is `automatic`. Automatic approval may publish only eligible non-private, non-archived AI courses after readiness checks.
- Manual mode remains the default when unset. Approval, publication, visibility, pricing and enrollment are independent states.
- Creating a roadmap must not create an enrollment. Enrollment requires its own authorization, availability and pricing checks.
- Sync and async flows must call the same ownership/publication policy. The current synchronous course creation path does not set `createdForUser` or private visibility; this is a D-07 implementation gap to fix.

## 8.1 Governance state machine and learner access (D-07)

Moderation, publication, visibility, pricing and enrollment are independent state dimensions. Do not introduce a single overloaded `approved` or `published` flag as a substitute for the existing fields.

**Moderation transitions**
- Manual mode (default when unset): generated/assembled course starts `aiReviewStatus: pending`, `aiReviewSource: manual`, `status: draft`, `isPublished: false`.
- Admin approval records `approved`, reviewer identity and timestamp. It does not itself publish the course.
- Admin rejection records `rejected` and an auditable decision note; rejected content remains unpublished.
- Automatic mode records `approved` with `aiReviewSource: automatic` and a timestamp. It may publish only when readiness passes and the course is non-private and non-archived.
- A private learner-specific course remains private and unpublished even under automatic mode. Both sync and async generation must persist `createdForUser` and `visibility: private` before validation/policy hooks run.

**Publication gate**
A course is eligible for public catalogue publication only when all are true:
1. `deletedAt === null` and `status !== archived`;
2. `isPublished === true` and `status === published`;
3. visibility is `public`;
4. generated/assembled content has `aiReviewStatus === approved` with valid manual reviewer provenance or automatic-policy provenance;
5. `evaluateCourseReadiness(course).ready === true`.

Approval, readiness and publication must be checked independently by create/update/admin publication services and public search. A private learner course is never a public catalogue result.

**Pricing and access gate**
- Pricing is an independent policy dimension. Generated pricing policy applies only to generation modes listed in `applyTo`; the current default policy applies to `discovery` only.
- Paid courses require a positive base price; an active sale must be positive and lower than base price. Unknown pricing modes fail closed.
- Enrollment is an explicit learner/admin action, not a side effect of roadmap generation, moderation or publication.
- New enrollment requires a published public course or an approved private course owned by the requesting learner, enrollment enabled, and the applicable payment/subscription check.
- Free courses may be enrolled individually; paid courses require a verified individual purchase or active published-course entitlement.
- Keep `Enrollment.status`, `accessSource` and `learningStatus` separate. Admin revocation must not be reversible by a learner self-reactivation.

**Target transition table**

| Trigger | Moderation | Publication / visibility | Enrollment |
|---|---|---|---|
| Generated course, manual mode | pending/manual | draft, unpublished | none |
| Generated non-private course, automatic mode, readiness passes | approved/automatic | published/public | none |
| Automatic mode but readiness fails | approved/automatic | draft, unpublished | none |
| Learner-specific roadmap, either mode | approval provenance retained | private, unpublished, owner-scoped | none |
| Admin approves manually | approved/manual + reviewer | separate readiness/publication gate | none |
| Admin rejects manually | rejected/manual + reviewer/note | draft, unpublished | none |
| Admin archives or deletes | approval history retained | excluded from public discovery | no new enrollment |
| Admin changes pricing | unchanged | unchanged | no implicit enrollment |
| Learner enrolls | unchanged | eligible course required | create/reuse access after entitlement/payment checks |
| Enrollment cancelled/revoked | unchanged | unchanged | access state changes independently |

**Required implementation invariants**
- One shared policy must be used by synchronous and asynchronous Build with AI course creation.
- Approval must never silently override private visibility, readiness, archive state, pricing validity or enrollment entitlement.
- Public catalog queries and course detail endpoints must enforce the same publication/visibility/approval rules.
- Admin actions must be permission-gated and audited with actor, timestamp and reason.
- Manual rejection/resubmission behavior, course archival effects on existing enrollments, and price changes for existing purchases require explicit API/UX contracts before implementation; do not infer refund or retroactive access rules.

## 9. API contracts

**Detailed source-mapped contract:** [Build with AI API Contracts and Backward Compatibility](BUILD-WITH-AI-API-CONTRACTS-AND-COMPATIBILITY.md). It records current sync/async route divergence and proposes versioned DTOs, job-oriented routes, a stable response/error envelope, sync/async parity and a staged legacy compatibility window. The proposal is not implemented or approved.

The contracts below are the target compatibility contract. Preserve existing routes where possible, but use one canonical Build input across sync and async modes.

### 9.1 Intent parse

`POST /api/intent/parse`

Request:

```json
{ "query": "Python for data analysis" }
```

Success returns `valid`, `profile`, `confidences`, `domain`, `scope`, `options`, `questionPlan`, `assumptions`, `fallback` and a schema/version identifier. The learner can edit any inferred field. Invalid topics return a safe invalid-intent response with no roadmap generation.

### 9.2 Confirmed roadmap build request

Target `RoadmapBuildInputV1`:

```json
{
  "schemaVersion": "roadmap-build.v1",
  "profileConfirmed": true,
  "intentProfile": {
    "topic": "Python for data analysis",
    "domain": "data",
    "scope": "broad",
    "goal": "job_ready",
    "level": "Beginner",
    "knownSkills": ["Excel"],
    "minutesPerDay": 60,
    "deadline": null,
    "language": "en",
    "targetRole": "Data Analyst",
    "targetCompany": null,
    "examName": null,
    "examDate": null,
    "syllabusText": null,
    "projectIdea": null,
    "outcome": "Become job-ready",
    "preferences": {
      "courseDepth": "complete",
      "studyDays": "5",
      "resourceLanguages": "en,hi",
      "lessonStyle": "Project-first"
    }
  },
  "profileProvenance": {
    "goal": "learner_confirmed",
    "level": "learner_confirmed",
    "minutesPerDay": "learner_confirmed",
    "targetRole": "learner_confirmed",
    "scope": "learner_confirmed"
  }
}
```

This is an illustrative contract; values and provenance must reflect actual learner interactions. Unknown fields remain `unknown`; an AI inference may not be relabelled as learner-confirmed. Strict validation is required; reject unsupported keys and invalid values.

### 9.3 Synchronous build

`POST /api/ai/roadmap`

- Requires authentication, `ai_course_builder` and `personalized_roadmaps`.
- Validates the confirmed profile and allowance before model work.
- Returns the same result shape as async when finished.
- Typed errors distinguish validation, invalid intent, entitlement, allowance, capacity, provider quota/rate limit, schema validation, resource-quality and internal failures.

### 9.4 Asynchronous build

Existing route family under `ASYNC_ROADMAP`:
- `POST /api/ai/roadmap/draft`
- `POST /api/ai/roadmap` (finalize by draft ID)
- `GET /api/ai/roadmap/:draftId`
- `GET /api/ai/roadmap/:draftId/events`
- `POST /api/ai/roadmap/:draftId/cancel`

Target semantics:
- Create is idempotent for the same user and confirmed-profile hash; a changed profile must create a new build.
- Status and per-node state are persisted. Refresh/poll/resume must not restart completed nodes.
- Cancellation is effective for queued work; running provider requests may finish safely but must not cause duplicated/published side effects.
- Retry is allowed only for eligible retryable steps and must preserve completed curriculum/resource outputs.
- Owner checks are required on every draft/result/event/cancel endpoint.
- Sync and async modes use the same validated input/output DTO and quality semantics.

### 9.5 Response contract

Target result includes:
- `status`, `draftId` / `roadmapId` where applicable;
- private `course` preview and canonical `skillGraph`;
- `schedule`: effortMinutes, effortHours, estimatedWeeks, minutesPerDay, studyDaysPerWeek, deadline/warning/assumptions;
- `personalization`: confirmed/inferred/unknown profile provenance, known/skipped skills, depth, preferred language;
- `resourceSummary`: selected video runtime in minutes, provider/quota state and per-node state counts, separate from learning effort. Do not emit a YouTube-API-derived coverage/fit/quality score, percentile or ranking. A first-party workflow count of node states may be considered only if explicitly defined as an application state count and policy-reviewed; do not use a generic resource `coverageRatio` until that definition and policy boundary are approved;
- per-node resource state, evidence metadata and alternatives;
- warnings, partial-result information and retryable/permanent failure codes.

## 10. Durable generation and recovery (D-08)

The product guarantee is approved; the technology choice remains open.

Persist at minimum:
- job ID, owner, confirmed-profile hash/idempotency key, schema/prompt/template version;
- job lifecycle, timestamps, attempt count, retry classification, next retry time;
- lease owner/token/expiry/heartbeat and recovery count;
- curriculum/template result, canonical graph and course ID;
- per-node state, selected resource, alternatives, evidence, attempt count and error class;
- event cursor/version and final result status.

Required behavior:
- Workers claim jobs through an atomic persisted claim/lease operation.
- A periodic recovery process reclaims expired leases and resumes only unfinished or retryable steps.
- Completed curriculum and node outputs are immutable unless an explicit refresh action is requested.
- Every external side effect is idempotent or protected by a stable operation key.
- Retry limits/backoff are bounded and classified; permanent failures remain visible and actionable.
- Store retention must exceed the supported resume window; a TTL must not delete active or resumable jobs.
- The in-process `queue[]` is not a durable queue. Evaluate MongoDB-backed job claiming, Redis/BullMQ, or another supported durable design against deployed worker topology, operational cost, lease recovery, observability and failure behavior before selecting one.

## 11. Cache and versioning rules

The full cache taxonomy, key dimensions, TTL/freshness policy, invalidation matrix, failure semantics, privacy boundaries and acceptance matrix are specified in [Build with AI Cache Architecture and Invalidation Contract](BUILD-WITH-AI-CACHE-ARCHITECTURE-AND-INVALIDATION.md).

Core invariants:
- Intent cache keys include normalized query plus task schema, prompt, model and normalization versions; parsing cache hits must not bypass learner confirmation.
- Roadmap templates are generic reusable curriculum only. Key by topic/domain, goal, level, depth, curriculum scope, language where material, outcome/preferences, prompt/schema/model, skill-registry and composition versions.
- Node resource keys include canonical skill and context, learner level/language provenance, duration/content policy, selection/evidence policy and cache scope.
- Candidate pool, evaluation, result and node caches are distinct layers with independent TTLs and invalidation.
- Generated-course reuse is a product query/index, not a disposable cache. It must continue to enforce owner, visibility, publication, approval and deletion rules.
- Learner profile, private syllabus, progress, assessment attempts, job state and course ownership are not globally shared cache payloads.
- Every cache has an owner, data classification, explicit TTL, expiry check, version contract, invalidation path and telemetry. A cache hit never replaces authoritative authorization or validation.
- Provider metadata follows ADR-004's 30-calendar-day hard deadline and 25-day operational refresh target across every copy. TTL alone is not a freshness/deletion guarantee.
- Cache failure must preserve correctness; quota failures must not become negative-cache entries. Durable job state must never be evicted as a cache entry.

Current TTL values are baseline observations, not approved targets. Select future TTLs only after representative latency, volatility, cost, policy and hit-rate measurement.

## 12. Error and partial-completion contract

**Domain lifecycle states:** `draft`, `queued`, `running`, `cancelling`, `cancelled`, `completed`, `completed_with_warnings` and `failed`. Terminal states are `cancelled`, `completed`, `completed_with_warnings` and `failed`. Persist transitions before emitting events or returning status. These domain labels require an explicit public-API normalization map; see the proposed mapping in the API Contracts document. Worker-internal queue states are not public API states.

**Learner-visible behavior**
- Progress is calculated from persisted job and per-node state; expose completed/total node counts and current activity without treating elapsed time as progress.
- Curriculum generation and resource curation are reported separately. A roadmap with unresolved required nodes is partial, even when its curriculum graph is complete.
- Refresh/reconnect retrieves the same owner-scoped job. Queued/running work is observed, not resubmitted. Terminal work is rendered from persisted output.
- Retrying a node preserves all ready nodes and curriculum output. Only explicitly retryable states may be retried; permanent failures expose an actionable support path.
- Cancellation is idempotent. Queued work is stopped; in-flight provider calls may settle, but late results cannot schedule more work or create duplicate side effects. Preserve completed output for inspection and mark unfinished nodes accordingly.
- Cancellation is not deletion. Privacy deletion remains a separate lifecycle and must remove data under its own retention contract.

**Transport parity**
- Sync and async use the same validated confirmed-profile DTO, ownership/privacy policy, curation rules, schedule calculation, result schema and typed error categories.
- Sync returns a final result or typed failure and must not leave untracked background work running.
- Async returns a persisted job identifier/state and supports status/event observation, refresh/resume, eligible retry and cancellation.
- Neither transport may publish or enroll a learner-specific course as a side effect of generation.

- Invalid learner input/schema: reject before consuming expensive provider quota.
- Unsupported topic: show helpful correction examples; do not create an unrelated generic course.
- Gemini transient error: bounded retry or validated cache/knowledge-base fallback; otherwise return typed provider failure.
- Invalid Gemini JSON/schema/graph: reject that template; do not cache it.
- YouTube quota or provider outage: retain curriculum and all successful nodes; mark unresolved nodes `quota_limited` or `unavailable`.
- Single node failure: must not discard unrelated completed nodes.
- Permanent failure: preserve error category and an actionable retry/support path.
- A partial result must be labelled partial/ready-with-warnings rather than fully resource-covered.
- Resource availability and policy-approved quality evidence must distinguish a temporary provider quota outage from an unresolved/low-evidence candidate set. Do not classify a resource as low-quality using an unapproved YouTube API-derived score.

## 13. Acceptance and regression matrix

| Scenario | Required result |
|---|---|
| Topic-only learner | Intent parse proposes editable provisional fields; only high-value missing/low-confidence questions are asked |
| Unknown answer | “Not sure” and optional skip remain valid; profile review labels field unknown/inferred |
| Learner edits assumption | Submitted request contains edited value and learner-confirmed provenance |
| Unconfirmed profile | Generation endpoint rejects request or returns to profile confirmation; no Gemini curriculum call |
| Intent provider timeout | Static question fallback; no loss of topic entry |
| Gemini invalid JSON/schema | Reject template; do not cache or persist malformed curriculum |
| Gemini quota/rate limit | Typed retryable error or compatible validated template fallback; no unrelated course |
| Duplicate/ambiguous skill | Canonical ID policy produces stable, domain-aware resolution; ambiguous fuzzy match is not auto-merged |
| Cycle/missing prerequisite | Validation detects and records repair/rejection; output is a DAG |
| Known skill | It is not repeated as learner work; dependent remaining prerequisites remain valid |
| Short/medium/complete depth | Template cache key differs when depth changes; effort aligns with selected depth policy |
| Exam with supplied syllabus | Only literal source headings are labelled syllabus-backed; no invented official units |
| Preferred-language resource exists | It is selected ahead of other languages |
| Preferred-language resource missing | Other-language alternative is labelled; not attached until learner explicitly selects it |
| YouTube node quota exhausted | Successful nodes preserved; unresolved nodes are retryable quota-limited |
| One resource lookup fails | Other completed curriculum/resource nodes remain intact |
| Sync and async | Same input validation, ownership, content structure, duration metrics and node failure semantics |
| Learner-specific course in automatic approval mode | Remains private and unpublished |
| Process/worker restart | Job automatically resumes from persisted state without duplicating completed work |
| User requests another user's draft | 404/authorization denial; no data leakage |
| Duplicate submit / double click | Same user/profile idempotency key returns existing active/ready job; no duplicate course or provider work |

## 14. Decisions still open in Task 04

This architecture draft settles the main Build with AI component boundaries and logical contracts, but the following need technical evaluation before implementation:

1. Approve and implement the Gemini schema-versioning and migration strategy in [ADR-006](ADR-006-versioned-gemini-output-validation.md), including the compatibility window and invalid-output corrective-regeneration policy.
2. The canonical Skill registry's domain-scoped fuzzy-match threshold, score margin, ambiguity workflow and alias migration policy.
3. The durable job technology, worker topology, lease duration, recovery cadence, retry/backoff and retention policy (D-08).
4. Approve the resource reference/provider snapshot persistence model and migration in [Learning Resource Candidate and Selection Contract](LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md); complete freshness and YouTube data-retention controls under ADR-004.
5. Exact cache TTLs, negative caching and invalidation triggers after benchmark and quota-cost analysis.
6. Approve the evidence provenance envelope, claim-specific authority/conflict rules, confidence calibration policy, learner-facing disclosures and first-party retention/deletion mapping in [Build with AI Evidence and Confidence Model](BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md).
7. The final normalized status/error enum and API backward-compatibility window for sync/async clients.

No product code, production flag or `main` branch file was changed to author this architecture draft.

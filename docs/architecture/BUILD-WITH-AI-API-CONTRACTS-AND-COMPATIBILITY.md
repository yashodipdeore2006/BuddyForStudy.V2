# Build with AI — API Contracts and Backward Compatibility

**Status:** Proposed contract v1.2 — lifecycle, provider-error and evidence boundaries aligned with cross-document review; owner approval and implementation pending  
**Source inspection:** `docs/build-with-ai-engineering-readiness` branch, 2026-11-16  
**Scope:** Intent intake, confirmed roadmap build, sync/async lifecycle, response/error semantics and client compatibility  
**Related:** [Cross-Document Consistency Review](BUILD-WITH-AI-CROSS-DOCUMENT-CONSISTENCY-REVIEW.md); [Evidence and Confidence Model](BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md); [Learning Resource Candidate and Selection Contract](LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md)  
**Tracking:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)

> This document separates observed runtime behavior from the proposed stable contract. It does not assert that the proposed DTOs, versioning, or compatibility rules are implemented.

## 1. Executive contract

Build with AI should expose one canonical, versioned build request and one canonical roadmap result regardless of whether the server completes work synchronously or accepts it for asynchronous processing. The transport lifecycle may differ; the learner-visible domain result, ownership rules, profile semantics, resource states and error taxonomy must not.

The existing API does not yet satisfy this contract. In particular:

1. `POST /api/ai/roadmap` is registered to a different controller depending on the server-side `ASYNC_ROADMAP` flag. In sync mode it accepts a build profile and generates a roadmap; in async mode it expects a `draftId` and finalizes an existing draft.
2. Async mode adds `POST /api/ai/roadmap/draft`, poll, event-stream and cancel endpoints. The same path therefore has mode-dependent request semantics.
3. The sync and async request validators are not identical. The sync controller accepts legacy fields and an optional `intentProfile`; the async controller accepts a top-level profile or `profile` object and a different set of optional fields.
4. The shared `success()` helper spreads data into the top-level response, while `failure()` emits `success:false`, `message`, and optional `errors`. The response is not a fixed `data` envelope.
5. Some controller failures are mapped to typed HTTP errors; other failures are delegated to Express error middleware. A single complete public error contract cannot be inferred from these controller files alone.
6. Intent V2 is gated by a backend flag and entitlement middleware; the checked-in Courses page currently hardcodes its client flag off.

**Recommendation:** preserve the current endpoints as a legacy compatibility surface during migration, introduce a stable versioned Build with AI contract, and make the async/sync selection explicit rather than allowing a deployment flag to redefine the meaning of an existing request.

## 2. Source-mapped current API

### 2.1 Intent intake

| Item | Observed behavior |
|---|---|
| Route | `POST /api/intent/parse` |
| Middleware | Authentication, `ai_course_builder`, `personalized_roadmaps`, 20 requests per minute |
| Feature gate | Controller returns 404 when `env.intentV2` is false |
| Request | Zod object containing `query` validated by `IntentQuery` |
| Success | `success(res, result, "Intent parsed")`; result fields are spread at response top level |
| Validation failure | HTTP 400, message `Validation failed`, field errors in `errors` |
| Other failure | Delegated to `next(error)`; final public shape depends on global error middleware |

The intent service returns a profile, confidence values, domain/scope, options, question plan, assumptions and fallback information as documented in the target architecture. The precise serialized version marker must be verified in the service before a client contract is frozen.

Additional intent routes:
- `POST /api/intent/events`: records a question event; strict fields are `questionId`, `packId`, `event` and `position`.
- `GET /api/intent/questions/retired`: returns retired question IDs and evaluation metadata. This is an operational/quality endpoint, not part of the learner build DTO.

### 2.2 Synchronous roadmap generation

| Item | Observed behavior |
|---|---|
| Route | `POST /api/ai/roadmap` when `env.asyncRoadmap` is false |
| Middleware | Authentication, `ai_course_builder`, `personalized_roadmaps` |
| Accepted fields | `topic`, `level`, `goals`, `studyTimeMinutesPerDay`, `knownSkills`, optional `intentProfile` |
| Legacy defaults | Beginner, empty goals, 60 minutes/day, empty known skills |
| Processing | Entitlement checks, allowance consumption, admission lease, `generateAIRoadmap` |
| Success | `success(res, result, "Learning roadmap generated successfully")` |
| Validation | HTTP 400 with flattened field errors |
| Allowance | HTTP 429 with `code: AI_USAGE_LIMIT` and feature/period details |
| Admission capacity | Typed code for user rate/queue limit, queue full or lost lease; retryable metadata |
| Other failure | Delegated to `next(error)` |

The schema currently transforms an `intentProfile` into legacy-compatible fields. It is not a strict canonical versioned request DTO: it permits the legacy path, applies defaults, and does not require an explicit profile-confirmation marker or provenance object.

### 2.3 Asynchronous roadmap lifecycle

The routes are registered only when `env.asyncRoadmap` is true:

| Method and path | Current purpose | Observed behavior |
|---|---|---|
| `POST /api/ai/roadmap/draft` | Create/queue draft | Accepts `req.body.profile` or the body itself; returns draft identity and status |
| `GET /api/ai/roadmap/:draftId` | Poll status | Owner-scoped lookup; returns lifecycle, progress/result and error details |
| `GET /api/ai/roadmap/:draftId/events` | Stream events | Server-Sent Events; owner-scoped lookup |
| `POST /api/ai/roadmap/:draftId/cancel` | Cancel queued work | Queued work can be cancelled; already-started work returns conflict |
| `POST /api/ai/roadmap` | Finalize/read draft result | Requires `draftId`; waits up to 2 seconds, then returns ready result, failure, cancellation or current progress |

The async profile validator currently accepts `topic`, `level`, `goals`, `studyTimeMinutesPerDay`, `knownSkills`, `goal`, `intentProfile`, `language`, `targetRole`, `targetCompany`, `examName`, `examDate`, `syllabusText`, `projectIdea` and `deadline`. It is not the same schema as the sync controller.

The async controller performs owner-scoped draft lookup for finalize, poll, event stream and cancellation. A supplied profile that differs from the stored draft profile returns HTTP 409 and requires a new draft. A ready finalize response returns the stored result; an unfinished response includes draft/status/roadmap identifiers, modules, and poll/events URLs. A failed draft maps selected provider/resource failures to 502/503 and usage exhaustion to 429; cancellation returns 409.

### 2.4 Response helper baseline

The current response helper is:

- Success: HTTP status plus `{ success: true, message, ...data }`.
- Failure: HTTP status plus `{ success: false, message, errors? }`.

Because success data is spread into the top-level object, callers receive endpoint-specific top-level properties. Do not document a universal `data` property as current behavior. Do not assume all unexpected exceptions follow the same failure body without inspecting and testing the global error middleware.

## 3. Proposed stable DTOs

The following names and structures are proposals. They are not current runtime types and must be approved before implementation.

### 3.1 Versioning conventions

- Every public Build with AI request and response carries an explicit `schemaVersion` (or a stable media/API version when the platform standardizes one).
- Use immutable major DTO versions: `IntentParseV1`, `RoadmapBuildInputV1`, `RoadmapBuildResultV1`, `RoadmapJobV1`, and `BuildWithAIErrorV1`.
- Additive optional fields may be introduced within v1 only when old clients can safely ignore them and server defaults do not change existing meaning.
- A change to field meaning, requiredness, enum semantics, units, privacy guarantees, idempotency semantics or lifecycle transitions requires a new major contract version.
- Prompt/model versions, cache-key versions and API DTO versions are independent identifiers. Never reuse one as a substitute for another.

### 3.2 Confirmed build request

Canonical request:

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
      "resourceLanguages": ["en"],
      "lessonStyle": "Project-first"
    }
  },
  "profileProvenance": {
    "goal": "learner_confirmed",
    "level": "learner_confirmed",
    "minutesPerDay": "learner_confirmed",
    "targetRole": "learner_confirmed",
    "scope": "learner_confirmed"
  },
  "idempotencyKey": "client-generated-opaque-key"
}
```

Normative rules proposed:

- `profileConfirmed` must be true before generation. Server must not infer confirmation from field presence.
- `intentProfile` is the authoritative normalized profile; duplicate legacy fields are not accepted in the v1 request.
- Provenance values use a closed enum: `learner_confirmed`, `ai_inferred`, `platform_default`, `unknown`, `trusted_source`. The provenance map must be limited to fields in the profile schema.
- Unknown remains unknown. Platform defaults and AI inference must not be represented as learner-confirmed.
- The server revalidates all fields and entitlement/ownership independently of client validation.
- The idempotency key is scoped to the authenticated user and request contract version. Same key + same canonical payload returns the existing operation; same key + different payload returns conflict.
- Sensitive or unnecessary personal data is not added to the DTO. Do not put credentials, raw provider output, payment data or private telemetry in profile fields.

### 3.3 Intent parse request/response

Request remains a small topic-only input:

```json
{
  "schemaVersion": "intent-parse.v1",
  "query": "Python for data analysis"
}
```

Proposed response data includes:
- `schemaVersion`, `valid`, `profile`, `confidences`, `domain`, `scope`, `options`, `questionPlan`, `assumptions`, and `fallback`.
- Explicit provenance for values where the client must distinguish learner input, model inference, platform default and unknown.
- No curriculum nodes, course IDs, YouTube URLs or authorization decisions in the intent response.

A safe invalid-intent outcome should be a typed domain result (not an internal exception) and must never trigger roadmap generation. Exact invalid-result fields and status semantics require agreement with the frontend before freezing v1.

### 3.4 Operation and job DTO

Transport-neutral operation:

```json
{
  "schemaVersion": "roadmap-job.v1",
  "jobId": "uuid",
  "status": "queued",
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z",
  "result": null,
  "progress": {
    "completedNodes": 0,
    "totalNodes": 0
  },
  "links": {
    "status": "/api/ai/v1/roadmap-jobs/uuid",
    "events": "/api/ai/v1/roadmap-jobs/uuid/events",
    "cancel": "/api/ai/v1/roadmap-jobs/uuid/cancel"
  },
  "error": null
}
```

Proposed public lifecycle enum (owner approval pending):
- Job: `draft`, `queued`, `building`, `cancelling`, `partial`, `ready`, `failed`, `cancelled`.
- Node: `pending`, `queued`, `ready`, `low_confidence`, `unavailable`, `quota_limited`, `failed_retryable`, `failed_permanent`, `skipped`. The `low_confidence` node state is permitted only after the exact resource-selection method is approved under ADR-004/ADR-005 and any numeric confidence method is field-specific and calibrated under the Evidence and Confidence Model. Until then, use categorical evidence and explicit unresolved/alternative states instead of an uncalibrated numeric threshold.

A partial roadmap is a result state, not an implicit success claim that every resource is ready. The response must include per-node state and an explicit summary. Do not add new statuses without a versioned enum migration plan.

#### Proposed state mapping across architecture layers

The target architecture describes domain lifecycle states, while ADR-002 describes worker-internal execution states. They must not become three competing public enums. The following mapping is a **proposal for contract review**, not an approved/current runtime contract:

| Target domain state | Proposed public API state | ADR-002 worker-internal state (where applicable) |
|---|---|---|
| `draft` | `draft` | Not yet queued |
| `queued` | `queued` | `queued` |
| `running` | `building` | `running` |
| `cancelling` | `cancelling` | Running/claim is being fenced or drained |
| `cancelled` | `cancelled` | `cancelled` |
| `completed` | `ready` | `ready` |
| `completed_with_warnings` | `partial` | `ready` for the job's durable terminal result, with unresolved node states preserved |
| `failed` | `failed` | `failed_permanent` |

Worker `retry_wait` is an internal scheduling state, not a public job state. While a job is in retry wait, the public state should remain `building` with explicit retryability/next-retry metadata, unless the API owner approves a separate versioned public state. Public state transitions must be persisted before they are emitted.

The mapping must be adopted consistently in the Target Architecture, frontend client, poll/SSE payloads, test fixtures and operational dashboards before implementation. The API owner must approve state names, terminal-state semantics and compatibility mapping.

### 3.5 Canonical result DTO

Both sync completion and async job completion return the same `RoadmapBuildResultV1`:

- `schemaVersion`, `status`, `roadmapId`, `course`, `skillGraph`.
- `schedule`: learning effort in minutes/hours, estimated completion weeks, study minutes/day and days/week, deadline assumptions/warnings.
- `personalization`: confirmed/inferred/unknown provenance, known/skipped skills, course depth and preferred language.
- `resourceSummary`: video runtime, provider/quota state and counts of resource-node states. Do not emit a YouTube-API-derived fit/quality/coverage score, percentile or ranking. A simple first-party count of node states may be considered only if it is explicitly defined as an application workflow count (not an API Data-derived metric) and separately approved; do not publish a generic `coverageRatio` until that definition and policy boundary are approved. Never conflate video runtime with learning effort or completion timeline.
- Per-node resource state, selected resource, alternatives and evidence/provenance.
- `warnings`, `partial` summary and retryable/permanent failure details.

The course/roadmap must remain private and learner-owned under D-07. The API result must not imply publication, enrollment or payment entitlement.

## 4. Proposed endpoint evolution

### 4.1 New versioned surface

Recommended versioned routes (proposal; no route changes have been made):

| Method | Proposed path | Contract |
|---|---|---|
| POST | `/api/ai/v1/intents/parse` | IntentParseV1 |
| POST | `/api/ai/v1/roadmap-jobs` | RoadmapBuildInputV1 → RoadmapJobV1 |
| GET | `/api/ai/v1/roadmap-jobs/:jobId` | RoadmapJobV1 |
| GET | `/api/ai/v1/roadmap-jobs/:jobId/events` | Versioned SSE event envelope |
| POST | `/api/ai/v1/roadmap-jobs/:jobId/cancel` | RoadmapJobV1 |
| GET | `/api/ai/v1/roadmap-jobs/:jobId/result` | RoadmapBuildResultV1 when ready |

This job-oriented API avoids overloading a single `POST /roadmap` with both “create a build” and “finalize an existing draft”. The server may execute a job inline for small workloads or queue it; that execution choice must not alter the request meaning or final result DTO.

If a synchronous endpoint is retained for internal/operator use, give it a distinct path and return the same result DTO. Do not make the same route switch request schema based on a deployment flag.

### 4.2 Legacy compatibility surface

Keep existing routes operational during a controlled migration:
- `POST /api/intent/parse`
- Existing `POST /api/ai/roadmap` sync or async behavior
- Async draft, poll, events and cancel routes

Legacy behavior must be selected by explicit route/contract version, not by silently changing the meaning of a deployed request. A deployment must not flip `ASYNC_ROADMAP` in a way that causes existing clients to send a sync body to an async controller or vice versa.

## 5. Standard response and error contract

### 5.1 Success envelope

Proposed v1 envelope:

```json
{
  "success": true,
  "message": "Roadmap build accepted",
  "data": {
    "schemaVersion": "roadmap-job.v1",
    "jobId": "uuid",
    "status": "queued"
  },
  "requestId": "server-generated-correlation-id"
}
```

- All v1 endpoints use `data`; no endpoint-specific top-level spreading.
- Stable machine-readable fields are authoritative; `message` is display-safe and may change.
- `requestId` is for support/trace correlation and must not expose internal identifiers or secrets.
- SSE events carry `schemaVersion`, `eventId`, `jobId`, `type`, `occurredAt` and typed `data`; reconnect/replay semantics must be specified before implementation.

### 5.2 Error envelope

Proposed v1 envelope:

```json
{
  "success": false,
  "error": {
    "code": "AI_PROVIDER_RATE_LIMITED",
    "message": "Generation is temporarily rate-limited. Please retry shortly.",
    "retryable": true,
    "retryAfterSeconds": 30,
    "details": {}
  },
  "requestId": "server-generated-correlation-id"
}
```

Error code is stable and intended for program logic. Message is safe for display and may be localized by the client. `details` is allowlisted, bounded and non-sensitive. Never return stack traces, provider raw responses, API keys, database errors or private learner data.

### 5.3 Proposed error taxonomy

| Code | HTTP | Retryable | Meaning |
|---|---:|---|---|
| `VALIDATION_FAILED` | 400 | No | Request violates DTO constraints |
| `INVALID_INTENT` | 422 | No | Topic/profile cannot support a valid build |
| `AUTHENTICATION_REQUIRED` | 401 | No | Missing/invalid authentication |
| `FEATURE_NOT_ENTITLED` | 403 | No | User lacks required feature entitlement |
| `RESOURCE_NOT_FOUND` | 404 | No | Job/result not found or not visible to caller |
| `IDEMPOTENCY_CONFLICT` | 409 | No | Same idempotency key reused with a different payload |
| `JOB_STATE_CONFLICT` | 409 | Depends | Requested transition is invalid for current state |
| `AI_USAGE_LIMIT` | 429 | No until reset | Learner allowance exhausted |
| `ROADMAP_CAPACITY_LIMIT` | 429/503 | Yes | Per-user or platform queue/admission capacity reached |
| `AI_PROVIDER_RATE_LIMITED` | 503 | Yes | Provider rate-limits platform request |
| `AI_PROVIDER_QUOTA_EXHAUSTED` | 503 | Yes | Provider has exhausted the relevant daily quota bucket; retry only at the documented reset or after an authorized quota configuration change |
| `AI_QUOTA_STORE_UNAVAILABLE` | 503 | Yes | Local quota accounting store cannot authorize a provider call; no provider call is made; distinct from Google's daily quota exhaustion |
| `AI_SCHEMA_INVALID` | 502 | No automatic retry | Provider output failed server schema/semantic validation |
| `AI_RESOURCE_QUALITY_INSUFFICIENT` | 503 | Policy-based | Required verified resource quality/coverage not met |
| `ROADMAP_BUILD_FAILED` | 500/502 | Depends | Classified unexpected or upstream build failure |

HTTP status is a transport category; clients must branch on `error.code`, not message text. Proposed distinction: learner allowance exhaustion and application route-rate limits use 429; an upstream provider 429 may be mapped to the platform-level `AI_PROVIDER_RATE_LIMITED` 503; provider daily quota exhaustion uses `AI_PROVIDER_QUOTA_EXHAUSTED` 503 with reset-aware retry metadata; local quota-store outage uses `AI_QUOTA_STORE_UNAVAILABLE` 503 and must not make a provider call. These are proposed contract mappings, not a claim about every current controller response. The final mapping for resource-quality failures, provider quota/store outage and platform capacity must be confirmed by API/product/operations owners. Do not retry non-retryable validation, entitlement or learner-allowance errors automatically.

### 5.4 Current-to-proposed error mapping

Observed current codes include `AI_USAGE_LIMIT`, `ROADMAP_USER_RATE_LIMIT`, `ROADMAP_USER_QUEUE_LIMIT`, `ROADMAP_QUEUE_FULL`, `ROADMAP_ADMISSION_LEASE_LOST`, `AI_PROVIDER_RATE_LIMITED`, `AI_PROVIDER_QUOTA_EXHAUSTED` and `AI_RESOURCE_QUALITY_INSUFFICIENT`.

The compatibility adapter should map these to the proposed public taxonomy while preserving a sanitized `legacyCode` only if needed for migration diagnostics. Internal lease-loss details must not become a user-facing retry contract without an explicit classification.

## 6. Backward-compatibility policy

### 6.1 Compatibility guarantees

- Existing deployed clients continue to receive the legacy response shape on legacy routes throughout the announced support window.
- A v1 client receives only v1 DTOs and v1 error envelopes.
- Additive response fields are optional for clients and ignored unless explicitly supported.
- Server request validators reject unknown fields for versioned DTOs. Legacy endpoints retain their currently documented compatibility behavior until sunset.
- Never reinterpret units, enum values, nullability, ownership, privacy, or state transitions in place.
- Auth, entitlement, owner checks, rate limits and server-side validation apply equally to legacy and versioned routes.
- Cache hits, idempotency reuse and async resume never bypass authorization or revalidation.

### 6.2 Proposed deprecation window

Proposed minimum window after a replacement contract is production-ready:
1. **Announce:** publish migration guide and replacement endpoints; emit deprecation headers/telemetry on legacy routes.
2. **Dual support:** maintain legacy and v1 routes for at least 90 days and at least two normal frontend release cycles, whichever is longer.
3. **Observe:** require evidence that supported clients have migrated; measure legacy calls by client version and route.
4. **Sunset notice:** announce a dated retirement at least 30 days before removal.
5. **Retire:** remove only after product owner approval, usage threshold met, rollback plan documented and no supported client depends on the route.

These durations are proposed policy, not current repository behavior or an approved commitment. Extend the window if clients cannot be upgraded centrally.

### 6.3 Schema evolution rules

| Change | Within same major version? | Rule |
|---|---|---|
| Add optional response field | Yes | Must be safely ignorable |
| Add optional request field | Yes, conditionally | Must have backward-compatible semantics and server default |
| Add enum value | Not automatically | Existing clients may use exhaustive switches; negotiate or version |
| Rename/remove field | No | New major version and migration |
| Change requiredness or null semantics | No | New major version |
| Change units or meaning | No | New major version |
| Change lifecycle transition or retry meaning | No | New major version |
| Tighten validation to reject previously accepted legacy inputs | No for legacy route | Versioned route or announced migration |
| Change sync/async route semantics | No | Distinct versioned endpoint or explicit operation |

## 7. Sync/async parity requirements

The execution mode is an implementation detail, not a product contract fork.

| Concern | Required parity |
|---|---|
| Input | Same RoadmapBuildInputV1 validation and canonicalization |
| Profile trust | Same confirmation/provenance interpretation |
| Authorization | Same authentication, entitlement and owner checks |
| Admission | Same allowance, idempotency and capacity policy |
| Curriculum | Same schema/prompt/template compatibility rules |
| Skill graph | Same canonicalization, DAG and validation invariants |
| Resources | Same language, duration, quality, evidence and quota rules |
| Ownership | Same private learner ownership and no implicit publication |
| Schedule | Same effort/timeline/runtime semantics |
| Result | Same RoadmapBuildResultV1 |
| Errors | Same stable error codes and retry classifications |
| Partial completion | Same per-node states and preservation guarantees |
| Retry | Same eligible states; completed nodes are not regenerated without policy |

Sync execution may return the completed result directly. Async execution returns a job resource and later exposes that exact result. A sync timeout must not create an ambiguous duplicate job; it must use the same idempotency key and operation identity.

## 8. Client migration requirements

- Client API types must be generated from or validated against the versioned DTO definitions; avoid endpoint-specific `any` response parsing.
- API client should expose a typed error object with HTTP status, stable code, retryable flag, retry-after and safe details.
- UI should render state from job/node enums, not infer state from message strings or missing fields.
- Polling and SSE must converge on the same job state; out-of-order events must not regress a terminal state.
- On network timeout after submission, client retries with the same idempotency key and queries the existing job rather than creating another build.
- Client must tolerate additive optional response fields and unknown non-critical metadata.
- Frontend intent feature availability must be obtained from a coordinated capability/version contract; the current hardcoded client constant and independent server flag must not drift.
- Legacy clients must never be sent the new response envelope without a versioned route or explicit negotiated contract.

## 9. Contract testing and acceptance gates

Before implementation is approved, add contract tests for:

1. Request DTO valid/invalid boundaries, strict unknown-field rejection and normalization.
2. Intent V1 output and invalid-intent domain result.
3. Legacy sync and async routes retain their documented request/response behavior during the migration window.
4. Same canonical request produces the same domain result shape in sync and async execution.
5. Job creation idempotency for same key/payload and conflict for same key/different payload.
6. Owner isolation for poll, result, events and cancellation, including cross-user IDs.
7. Every lifecycle transition and invalid transition response.
8. SSE event version, replay/reconnect ordering and terminal-state behavior.
9. Stable error code + HTTP status + retryability mapping for validation, entitlement, allowance, capacity, Gemini quota/rate limit, invalid model output and resource-quality failure.
10. Client compatibility with optional new fields and unknown non-critical metadata.
11. Authorization and entitlement checks remain effective for cache hits, idempotent replays and resumed jobs.
12. No sync timeout or client retry creates duplicate courses/jobs.
13. Private course ownership/publication invariants in both execution modes.
14. Contract fixtures are version-controlled and checked in CI; breaking changes fail the release gate.

No contract tests were run or added as part of this documentation task.

## 10. Open decisions requiring owner approval

- [ ] Adopt explicit versioned `/api/ai/v1` routes or a versioned media-type strategy.
- [ ] Confirm the proposed canonical profile field names and whether legacy profile aliases are accepted by a compatibility adapter.
- [ ] Confirm provenance enum and whether per-field provenance is mandatory for all profile values.
- [ ] Confirm idempotency-key lifetime, storage, collision behavior and replay response.
- [ ] Confirm final job and node state enums, including whether `partial` is a job state or a result-quality flag.
- [ ] Confirm SSE replay cursor and event-retention contract.
- [ ] Approve 90-day/two-release minimum compatibility window and 30-day sunset notice.
- [ ] Confirm HTTP status mapping for capacity, provider quota, resource quality and unexpected upstream errors.
- [ ] Confirm sync endpoint support or whether all new v1 builds are job-oriented.
- [ ] Confirm how client capability negotiation replaces the independent Intent V2 switches.

## 11. Implementation sequencing after Go/No-Go

1. Approve the public DTOs, route strategy, error taxonomy and compatibility window.
2. Add shared server schemas and canonical profile normalization; do not change legacy behavior yet.
3. Add contract fixtures and tests for legacy and v1 routes.
4. Implement versioned routes and adapters around existing orchestration.
5. Unify sync/async execution behind one application service and result serializer.
6. Update frontend API types, error handling, job lifecycle UI and capability negotiation.
7. Run compatibility, ownership, idempotency, failure-injection and E2E tests.
8. Release behind coordinated server/client rollout controls; verify metrics before deprecating legacy routes.

**Current decision:** proposal only. No product code, API route, DTO, flag, database record, deployment configuration or `main` branch was changed by this task.

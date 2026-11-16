# Security, Privacy and Abuse Review — Build with AI & Course Discovery

**Status:** Source-mapped review v0.3 — extended route matrix and SEC-06–SEC-08 added; remediation and security test evidence pending  
**Date:** 2026-11-16  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Scope:** Authentication, authorization, admin governance, learner privacy, AI prompt trust boundaries, roadmap/quiz abuse controls, logging and provider-cost abuse  
**Related:** readiness issue #43; Tasks 04–07; ADR-001 through ADR-005

## 1. Executive assessment

The reviewed backend contains meaningful baseline controls: JWT verification with account activity and token-version checks; admin role and permission middleware; explicit course/enrollment access checks; Zod request schemas; Helmet; configured-origin CORS; body-size limits; Mongo-backed shared rate limiting; password hashing; OTP-based login; redacted request logging; prompt-data serialization; privacy export/request workflows; and audit records for sensitive administrator actions.

This is **not a security certification**. The review is source-based and does not include dynamic penetration testing, production configuration inspection, dependency/SCA review, secret scanning, live authorization tests or a complete route-by-route audit.

### Highest-priority findings

1. **SEC-01 — Async roadmap profile validation can be overwritten after validation (Medium).** The controller validates an outer profile, accepts arbitrary `intentProfile: z.record(z.unknown())`, and then performs `Object.assign(profile, profile.intentProfile)`. Keys inside the untrusted nested object can overwrite already-validated fields such as topic, level, goals, language or study-time values. This defeats the intended validation boundary and may pass unbounded or incorrectly typed values downstream.
2. **SEC-02 — One automatic practice-quiz generation path omits the user ID and skips the per-user monthly usage reservation (High).** `submitPracticeQuiz` calls `queueNextLessonQuiz(courseId, lessonId)` after a learner exhausts the bank, while the helper defaults `userId=null`. `generateCourseQuiz` reserves monthly AI usage only when `userId` is present. This background path can therefore bypass the user-level quiz-generation allowance. Confirm the intended shared-generation accounting model and close the bypass before enabling costly quiz generation broadly.
3. **SEC-03 — New Google-account creation does not require legal consent at the API boundary (Medium / policy decision).** `googleSchema` makes `termsAccepted` and `privacyAcknowledged` optional. The controller passes `consent=null` unless both are true, and the service can create a new Google user without calling `acceptLegalPolicies`. Existing-user sign-in should not require repeated consent, but new-account creation should have an explicit server-enforced consent policy.
4. **SEC-04 — Account deletion is not implemented by the privacy-request workflow (High product/privacy readiness gap).** The learner can submit a deletion request and an administrator can advance its review state, but both responses explicitly say `executionAvailable: false`; the admin update response explicitly says no account data has been deleted or anonymized. Do not describe this workflow as a completed deletion right. Implement a verified, auditable deletion/anonymization executor with legal-hold and payment-record retention rules before claiming fulfilment.
5. **SEC-05 — Auth middleware loads password hashes on every authenticated request (Low hardening).** `authMiddleware` and `optionalAuthMiddleware` query `User.findById(...).select("+password")`, although the middleware only needs account, role and token-version data. Password verification is performed by dedicated auth-service methods. Remove this unnecessary hash hydration after checking all consumers and add a regression test that protected routes do not load password hashes.

### Remediation progress — 2026-11-15

The first two code-level remediations have been applied on this readiness branch; neither finding is closed pending automated regression tests and runtime verification.

- **SEC-01 — Code change and focused regression tests added:** `asyncRoadmap.controller.js` now validates nested `intentProfile` with the strict shared `IntentProfile` schema and maps only explicitly supported fields into the normalized profile. The post-validation `Object.assign` merge has been removed. Unknown nested keys are rejected rather than copied into the validated object. Automated test execution and compatibility checks against real client payloads remain pending.
- **SEC-02 — Code change and focused guard test added:** `queueNextLessonQuiz` no longer defaults a missing `userId` to `null` and fails closed when the actor is absent. The exhausted-bank path now passes `req.user.userId`, allowing `generateCourseQuiz` to execute its existing atomic monthly `ai_quiz_generations` reservation. The regression test covers fail-closed behavior, but the monthly-limit path and multi-instance duplicate-job/burst behavior still require integration tests; this change does not establish a global provider-budget control.

No production deployment, database migration, feature-flag change or `main`-branch modification was made.

All severities are preliminary engineering priorities, not a formal CVSS score. No exploitation or production compromise is claimed.

## 2. Threat model and trust boundaries

### Assets

- Learner identity, contact details, consent history and account credentials.
- Learner-specific roadmaps, progress, quiz attempts, preferences and private courses.
- Course publication, pricing, enrollment and admin moderation state.
- Gemini/YouTube credentials, provider quotas, prompts and generated content.
- Administrator roles, permissions, audit events and privacy requests.
- Payment and subscription records.

### Trust boundaries

| Boundary | Untrusted input / actor | Required control |
|---|---|---|
| Browser → API | Learner payloads, identifiers, query parameters, bearer tokens | Authentication, strict schema validation, rate limits, output projection |
| Learner → private learner data | User-supplied course/draft IDs | Every read/write scoped to authenticated owner; deny by default |
| Learner → paid features | Client claims about plan or entitlement | Resolve plan/entitlement server-side; never trust client flags |
| Administrator → platform governance | Role changes, PII reveal, moderation, pricing, privacy requests | RBAC, separation of duties, reason, audit, alerts, concurrency protection |
| User/provider metadata → Gemini | Prompt injection in topic, syllabus, video titles/descriptions, lesson metadata | Treat as inert data; explicit system instruction; output schema and semantic validation |
| API → Gemini/YouTube | Provider credentials, token/quota spend | Server-only secrets, bounded fan-out, per-user/global quotas, safe telemetry |
| API/worker → database/cache | Concurrent jobs, stale leases, user-owned records | Atomic claims, ownership filters, idempotency, retention and recovery controls |
| Application → logs/telemetry | Exceptions, user data, request context | Allowlisted fields, redaction, short retention and access control |

### Abuse cases to test

- Forged/expired/revoked JWT; inactive account; stale role claims after admin-role changes.
- Cross-user access to roadmaps, private courses, quiz banks, progress, exports and privacy requests.
- Learner attempts to submit arbitrary role, owner, publication, pricing or approval fields.
- Prompt injection embedded in learner topic/syllabus or provider metadata.
- Repeated roadmap/quiz/intent requests to exhaust Gemini quota or cause provider-cost spikes.
- Admin permission escalation, self-promotion, removal of last Super Admin, or access to PII without the dedicated permission.
- OTP brute force, account enumeration, reset abuse and invitation replay.
- Malformed or oversized payloads, deeply nested objects and unexpected keys.
- Privacy deletion request falsely represented as completed while records remain in application databases, logs, backups or provider systems.

## 3. Source-mapped controls observed

| Area | Evidence observed | Assessment / remaining validation |
|---|---|---|
| JWT | `server/src/middleware/auth.js`, `server/src/utils/jwt.js`, `server/src/models/User.js` | Verifies token, loads active account, checks token version; password-hash over-fetch is SEC-05. Verify expiry, algorithm policy, secret rotation and admin-role freshness under dynamic tests. |
| Authentication | `server/src/routes/auth.routes.js`, `server/src/services/auth.service.js`, `server/src/config/rateLimiters.js` | Password hashing, email/login OTP, Google ID-token audience/email verification, session rotation and auth limiter exist. Test OTP attempt limits, resend cooldowns, enumeration and Google new-user consent (SEC-03). |
| Admin RBAC | `server/src/middleware/auth.js`, `server/src/utils/adminRbac.js`, `server/src/routes/adminPro.routes.js`, `server/src/controllers/adminRoles.controller.js` | Route-level permission middleware and role profiles exist. Role change resets overrides, blocks self-change, serializes governance changes and protects the last active Super Admin. Verify every sensitive route, override governance and alert/audit failure handling. |
| Course access | `server/src/routes/course.routes.js`, `server/src/middleware/subscription.middleware.js`, `server/src/utils/courseLearningAccess.js`, `server/src/controllers/course.controller.js` | Optional/public catalog paths are separated from authenticated learning paths; enrollment and purchase/entitlement checks are present. Complete cross-user/private-course matrix still required. |
| Build with AI authorization | `server/src/routes/ai.routes.js`, `server/src/routes/intent.routes.js`, `server/src/controllers/asyncRoadmap.controller.js` | Roadmap routes require auth and feature entitlements. Draft operations are user-scoped in service lookups. The profile merge after validation is SEC-01. Test draft IDOR and profile tampering. |
| Prompt trust boundary | `server/src/utils/promptTrustBoundary.js`, `server/src/services/aiRoadmap.service.js`, `server/src/services/courseCurationDecisionEngine.service.js` | JSON serialization, escaping and explicit untrusted-data instructions are used for topic, syllabus, learner context, candidate metadata, quiz context and previous questions. This reduces injection risk but is not a guarantee; add adversarial tests and verify every model call/data field. |
| HTTP hardening | `server/src/server.js`, `server/src/config/corsPolicy.js`, `server/src/config/productionConfigValidation.js` | Helmet, disabled x-powered-by, explicit proxy-hop config, exact configured production origin, no credentialed CORS, 1 MB JSON / 10 KB URL-encoded limits and HTTPS/TLS production checks are present. Verify live settings and deployment proxy chain. |
| Rate limiting | `server/src/server.js`, `server/src/config/rateLimiters.js`, `server/src/config/mongoRateLimitStore.js` | Shared global/API and auth/payment/webhook limiters plus per-user roadmap admission limits exist. Verify store outage behavior and all expensive AI operations; SEC-02 demonstrates a per-user usage-accounting bypass. |
| Logging/errors | `server/src/utils/safeRequestLog.js`, `server/src/utils/safeTelemetryError.js`, `server/src/middleware/error.js` | Request logs omit query strings, bodies, IP, referer and user-agent; safe telemetry excludes provider messages, prompts, URLs and stacks. Verify Sentry configuration, audit-log retention/access and every background logger. |
| Consent/privacy | `server/src/routes/consent.routes.js`, `server/src/services/consent.service.js`, `server/src/routes/me.routes.js`, `server/src/controllers/privacyRequests.controller.js` | Versioned consent, cookie preferences, marketing consent, requester-scoped export and audited request state machine exist. Export labels itself partial; deletion execution is unavailable (SEC-04). |
| Admin PII | `server/src/routes/adminPro.routes.js`, `server/src/utils/adminRbac.js` | PII reveal/export use dedicated `users.pii.reveal` permission. Verify response minimization, audit trails and access reviews. |

## 4. Findings and remediation requirements

### SEC-01 — Nested intent profile overwrites validated roadmap fields

**Priority:** Medium  
**Source:** `server/src/controllers/asyncRoadmap.controller.js` — `profileSchema` and `createDraft`.

Current pattern:
- `intentProfile` is accepted as `z.record(z.unknown())`.
- The outer object is parsed by `profileSchema`.
- `Object.assign(profile, profile.intentProfile)` then copies arbitrary nested keys onto the parsed object.

**Impact:** validated fields can be replaced after validation; downstream assumptions about topic length, level, goals, study-time bounds, language and known-skill types are no longer guaranteed. The API body-size limit provides a coarse ceiling but does not restore the field-level contract.

**Required remediation:**
1. Define a strict, versioned `IntentProfile` Zod schema with explicit keys, enums, array/string bounds and nested preference constraints.
2. Reject unknown keys (or explicitly strip them) and never spread/assign an untrusted record over a validated DTO.
3. Build a new canonical profile object from a whitelist; define deterministic precedence between explicit confirmed fields and inferred intent fields.
4. Re-run all semantic checks after merge and before persistence/provider calls.
5. Add regression tests proving nested keys cannot override validated topic, level, study time, goal, language or ownership fields; reject prototype-like/unknown keys and oversized nested values.

**Acceptance:** all downstream fields satisfy the same schema after normalization; a client cannot alter server-owned identity/ownership/entitlement values through nested profile data.

### SEC-02 — Background practice quiz can skip per-user monthly allowance

**Priority:** High  
**Source:** `server/src/controllers/ai.controller.js` — `submitPracticeQuiz` and `queueNextLessonQuiz`; `server/src/services/aiRoadmap.service.js` — `generateCourseQuiz`.

The normal explicit practice-quiz path calls `queueNextLessonQuiz(courseId, lessonId, req.user.userId, excluded)`. However, when a learner exhausts the available bank after submission, `submitPracticeQuiz` calls `queueNextLessonQuiz(courseId, lessonId)` without the user ID. The helper defaults the ID to `null`. The generation service only calls `consumeUsage` when `userId` is truthy, so this path skips the per-user `ai_quiz_generations_per_month` allowance.

**Impact:** repeated quiz-bank exhaustion can trigger Gemini generation without charging the triggering user's monthly quota. The global request limiter and in-process duplicate set are not a substitute for per-user accounting; the in-memory set also does not coordinate across instances/restarts.

**Required remediation:**
1. Decide whether generated practice banks are charged to the triggering learner, a shared platform budget, or both.
2. Pass an authenticated actor through every user-triggered generation path and reserve usage atomically before enqueue.
3. If a shared background generation is intentional, reserve against a separate global budget and retain the triggering actor for audit; do not silently use a null user to bypass accounting.
4. Add a bounded per-user burst limiter for quiz-generation requests and a global provider budget/concurrency cap.
5. Add tests for the exhausted-bank path, concurrent submits, multi-instance duplicate enqueue, failed-generation allowance release and monthly cap exhaustion.

**Acceptance:** every billable provider generation is charged to a defined user or platform budget; no request path can bypass both; concurrent triggers produce one idempotent generation job.

### SEC-03 — New Google account can be created without server-enforced legal consent

**Priority:** Medium; confirm legal/product policy with owner  
**Source:** `server/src/validation/authSchemas.js`, `server/src/controllers/auth.controller.js`, `server/src/services/auth.service.js`.

Google login schema permits both consent fields to be omitted. The controller creates a consent object only when both are true; otherwise it passes null. The service can create a new user before the optional consent branch, so the API itself does not require terms acceptance/privacy acknowledgement for a new Google account.

**Impact:** a client can invoke the endpoint without the same explicit consent requirement enforced by local registration. A frontend consent screen is not an adequate server-side control.

**Required remediation:**
1. Distinguish new-account creation from existing-account sign-in after verified Google identity lookup.
2. For new accounts, require explicit `termsAccepted === true` and `privacyAcknowledged === true` before persisting the account.
3. Persist policy versions and consent events atomically or roll back the new account if durable consent recording fails.
4. Keep marketing consent optional and default false.
5. Add tests for new user with missing/false consent (reject), new user with both acknowledgements (accept and record versions), existing user sign-in without repeated consent (policy-defined), and consent persistence failure.

**Acceptance:** no new Google user exists without the required legal acknowledgements and durable versioned evidence.

### SEC-04 — Privacy deletion request has no execution path

**Priority:** High product/privacy readiness gap  
**Source:** `server/src/controllers/privacyRequests.controller.js`, `server/src/routes/me.routes.js`, `server/src/routes/adminPro.routes.js`.

The requester can export their data and submit correction/deletion requests. The export explicitly identifies itself as `partial_repository_inventory` and lists omitted browser-local notes, provider-side records, infrastructure logs and backups. Requests are created in `identity_pending`; admin transitions require identity verification before review/approval/in-progress. However, request responses state `executionAvailable: false`, and status updates explicitly state no data has been deleted or anonymized.

**Impact:** privacy request intake and review exist, but fulfilment is not implemented. This must not be described as account deletion or completed privacy-right fulfilment.

**Required remediation:**
1. Define data inventory and controller/processor retention map across Mongo collections, object storage, analytics, email, push, Gemini/YouTube, logs and backups.
2. Define lawful retention exceptions for payment, fraud, audit and legal-hold records; separate anonymization from hard deletion.
3. Implement a durable, idempotent deletion workflow with verified identity, approval, legal hold, per-collection execution evidence and retry/recovery.
4. Revoke all sessions and credentials immediately when policy requires; delete or anonymize owned data according to the approved schedule.
5. Provide a final completion report, residual-retention disclosure and audit event without retaining unnecessary personal data.
6. Add tests for partial failure, legal hold, duplicate execution, retry, backups/retention disclosure and cross-user isolation.

**Acceptance:** the product reports fulfilled only after every required store has completed or an approved legal-retention exception is documented.

### SEC-05 — Password hashes loaded into every authenticated request context

**Priority:** Low hardening  
**Source:** `server/src/middleware/auth.js`.

Both required and optional auth middleware explicitly select `+password` while the request path only needs the user ID, role, active state, token version and admin permissions. Password comparison and password-change flows separately select the hash in `auth.service.js`.

**Impact:** increases the number of code paths and duration for which password hashes are resident in request memory. No direct response leak was established; `User.toJSON` removes password and token-version fields.

**Required remediation:** remove `+password` from authentication middleware queries; select only fields required to authorize the request; keep password hashes inside dedicated authentication operations. Add a test asserting the auth middleware query does not select password and public serialization never exposes it.

## 5. Additional review questions / not yet established

- Confirm OTP attempt limits, expiry, resend cooldown, one-time consumption and per-account/IP controls across email verification, login verification and password reset.
- Confirm administrator invitation tokens are single-use, expiring, hashed at rest and bound to the intended email/role; verify acceptance cannot self-select a privileged role.
- Verify every admin endpoint has the correct permission, especially PII reveal/export, role governance, privacy requests, pricing, billing/refunds, prompt activation, operations and outbound communications.
- Verify administrator permission overrides are only grantable through the intended governance path and are cleared/audited on role change.
- Verify all user-owned resources use owner-scoped queries and return consistent 404/403 behavior without leaking record existence.
- Verify Sentry and all background jobs use the same redaction policy; inspect retention and access controls for audit events.
- Verify rate-limit store failure behavior, per-user limits for expensive AI operations, and global concurrency/budget controls across API instances.
- Verify live CORS origin, `TRUST_PROXY_HOPS`, JWT secret length/rotation, Mongo TLS, Redis TLS and production configuration using names/true-false only; do not copy secret values into audit artifacts.
- Verify account export completeness and whether data categories include every current collection and third-party processor.
- Verify no private learner prompt/profile data is retained in provider logs, observability traces, cache keys or support tooling beyond the approved purpose/retention.

## 6. Required security regression suite

| Test group | Minimum tests |
|---|---|
| Auth/session | Missing, malformed, expired and revoked token; inactive user; password reset invalidates prior tokens; no password hash in normal auth context |
| Authorization/IDOR | User A cannot read/cancel/stream/finalize User B's roadmap; cannot access private course, progress, quiz attempts, export or privacy request |
| Admin RBAC | Every sensitive route denied without permission; support/analyst roles cannot reveal PII or change roles; no self-role change; last active Super Admin protected |
| Input validation | Unknown fields, nested intentProfile overwrite, large strings/arrays, invalid enums, prototype-like keys and invalid identifiers |
| Prompt injection | Learner topic/syllabus and YouTube title/description attempt to override instructions, request secrets or produce unsafe schema; platform policy remains dominant |
| Abuse/cost | OTP brute force; roadmap burst; quiz allowance bypass; duplicate queue trigger across instances; provider concurrency and budget cap |
| Privacy | New Google user consent enforcement; export is requester-scoped and marked partial until complete; deletion state cannot become fulfilled without execution evidence; legal hold |
| Logging | Password/token/OTP/email/prompt/provider payload absent from request and error logs; request IDs remain correlatable without exposing PII |

## 7. Task 05 exit criteria

Task 05 can be marked **Done** only when:

- Route-by-route authentication, entitlement and authorization matrix is complete and negative tests pass.
- SEC-01 and SEC-02 are fixed with regression tests before any relevant feature is enabled for broad use.
- Google-account consent behavior is approved and server-enforced for new accounts.
- Privacy export/deletion scope, execution and retention policy are documented; no UI/API claim overstates current deletion capability.
- Prompt-injection tests cover every model call and all untrusted data sources.
- OTP, invitation, PII and admin-governance controls are dynamically tested.
- Logs, traces and audit retention/access are reviewed; secrets and learner PII are redacted.
- Production config and rate-limit behavior are verified in staging without exposing secrets.
- Any residual risk has an owner, severity, mitigation and explicit acceptance.

## 8. Evidence boundary

Reviewed source paths on the readiness branch include:
- `server/src/middleware/auth.js`
- `server/src/utils/jwt.js`
- `server/src/utils/adminRbac.js`
- `server/src/middleware/subscription.middleware.js`
- `server/src/utils/courseLearningAccess.js`
- `server/src/controllers/asyncRoadmap.controller.js`
- `server/src/services/asyncRoadmap.service.js`
- `server/src/controllers/ai.controller.js`
- `server/src/services/aiRoadmap.service.js`
- `server/src/utils/promptTrustBoundary.js`
- `server/src/services/courseCurationDecisionEngine.service.js`
- `server/src/controllers/auth.controller.js`
- `server/src/services/auth.service.js`
- `server/src/validation/authSchemas.js`
- `server/src/controllers/privacyRequests.controller.js`
- `server/src/routes/me.routes.js`
- `server/src/routes/adminPro.routes.js`
- `server/src/config/rateLimiters.js`
- `server/src/config/mongoRateLimitStore.js`
- `server/src/config/corsPolicy.js`
- `server/src/config/productionConfigValidation.js`
- `server/src/utils/safeRequestLog.js`
- `server/src/utils/safeTelemetryError.js`
- `server/src/middleware/error.js`

**Review activity boundary:** this source-review activity did not modify application code, run tests or penetration tests, inspect production environment values, make live provider requests, or access/copy secrets or private learner records. This statement does not mean that no code changes exist on this working branch: the separately documented SEC-01 and SEC-02 remediation changes are present in the inspected readiness-branch source, with focused tests added but not executed.


## 9. Route-level authorization cross-check — 2026-11-16

This section records the route declarations and their directly connected controller/service checks inspected on the readiness branch. It is a focused matrix for authentication, entitlement, ownership and privileged operations; it is not a certification of every API route in the repository.

| Mounted route | Route-level control observed | Additional controller/service control observed | Remaining negative-test focus |
|---|---|---|---|
| `POST /api/intent/parse` | JWT auth, `ai_course_builder`, `personalized_roadmaps`, 20/min limiter | Server-side `INTENT_V2` gate; Zod query validation | Entitlement expiry, feature-off behavior, malformed/oversized topic |
| `POST /api/intent/events`, `GET /api/intent/questions/retired` | JWT auth, 20/min limiter | Event writes derive `userId` from authenticated principal; retired-question endpoint aggregates question events across users and returns question IDs/aggregate metrics | Confirm aggregate endpoint is intentionally available to every authenticated account; prevent event spam/data-quality manipulation |
| `POST /api/ai/roadmap` (sync) | JWT auth and both AI feature entitlements | Controller checks personalized-roadmap entitlement, consumes roadmap allowance and obtains admission lease; generator receives authenticated user ID | Sync private ownership/publication invariant remains a known architecture gap; negative tests for failed generation cleanup |
| `POST /api/ai/roadmap/draft`, `GET /api/ai/roadmap/:draftId`, `GET .../events`, `POST .../cancel`, `POST /api/ai/roadmap` (async) | JWT auth and both AI feature entitlements | Controller checks both entitlements; draft, polling, cancellation and event-stream lookups use authenticated `userId`; node/course updates filter by `createdForUser` | Cross-user draft IDOR, event-stream reconnect, concurrent cancel/finalize, entitlement revoked while a job is queued |
| `POST /api/ai/quiz`, `POST /api/ai/practice-quiz`, quiz submission routes | JWT auth | Generation and submission call `ensureCourseLearningAccess`; quiz bank lookup is scoped by course/lesson and approved/non-hidden state; attempt writes include authenticated user | Cross-user/private course, guessed lesson/bank IDs, monthly AI usage reservation, multi-instance job dedupe |
| `GET /api/ai/usage` | JWT auth | Usage lookup uses authenticated user ID | Confirm only the caller's usage and entitlement are returned |
| `POST /api/ai/curation-feedback` | JWT auth | Zod bounds feedback fields; caller ID is assigned server-side | **SEC-06:** submitted resource identity and course association are not proven to have been shown to this learner; submission idempotency is not caller-scoped |
| `POST /api/ai/course`, `POST /api/ai/course/save` | JWT auth plus `courses.manage` and `ai.manage` | Admin content generation path | Verify role/permission combinations and ensure no learner-supplied owner/publication override |
| `/api/roadmaps/*` | Router-wide JWT auth and `personalized_roadmaps` entitlement | Roadmap persistence/read/delete/lesson completion/quiz operations query by both roadmap ID and authenticated user ID | IDOR matrix for all methods and malformed module/lesson indices |
| `GET /api/courses`, `GET /api/courses/search` | Optional JWT; authenticated callers pass `course_search` entitlement | Public catalogue service; details allow a private preview only when `createdForUser` matches the authenticated user | Anonymous/public response projection; verify no private fields leak through preview serializers |
| `GET /api/courses/:id/learn*`, resource retry | JWT auth plus `requireCourseOrFeature("published_courses")` | Controller requires active/completed enrollment and `canAccessCourse`; progress and learning-item services scope to authenticated user | Private roadmap and stale/revoked enrollment tests; paid/subscription edge cases |
| `POST/PUT/DELETE /api/courses*` | JWT auth plus `courses.manage` | Creation forces draft; publish is a separate readiness-gated action; pricing changes require a reason | Ensure partial updates cannot alter server-owned visibility, owner, moderation or publication fields |
| `/api/enrollments/*` | Router-wide JWT auth | Service queries enrollment by authenticated user; course access policy checks private owner, publication, approval, pricing and payment/subscription state | Cross-user enrollment IDs; duplicate enrollment races; refund/revocation access |
| `/api/progress/*` | Router-wide JWT auth and `learning_progress` entitlement | Progress service requires active/completed enrollment and `canAccessCourse`; records are keyed by authenticated user and course | Cross-user progress IDOR; course changes after completion; revoked access |
| `/api/me/*` | Router-wide JWT auth | Export and privacy-request queries use authenticated user ID; export explicitly reports partial coverage | Export inventory completeness and export response size/rate controls |
| `/api/admin/*` | Router-wide JWT auth and admin role; individual routes add named permissions | PII reveal/export, role governance, privacy requests, course publication, pricing, billing/refunds, prompt activation and operations use distinct permission middleware | Full role × route permission matrix; denial tests for every sensitive route; audit-outbox failure behavior |
| `/api/auth/*` | Shared Mongo-backed auth limiter (30 requests / 15 minutes); invitation acceptance is also under this mount | OTP: 10-minute expiry, five failed verification attempts, 60-second resend cooldown and atomic one-time consumption; password reset response avoids account enumeration; JWT token version supports revocation | Per-account/IP combined throttling, OTP concurrency and enumeration regression tests, Google new-account consent (SEC-03) |

### 9.1 Verified positive controls

- Required and optional auth middleware verify JWT signature/expiry, load the account, reject inactive accounts and compare token version against the current user record.
- Admin authorization uses the current database role/permission data placed on the authenticated request, then checks the route's named permission.
- The Mongo rate-limit store throws when it cannot update/read its shared counter. The default express-rate-limit store-error behavior must be confirmed against the installed dependency version and staging; this source inspection alone does not certify fail-closed behavior.
- Roadmap draft lookup, polling, cancellation and event streaming are scoped by authenticated `userId`; per-node course writes additionally filter by `createdForUser`.
- Enrollment, learning and progress services consistently use the authenticated user ID and active/completed enrollment state, with a second course-entitlement/payment/visibility check.
- Local registration requires literal legal acknowledgements. Google login verifies the ID token's audience, subject, email and verified-email claim, but **new-account consent is not required by the current API/service path** (SEC-03).
- Privacy export is explicitly marked `partial_repository_inventory`; privacy request state transitions require identity verification for review/approval/in-progress, and responses explicitly state that execution is unavailable (SEC-04).

### 9.2 Route inventory boundary

The §9 matrix is the original focused cross-check for Build with AI, intent, course learning, roadmap, enrollment/progress, auth, privacy and high-privilege admin routes. The supplemental source review in §§12–14 subsequently extends coverage to billing, payment, Razorpay webhooks, discovery feedback, notifications, saved courses/views, reviews, achievements, consent, legal documents, pricing, trials, curriculum and public social links. Combined coverage is broader, but it is still not a complete generated inventory of every mounted API route and does not replace dynamic authorization/abuse tests. Generate and reconcile the full mounted-route inventory and exact permission registry before closing Task 05.

## 10. Additional finding

### SEC-06 — Curation feedback accepts unverified resource interactions and globally scoped submission IDs

**Priority:** Low–Medium integrity/abuse risk; severity requires product-owner review  
**Sources:** `server/src/routes/ai.routes.js`, `server/src/controllers/courseCurationFeedback.controller.js`, `server/src/services/curationFeedback.service.js`, `server/src/models/CourseCurationFeedback.js`, `server/src/services/courseCurationDecisionEngine.service.js`.

**Verified behavior:**
1. The endpoint requires authentication and validates field types/bounds, then assigns `user` from `req.user.userId`; the client cannot directly choose the stored user ID.
2. The client supplies `resourceId`, `resourceType`, `query`, optional `skillId`, optional `courseId`, optional `rank`, optional `score`, and optional `submissionId`.
3. When `courseId` is supplied, the controller validates only that it is a Mongo ObjectId. It does not verify that the course exists, that the caller can access it, or that the referenced resource was actually displayed to that caller.
4. When `submissionId` is supplied, `persistCurationFeedback` upserts by `submissionId` alone. The unique index is global, not compound with user ID. A collision from another account returns the existing row rather than recording a caller-scoped event.
5. Curation ranking aggregates recent learner feedback by normalized query and resource ID, with per-user grouping for opinion events. The `outdated` event is accepted by the endpoint and contributes to the aggregate signal. A caller can therefore submit an `outdated` opinion for an arbitrary resource ID without the server proving that the resource was shown to that learner.

**Impact:** a malicious or automated account can inject a bounded feedback signal into a resource/query pair, potentially affecting recommendation freshness/quality decisions. Per-user grouping limits repeated events from one user in the aggregate, but does not establish that the interaction was genuine or prevent multi-account manipulation. A globally scoped submission ID can also cause cross-account idempotency collisions and lost attribution.

**Required remediation:**
1. Issue a server-generated, short-lived curation impression/submission token bound to user ID, normalized query, engine version, resource ID/type, and (where applicable) course ID.
2. Accept feedback only against a valid impression token; derive resource/query/course identity from the stored or signed server record rather than client-supplied arbitrary identifiers.
3. Verify the course/resource relationship and access policy before recording course-associated feedback.
4. Make idempotency caller-scoped with a unique compound key such as `{ user, submissionId }`, and reject reuse with a mismatched resource or event.
5. Define which event types are valid and how they contribute to ranking. The current endpoint's `helpful`, `wrong_level`, `not_sure`, `completed` and `abandoned` values are not mapped to the aggregate counters shown in the curation ranking query; document or correct that event contract.
6. Add per-user/resource rate limits, abuse monitoring, and tests for forged impressions, cross-course references, submission-ID collisions, duplicate events and multi-account signal manipulation.

**Acceptance:** every ranking-affecting feedback record is attributable to a verified user interaction with a resource actually presented to that user; idempotency is scoped to the actor; event semantics are tested and documented.

## 11. Updated status and evidence boundary — 2026-11-16

- SEC-01 and SEC-02 code changes are present in the inspected readiness-branch source. The focused tests are present in the branch but have not been executed during this review; both findings remain open pending execution and integration/concurrency evidence.
- SEC-03 is confirmed in current source: Google schema consent fields are optional, and the service can create a new user and issue a token when the consent object is null.
- SEC-04 is confirmed in current source: export is partial, and the privacy-request controller explicitly returns `executionAvailable: false`; status transitions do not execute deletion or anonymization.
- SEC-05 is confirmed in current source: both required and optional auth middleware call `select("+password")`.
- SEC-06 is newly documented from the current feedback route/controller/model/aggregation path.
- The combined route coverage in §§9 and 12–14 is a focused source-mapped cross-check, not a complete generated repository-wide API inventory or dynamic audit. Full route inventory, permission reconciliation and negative-test execution remain required.
- No tests, penetration tests, dependency scans, production-config checks or live provider calls were performed in this task. No application code or runtime configuration was changed.


## 12. Extended route review — billing, discovery, notifications and learner utilities

| Mounted route group | Authentication / route controls | Source-verified ownership or integrity controls | Remaining negative-test focus |
|---|---|---|---|
| `/api/billing` | Public active-plan listing precedes router-wide JWT middleware; all account billing routes require JWT | Payment, subscription, trial, refund and payment-issue reads are filtered by authenticated user. Refund/issue creation verifies payment ownership and uses active-payment uniqueness. Subscription cancellation looks up the caller's active Razorpay subscription. | Concurrent refund creation, cross-user payment/refund IDs, amount/currency boundaries, subscription sync replay, stale provider state and cancellation races |
| `/api/payments` | Router-wide JWT; global payment limiter (30/15 min) and payment-availability middleware | Course order creation loads only published, non-private, non-archived, approved generated courses; amount derives from server-side course pricing. Payment verification loads payment by both payment ID and authenticated user ID, verifies order signature, fetches provider payment and validates captured amount/currency/order before granting enrollment. | Cross-user payment ID, altered amount/currency, replayed signature/payment ID, changed course price between order and capture, duplicate concurrent verification |
| `/api/webhooks/razorpay` | No user JWT (provider callback); webhook limiter (120/min) and payment-availability middleware | Raw request body is retained for HMAC signature verification; invalid signatures are rejected. Event IDs are claimed/deduplicated with a processing lease. Captured course payment is matched to provider order and validated against stored checkout amount/currency before payment transition. | Missing/rotated webhook secret, malformed raw body, duplicate and out-of-order events, stale subscription events, lease expiry during processing, refund/payment cross-reference mismatch |
| `/api/discovery` | Public search and playlist routes use optional JWT; signed-in search requires `course_search`; create/enroll/save actions require JWT and feature entitlement. Feedback has a separate 120/hour route limiter before optional JWT. | Enrollment uses the shared enrollment service; save/enroll paths bind saved/enrollment records to authenticated user. | **SEC-07:** discovery feedback accepts anonymous preview and client-supplied resource/query/event identity; signed-in feedback can submit ranking-affecting event types without server-issued impression proof. **SEC-08:** YouTube save controller omits authenticated user ID when creating/resolving a course. |
| `/api/notifications` | Unsubscribe landing/POST are token-based public routes; remaining routes use router-wide JWT | Notification list/read operations filter by authenticated user. Push endpoints are restricted to public HTTPS browser push providers; registration rejects endpoint takeover by another user; removal is owner-scoped. Unsubscribe uses a signed token and explicit POST confirmation rather than mutating on GET. | Token expiry/key rotation/replay, cross-user notification IDs, push endpoint SSRF variants and concurrent endpoint-ownership races |
| `/api/saved-courses` | Router-wide JWT | List, create and delete operations scope SavedCourse by authenticated user. Standard save requires a published course. | Cross-user saved record IDs; private/unapproved course rejection; YouTube save path ownership boundary (SEC-08) |
| `/api/reviews` | Public review list; JWT required for create/update/delete | Public list filters hidden/unapproved reviews; write service requires active/completed enrollment and keys review by authenticated user + course; delete is owner-scoped. | Cross-user review IDs, revoked enrollment, review moderation race and attempts to review private/unpublished courses |
| `/api/achievements` | Router-wide JWT | Stats and preferences are requested using authenticated user ID. | Cross-user identifier injection and strict schema/field allowlist tests |
| `/api/consent` | Public policy-version metadata; remaining routes use per-route JWT | Consent status, legal acceptance, cookie preferences, profile completion and marketing consent derive actor ID from authenticated principal. | User-supplied policy version mismatch, repeated/contradictory consent events, cross-account mutation and consent audit completeness |
| `/api/legal` | Public document read; admin document mutations require JWT, admin role and `legal.manage` | Draft/publish/unpublish/archive/history actions are permission-gated. | Content sanitization/XSS, immutable version history, publish race and unauthorized role matrix |
| `/api/admin/pricing`, `/api/admin/trials`, `/api/admin/saved-views`, `/api/courses` curriculum routes | JWT + admin role + route-specific permission; saved-view reads require `dashboard.read`, mutations require `saved_views.manage` | Saved-view updates/deletes query by both view ID and owner; pricing/trial/curriculum routes have explicit named grants. | Cross-admin role × permission matrix, tenant/object IDOR, numeric boundary/rollback replay, audit event completeness |
| `/api/public/social-links` | Public | Controller queries only an explicit allowlist of keys with `isPublic: true` and selects key/value/public flag. | Ensure no private setting is returned through malformed key, duplicate setting or future schema changes |

### 12.1 SEC-07 — Discovery feedback endpoint accepts unverified impressions and anonymous writes

**Priority:** Medium integrity/abuse risk  
**Sources:** `server/src/routes/discovery.routes.js`, `server/src/controllers/discovery.controller.js`, `server/src/services/courseCurationDecisionEngine.service.js`, `server/src/models/CourseCurationFeedback.js`.

**Verified behavior:**
1. `POST /api/discovery/curation-feedback` applies a route-level 120/hour limiter and then `optionalAuthMiddleware`; authentication is not mandatory for the route.
2. The controller permits unauthenticated callers to submit `preview` events. Other event types require a signed-in user.
3. Signed-in callers can submit `save`, `enroll`, `thumbs_up`, `thumbs_down`, `outdated` and `report` events with client-supplied query, resource ID/type, engine version, rank and score. The controller does not verify a server-issued impression or confirm that the resource was actually shown to the caller.
4. The controller persists feedback to the same `CourseCurationFeedback` collection used by curation ranking. `save`, `enroll`, opinion and outdated events also invalidate normal-search curation cache.
5. The route's express-rate-limit instance does not specify the Mongo-backed shared store used by the global API limiter; its effective cross-instance behavior depends on the library's default store.

**Impact:** authenticated users can inject synthetic ranking signals for arbitrary resource/query pairs. Anonymous clients can generate persistent preview rows and consume write capacity. The route has no impression provenance and its rate-limit configuration does not establish a shared cross-instance per-user budget.

**Required remediation:**
- Require a server-issued, short-lived impression token for every feedback event; bind it to query, resource ID/type, engine version and authenticated actor where applicable.
- For `preview`, either record server-observed impressions in the search response path or explicitly treat client events as low-trust telemetry that cannot influence ranking.
- Derive query/resource identity from the validated impression rather than accepting arbitrary client values.
- Use a shared limiter and per-user/resource abuse controls; bound anonymous preview persistence and retention.
- Define event semantics consistently across both feedback endpoints and the ranking aggregation; test that unsupported events cannot silently become trusted signals.

**Acceptance:** no client can create a ranking-affecting feedback record without a verifiable impression; anonymous preview traffic cannot create unbounded persistent writes; distributed rate limits behave as intended.

### 12.2 SEC-08 — YouTube save path does not pass the authenticated owner into course resolution

**Priority:** Medium ownership/privacy boundary risk  
**Sources:** `server/src/routes/discovery.routes.js`, `server/src/controllers/discovery.controller.js`, `server/src/services/discovery.service.js`, `server/src/utils/coursePreview.js`.

**Verified behavior:**
1. `POST /api/discovery/youtube-course/save` requires JWT and the `course_search` entitlement.
2. The controller parses the requested YouTube resource and calls `getOrCreateYouTubeResourceCourse(input)` without passing `req.user.userId`.
3. The service's `userId` parameter defaults to `null`. When it receives a non-approved discovery course, it returns the shared base course rather than calling `createPrivateCourseForUser`.
4. The prepare and enroll controller paths pass `userId: req.user.userId` into the same service, which then creates/resolves a private learner copy for unapproved resources.
5. The save controller then associates the returned course with the authenticated user's SavedCourse record and returns `toPublicCoursePreview(course)`. That projection includes course and module/lesson metadata (while intentionally excluding lesson content and provider URLs).

**Impact:** the save path does not follow the owner-isolation behavior used by prepare/enroll. It can associate a learner's saved item with the shared base course, including a course whose review/publication state is not approved. The preview projection may expose metadata for a base course that should instead have been resolved as a learner-owned private copy. This is an ownership-boundary inconsistency; actual cross-user private-copy disclosure must be confirmed with a negative test before severity is finalized.

**Required remediation:**
- Pass the authenticated `userId` into `getOrCreateYouTubeResourceCourse` from the save controller.
- Require the service to reject missing owner context for learner-facing save/prepare/enroll actions; reserve null-owner behavior for explicit admin/system callers.
- Ensure saved-course association and response projection reference only the learner's private copy or an approved public course.
- Add tests for an existing unapproved resource, a resource previously prepared by User A, save by User B, and public approved resource behavior.

**Acceptance:** save, prepare and enroll resolve the same user-specific private course for unapproved resources; no learner-facing save response or saved record references another learner's private/unapproved base course.

## 13. Billing and provider control notes

The source review found several important positive controls, but these are not a substitute for staging tests:
- Payment order amount is derived from the stored course price, not accepted from the checkout request.
- Payment verification scopes the local payment record to the authenticated user, checks the order ID and payment signature, fetches the provider payment, then validates amount/currency/order before marking paid.
- Razorpay webhooks require a signature over the captured raw request body; event processing uses a deduplication claim and lease.
- Course capture webhook handling validates provider capture details against the local pending checkout before transitioning payment state.
- Billing reads, refund requests and payment issue records are scoped to the authenticated user; refund amounts are checked against remaining refundable balance.
- Notification reads and push-subscription mutations are user-scoped; push endpoint takeover is rejected.

**Still required:** replay and concurrency tests; out-of-order webhook tests; payment and refund ownership tests; provider-secret rotation tests; webhook lease recovery; refund reconciliation mismatches; and verification that the default in-memory route limiter is not relied upon as a distributed abuse boundary.

## 14. Updated evidence boundary — 2026-11-16 (extended routes)

The following route files and source paths were additionally inspected:
- `server/src/server.js`
- `server/src/routes/billing.routes.js`
- `server/src/routes/payment.routes.js`
- `server/src/routes/webhook.routes.js`
- `server/src/routes/discovery.routes.js`
- `server/src/routes/notification.routes.js`
- `server/src/routes/savedCourse.routes.js`
- `server/src/routes/review.routes.js`
- `server/src/routes/achievement.routes.js`
- `server/src/routes/consent.routes.js`
- `server/src/routes/legal.routes.js`
- `server/src/routes/adminPricing.routes.js`
- `server/src/routes/adminTrials.routes.js`
- `server/src/routes/savedView.routes.js`
- `server/src/routes/curriculum.routes.js`
- `server/src/controllers/payment.controller.js`
- `server/src/controllers/webhook.controller.js`
- `server/src/controllers/discovery.controller.js`
- `server/src/services/discovery.service.js`
- `server/src/controllers/notification.controller.js`
- `server/src/controllers/savedCourse.controller.js`
- `server/src/services/review.service.js`
- `server/src/controllers/consent.controller.js`
- `server/src/controllers/savedView.controller.js`
- `server/src/utils/coursePreview.js`

No dynamic tests, penetration tests, dependency scans or staging/provider tests were performed. No application code or runtime configuration was changed.


## 15. Security negative-test specification — 2026-11-16

Created [Security Negative-Test Specification](SECURITY_NEGATIVE_TEST_SPECIFICATION.md) v1.0. It maps SEC-01–SEC-08 to explicit unit, integration, API, concurrency, staging and manual cases; defines synthetic fixtures, expected status/error behavior, no-side-effect assertions and evidence capture; and adds cross-cutting IDOR, entitlement, admin RBAC, payment, Razorpay webhook replay/order, rate-limit, input-validation, prompt-trust and log-redaction cases. P0/P1/P2 release gates and unresolved policy decisions are recorded. The role × permission matrix is intentionally a fixture proposal until reconciled against the repository's exact role registry.

**Status boundary:** specification only. No tests were executed, no application code/configuration/feature flags changed, and no production or provider requests were made. SEC-01–SEC-08 remain open until remediation and execution evidence satisfy the acceptance criteria. SEC-04 deletion fulfilment and SEC-03 consent policy cannot be marked complete from documentation alone.

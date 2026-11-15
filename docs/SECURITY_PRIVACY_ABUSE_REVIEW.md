# Security, Privacy and Abuse Review — Build with AI & Course Discovery

**Status:** Source-mapped review v0.1 — remediation and security test evidence pending  
**Date:** 2026-11-15  
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

**Not performed:** no code was modified; no tests or penetration tests were run; no production environment values were inspected; no live provider requests were made; no secrets or private learner records were accessed or copied.

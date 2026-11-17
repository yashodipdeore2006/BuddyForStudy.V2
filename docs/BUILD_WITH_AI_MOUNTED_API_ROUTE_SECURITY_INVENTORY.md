# Mounted API Route Security Inventory

**Baseline:** `main` at the P1-05 audit snapshot  
**Scope:** Express mounts in `server/src/server.js`, route declarations, router-level middleware, and route-level middleware.  
**Purpose:** P1-05 security inventory. This is a static registration/middleware audit, not proof that controller-level ownership, validation, webhook signature, or business-rule checks are correct.

## Server-wide controls

- `requestId` is mounted before routes.
- Helmet, CORS policy, JSON/urlencoded body limits, and safe request logging are configured globally.
- A shared API rate limiter is mounted before API routers.
- Payment routes additionally receive a payment-specific limiter and the payment-availability gate.
- Webhook routes additionally receive a webhook-specific limiter and the payment-availability gate.
- Health endpoint `GET /health` is mounted directly; health router is mounted at `/api/health`.
- Unknown-route and error handlers are mounted after all routes.

## Mounted router inventory

| Mount prefix | Router module | Registration-level access posture | Required controller-level verification |
|---|---|---|---|
| `/api/health` | `health.routes.js` | Public | Readiness output must not disclose secrets, internal topology, or sensitive dependency details. |
| `/api/public` | `publicSettings.routes.js` | Public | Public social-link response must be allowlisted and exclude private/admin configuration. |
| `/api/consent` | `consent.routes.js` | Public policy-version metadata; remaining routes use JWT | Acceptance must bind to authenticated actor, exact policy version, timestamp and source; profile/marketing changes must be actor-scoped. |
| `/api/auth` | `auth.routes.js` | Registration/login/OTP/password/Google endpoints public; profile/password/logout/me use JWT | Verify OTP expiry/attempt limits, registration abuse controls, invitation single-use/expiry, Google account consent and token lifecycle. |
| `/api/me` | `me.routes.js` | Router-wide JWT | Learning pace, export and privacy requests must only read/write the authenticated user's records; export must be complete and privacy requests must be executable. |
| `/api/courses` | `course.routes.js` | Browse/search/details use optional JWT; learning routes require JWT plus course/feature entitlement; mutations require course-management permission | Validate publication visibility, paid-course ownership, course/item relationship, admin permission and object-level checks. |
| `/api/enrollments` | `enrollment.routes.js` | Router-wide JWT | Every read/update/delete must scope enrollment to actor; enrollment must enforce course availability, payment/entitlement and idempotency rules. |
| `/api/progress` | `progress.routes.js` | Router-wide JWT plus learning-progress entitlement | Verify progress record ownership and that course/item belong together; completion updates must be idempotent and cannot affect another learner. |
| `/api/admin` | `adminPro.routes.js` | Router-wide JWT + admin role; named permission per route except explicit self-access `GET /access` | Keep exception self-only; verify all privileged actions enforce resource scope and audit actor/action/result. |
| `/api/admin/pricing` | `adminPricing.routes.js` | Router-wide JWT + admin role + `pricing.manage` per route | Preview/apply/rollback must validate batch ownership/state, prevent replay and preserve immutable audit history. |
| `/api/admin/trials` | `adminTrials.routes.js` | Router-wide JWT + admin role + `trials.manage` per route | Grant operations must validate target, duration, duplicate/replay behavior and audit actor. |
| `/api/admin/saved-views` | `savedView.routes.js` | Router-wide JWT + admin role; named permission coverage checked by P1-05 test | Verify saved-view scope and prevent cross-admin data access. |
| `/api/admin` | `admin.routes.js` | Router-wide JWT + admin role; named permission coverage checked by P1-05 test | Verify each administrative resource and mutation is permission- and scope-checked. |
| `/api/courses` | `curriculum.routes.js` | Admin-only router mounted on shared course prefix | Verify admin role/permission and course/module publication invariants. |
| `/api/ai` | `ai.routes.js` | JWT on learner endpoints; feature gates on roadmap; course generation requires course + AI permissions | Verify actor propagation into async jobs, quota reservation, draft ownership, quiz ownership and AI output validation. |
| `/api/intent` | `intent.routes.js` | JWT on all routes; feature gate on parse; dedicated limiter | Verify event actor attribution, payload schema, rate-limit identity and that analytics events cannot be forged to affect ranking. |
| `/api/advanced-ai` | `advancedAI.routes.js` | JWT; feature gate on insight/ask | Verify quota/usage accounting, actor-scoped conversation context, input limits and provider failure handling. |
| `/api/billing` | `billing.routes.js` | Public plans route; router-wide JWT for remaining routes | Verify subscription sync cannot attach another user's subscription; cancellation, trial and issue/refund creation are actor-scoped and idempotent. |
| `/api/roadmaps` | `roadmap.routes.js` | Router-wide JWT + personalized-roadmaps feature | Verify roadmap ownership on get/delete/complete/quiz operations; enforce roadmap/lesson/module relationship and idempotent completion. |
| `/api/discovery` | `discovery.routes.js` | Search/course-search/playlist use optional JWT; enroll/prepare/save require JWT + course-search entitlement; curation feedback uses optional JWT + limiter | Anonymous feedback is a known abuse-control risk; enforce impression/provenance proof, idempotency and ranking eligibility server-side. Verify prepared/saved resources and enrollment actor ownership. |
| `/api/reviews` | `review.routes.js` | Public list; create/update/delete use JWT | Verify one review per eligible learner/course, enrollment or purchase eligibility, author-only mutation, moderation and content validation. |
| `/api/achievements` | `achievement.routes.js` | Router-wide JWT | Verify achievement and preference records are actor-scoped; clients cannot self-award or mutate server-calculated achievements. |
| `/api/notifications` | `notification.routes.js` | Public unsubscribe landing/action; remaining routes use JWT | Unsubscribe token must be signed, scoped, expiry-bound and one-purpose; notification read/preferences/push subscriptions must be actor-owned; test-push must not become an abuse vector. |
| `/api/saved-courses` | `savedCourse.routes.js` | Router-wide JWT | Verify all saved-course reads/writes/deletes are scoped to authenticated learner and target course is eligible. |
| `/api/legal` | `legal.routes.js` | Public document reads; admin mutations use JWT + admin role + `legal.manage` | Verify published-only public visibility, immutable/versioned publication history and admin audit trail. |
| `/api/payments` | `payment.routes.js` | Router-wide JWT; mount-level payment limiter and payment-enabled gate | Verify order amount/currency/course/plan are server-derived; verify payment signature/order binding, actor binding and duplicate callback/replay behavior. |
| `/api/webhooks` | `webhook.routes.js` | No user JWT by design; webhook limiter and payment-enabled gate | Razorpay signature must be verified against raw request bytes and webhook secret; enforce event idempotency, timestamp/replay policy and safe failure/retry semantics. |

## Explicit public and optional-auth surfaces

The following routes are registered without mandatory JWT authentication, by design or as configured in the route modules:

- Direct `GET /health`; `GET /api/health` and `GET /api/health/ready`.
- `GET /api/public/social-links`.
- `GET /api/consent/policy-versions`.
- Authentication bootstrap and recovery routes under `/api/auth` (registration, invitation acceptance, login, OTP/email verification, resend, password recovery/reset and Google login/config).
- `GET /api/courses`, `GET /api/courses/search`, `GET /api/courses/:courseId/roadmap`, and `GET /api/courses/:courseId` use optional authentication.
- `GET /api/billing/plans`.
- `GET /api/discovery/search`, `GET /api/discovery/course-search`, `GET /api/discovery/playlists/:playlistId` use optional authentication.
- `POST /api/discovery/curation-feedback` uses a limiter and optional authentication. This is not proof of learner identity or genuine impression and remains an explicit abuse-control finding.
- `GET /api/reviews/courses/:courseId`.
- `GET /api/notifications/unsubscribe` and `POST /api/notifications/unsubscribe`.
- Public legal document reads under `/api/legal/documents`.
- Razorpay webhook endpoint under `/api/webhooks/razorpay`, which must authenticate via provider signature rather than user JWT.

Public does not mean unrestricted: validate schema, payload size, rate limits, response allowlists, replay protections and abuse monitoring for each route.

## Cross-cutting findings and existing backlog links

1. **SEC-05 — authentication over-fetch:** `authMiddleware` and `optionalAuthMiddleware` currently select `+password` while constructing routine request identity. This contradicts least-data retrieval and should be addressed by P1-04.
2. **SEC-06/SEC-07 — feedback provenance and abuse:** AI/discovery feedback routes require server-verifiable impression provenance, actor attribution where available, deduplication/idempotency and anti-manipulation controls. Anonymous discovery feedback is specifically not equivalent to authenticated learner feedback.
3. **SEC-01/SEC-02 — async profile/actor/quota:** AI roadmap and quiz background flows must carry trusted actor identity and reserve usage atomically; see P1-01/P1-02.
4. **SEC-03/SEC-04 — consent and privacy:** Google registration consent and executable export/deletion remain open; authenticated route presence alone does not implement those product/legal guarantees.
5. **Webhook trust boundary:** webhook routes intentionally omit JWT. Provider signature validation against raw body, event idempotency and safe retry behavior must be verified in controller/service tests.
6. **Ownership boundary:** every learner-owned resource route needs negative tests using two distinct users (owner succeeds; non-owner cannot read, mutate, delete, complete, cancel, or export the owner's resource).
7. **Entitlement boundary:** feature middleware is present on several route groups, but tests must cover direct HTTP access (not just UI gating), individual course purchase access, disabled features, admin bypass semantics and expired/revoked entitlements.

## Completion criteria for P1-05

This inventory establishes the mounted route map and registration-level middleware posture. P1-05 remains **in progress** until all of the following are evidenced:

- Route-level authorization matrix is reconciled against every controller/service and every effective mounted path, including duplicate prefixes and direct `app.get` routes.
- Object ownership and role/permission boundaries are confirmed in implementation, not inferred from JWT middleware.
- Public and optional-auth endpoints have documented abuse controls and negative tests.
- Payment/webhook signature and idempotency tests pass.
- Two-user negative authorization tests cover learner-owned resources and admin permission boundaries.
- CI executes the relevant tests successfully on the final inventory revision.


## Public endpoint abuse-control audit (2026-11-17)

### Controls confirmed in source

| Surface | Current control | Assessment |
|---|---|---|
| All API groups after health mounts | Shared Mongo-backed Express rate limiter: 1,000 requests per 15 minutes, keyed by the Express client IP default | Baseline protection only; broad ceiling is not a substitute for route-specific limits on expensive endpoints. |
| `/api/auth/*` | Additional shared auth limiter: 30 requests per 15 minutes | Applies to registration, invitation acceptance, login, OTP, recovery and Google login routes under the router. |
| `/api/auth/google/config` | Shared API limiter; direct route is registered outside the `/api/auth` router and therefore does not receive the auth-specific limiter | Read-only configuration endpoint; this is an intentional low-cost exception to the auth-router limiter. |
| `/api/discovery/curation-feedback` | Additional limiter: 120 events per hour, mounted before optional JWT parsing | Per-IP default key; anonymous `preview` events are allowed. Authenticated events still need trustworthy impression provenance and actor/idempotency enforcement. |
| YouTube API provider calls | Shared daily quota accounting; atomic Mongo reservation across API instances; refuses provider calls when quota storage is unavailable | Useful provider-wide ceiling and fail-closed behavior, but it does not impose a tailored per-IP/per-user request ceiling. |
| `/health`, `/api/health/*` | Mounted before the shared API limiter | Explicit operational exception so liveness/readiness remain available if the rate-limit store fails. Handlers are synchronous and expose only generic service/database readiness state. |
| `/api/notifications/unsubscribe` | HMAC-SHA256 capability token, constant-time signature check, ObjectId subject validation, expiry validation and 2,048-character token bound | GET only displays confirmation; POST performs the preference change. Token remains replayable until expiry, but the operation only disables promotional email and is idempotent in intent. |

Authentication also has complementary per-OTP controls: one-time codes expire after 10 minutes, resend is cooled down for 60 seconds per account/purpose, verification stops after five incorrect attempts, and successful consumption is atomic. The forgotten-password handler returns an indistinguishable public response when an account is absent or delivery fails.

### Residual abuse-control gaps

1. **Discovery search and playlist expansion are under a broad ceiling.** Public/optional-auth `GET /api/discovery/search`, `GET /api/discovery/course-search` and `GET /api/discovery/playlists/:playlistId` do not have their own route-specific rate limiter. They rely on the shared 1,000-request/15-minute API ceiling and the global YouTube quota budget. The playlist cache is process-local, so separate API instances can repeat provider work on cache misses. Recommend a smaller route-specific IP limit plus authenticated per-user budget and shared cache/coordination before broad public launch.
2. **Public review listing is not paginated.** `listReviews(courseId)` queries all approved, visible reviews for the course and returns the full array. It is behind the shared API limiter, but a sufficiently large course review set can still produce a costly query/response. Add bounded pagination or a server-side maximum before increasing traffic.
3. **Curation feedback is not proven by the rate limiter.** The 120/hour IP ceiling is helpful, but IP rotation can bypass it. The payload currently includes client-supplied event, resource ID, engine version, rank and score; the controller accepts anonymous preview events and does not require a server-issued impression token. SEC-06/SEC-07 remain open: feedback that affects ranking must be bound to an authenticated actor or narrowly constrained anonymous preview, verified against a server-issued impression, deduplicated and idempotent.
4. **Direct Google config is intentionally global-limited only.** It returns whether Google OAuth is enabled and the public client ID; keep the response limited to those public bootstrap fields.

### Regression tests added for this audit

`server/test/publicEndpointAbuseControls.test.js` checks:
- the shared limiter is mounted before the public and optional-auth API groups;
- the only pre-limiter API mounts are the intended lightweight health probes;
- authentication routes retain their dedicated limiter;
- discovery feedback is limited before optional authentication/controller processing;
- YouTube quota admission fails closed if the shared quota store is unavailable; and
- unsubscribe capability tokens reject tampering, expiry and oversized input.

These are focused registration/contract checks, not a penetration test or proof of production rate-limit settings. Production trust-proxy configuration, request limits and provider quotas still require deployment verification.

No runtime authorization behavior is changed by this document.

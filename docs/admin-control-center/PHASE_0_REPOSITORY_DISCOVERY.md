# Phase 0 — Repository Discovery Report

- Repository: `yashodipdeore2006/BuddyForStudy.V2`
- Target branch: `test` only
- Inspected branch head before this report: `a5098a2bbbeb653febda117c40a4f6fec7e34938`
- Specification: `BuddyForStudy_Unified_Admin_Control_Center_Implementation_Blueprint`, version 1.0, 11 October 2026
- Status: repository inspection completed; baseline execution tests not run in this environment.

## 1. Executive summary

BuddyForStudy already has a React + TypeScript admin interface and a Node.js + Express + MongoDB backend. The admin UI is not starting from zero: existing pages cover overview, users, courses, analytics, plans/pricing, billing/refunds, communications, coupons, audit logs and settings. The backend already exposes admin-protected endpoints for many of those areas.

The blueprint's Phase 0 requirement is to discover and preserve the current implementation before adding features. This report records the code-level inventory and risks. No application code, schemas, routes, or learner behavior were changed as part of discovery; this report is the only intended repository change.

## 2. Stack and repository shape

### Frontend
- React 18, TypeScript, Vite 5, React Router 7, Tailwind CSS 3, lucide-react.
- Root scripts: `dev`, `build`, `lint`, `typecheck`.
- Main entry/routing: `src/main.tsx`, `src/App.tsx`.
- Shared admin API client: `src/lib/adminApi.ts`; uses the existing token helper from `src/lib/api.ts`.

### Backend
- Node.js ES modules, Express 5, MongoDB/Mongoose 8, JWT authentication.
- Security/operations packages include Helmet, express-rate-limit, Morgan, Sentry integration, Nodemailer, Redis client, Zod and Razorpay.
- Server entry: `server/src/server.js`.
- Backend scripts: `dev`, `start`, `lint`, `test`, `worker`, `verify:deployment`.

### Existing CI
`.github/workflows/ci.yml` runs on pushes to `main` and `test`, and pull requests targeting `main`. It defines:
- Frontend: `npm ci`, `npm run typecheck`, `npm run build`.
- Backend: `npm install`, `npm test`, and `node --check` for every server JavaScript file.
- CI backend environment uses a local MongoDB URI and a test JWT secret.

The current `test` commit has no reported commit-status checks (GitHub status response: zero status entries); this does not establish whether a workflow is queued or has run.

## 3. Routes and current behavior observed

### Authentication and authorization
- Existing login/register, email verification, login verification, password recovery/reset, Google sign-in, profile update, password change, logout and current-user endpoints are registered under `/api/auth`.
- `authMiddleware` verifies the Bearer JWT, reloads the user, rejects inactive users and attaches user/role/accessType to the request.
- `adminMiddleware` requires both `role === "admin"` and `accessType === "admin"`.
- Frontend `AdminGuard` checks the authenticated profile role and redirects non-admin users; server authorization is separately applied to admin routers.
- `/admin/login` redirects to the existing `/login`, matching the product direction of one login entry point.
- Important verification still required: trace token issuance and role/accessType transitions in the auth controller/service and test all protected admin endpoints, including a normal user token and a token with an unexpected accessType.

### Admin frontend routes
The current `src/App.tsx` routes include:
- `/admin` — AdminControlCenter
- `/admin/analytics` — AdminAnalytics
- `/admin/users` — AdminUsersPro
- `/admin/courses` — AdminCoursesPro
- `/admin/plans` — AdminPlans
- `/admin/billing` — AdminBilling
- `/admin/communications` — AdminCommunications
- `/admin/coupons` — AdminCoupons
- `/admin/settings` — AdminSettings
- `/admin/audit` — AdminAudit

The unified AdminLayout currently supplies one navigation shell. Several blueprint areas are not yet represented as dedicated navigation destinations (for example resource library, assessment operations, integrations, support, jobs/incidents and privacy workflows). Some of these may be partly covered by existing pages/services; inspect before creating new ones.

### Admin backend routes
Two routers are mounted at `/api/admin`: `adminPro.routes.js` and `admin.routes.js`. Both apply `authMiddleware` and `adminMiddleware`.
- Admin Pro includes overview, users/detail/update, course/detail/update, course modules/lessons/resources/tutorials, plans, payments/refunds, notification/email/announcement send, settings, coupons, audit logs, analytics and health.
- Legacy admin router also defines users/update and analytics. These overlapping endpoints are a maintainability risk; do not remove or consolidate them until their callers and response contracts are traced.
- Existing user-facing API groups include courses, enrollments, progress, curriculum, AI, advanced AI, billing, roadmaps, discovery, reviews, achievements, notifications, saved courses, payments and webhooks.

## 4. Existing data models confirmed

Models inspected include:
- `User`: name, unique email, hidden password field, role (user/admin), active state, email verification, auth provider and Google identity fields.
- `Course`: stable slug, category, difficulty, duration, outcomes, modules and nested lessons; lesson types include tutorial, project and quiz. Course pricing, publishing, enrollment and generation metadata are already represented.
- `Enrollment`: user/course relationship, status and unique user/course index.
- `Progress`: completed lesson IDs/types/timestamps, counts, percentage and last-accessed fields, unique per user/course.
- `Payment`: amount/currency/provider identifiers and payment status.
- `LearningRoadmap`: user query, canonical topic, course-like modules, skill graph, personalization, lessons, completed lesson IDs, quiz attempts and status.
- Additional admin-relevant models exist for subscriptions/plans, refund requests, notifications, announcements, audit logs, platform settings, coupons and webhook events.

Preservation rule: extend these sources of truth additively. Do not introduce competing Course, Enrollment, Progress, Payment or entitlement models to satisfy the admin UI.

## 5. Feature inventory against the blueprint

| Blueprint area | Discovery status | Notes / next step |
|---|---|---|
| Unified admin shell | Existing | AdminLayout and shared navigation exist. Improve only after inspecting page coverage and responsiveness. |
| Command center | Existing | Overview reads real MongoDB counts and recent records; confirm metric definitions and error/empty states. |
| Users & identity | Existing/partial | Directory, details and updates exist. Verify suspension side effects, session revocation, privacy-safe fields and audit coverage. |
| Courses & curriculum | Existing/partial | Course editor and nested modules/lessons/resources exist. Verify validation, publishing lifecycle, revision history and learner progress preservation. |
| Learning paths & discovery | Existing/partial | AI roadmap, discovery and saved roadmap services exist. Verify duplicate detection, resource completeness and no-result/fallback behavior. |
| AI control center | Partial/unknown | AI routes/services and usage tracking exist; provider registry, prompt versioning, budgets and quality/cost dashboards need detailed verification. |
| Learning resources | Partial/unknown | Resource/video/playlist structures exist inside course content and discovery services; a centralized library and impact analysis were not confirmed. |
| Assessments | Partial/unknown | Quiz schema/service and AI quiz routes exist. Verify question-bank management, versioning, attempts, regrading and certificates. |
| Pricing & commerce | Existing/partial | Plans, coupons, subscription features and billing are present. Verify per-course pricing rules and entitlement synchronization. |
| Payments & finance | Existing/partial | Razorpay service, payment routes, webhook route and refund model exist. Verify signatures, idempotency, out-of-order events, refund reconciliation and invoices. |
| Notifications & automation | Partial | In-app notifications, announcements and send endpoints exist. A complete shared multi-channel delivery/workflow engine was not confirmed. |
| Engagement & growth | Unknown/partial | Some notifications/achievements exist; onboarding/inactivity/referral/experiment workflows need inspection. |
| Support & feedback | Partial/unknown | Reviews exist; ticketing and complaint workflow were not confirmed in inspected routes/models. |
| CMS, SEO & localization | Unknown | No dedicated CMS route/model was confirmed in the inspected inventory. |
| Analytics & reports | Existing/partial | Analytics endpoints/pages exist; metric definitions, cohorts, exports and AI cost reports need verification. |
| Integrations & developer tools | Partial | Google, YouTube, Razorpay, SMTP, Redis and Sentry configuration appear in the codebase; central provider health/secret rotation controls need verification. |
| Security, privacy & compliance | Partial | JWT/admin middleware and AuditLog exist. MFA, role/permission scopes, access reviews and privacy request workflows were not confirmed. |
| Platform settings | Existing/partial | PlatformSetting model and admin settings endpoints exist. Verify validation, audit trail, feature flags and rollback. |
| Reliability & infrastructure | Partial | health endpoints, worker, Sentry and deployment verification script exist. Queue console, incident management, backup/restore status and tested recovery need verification. |
| Admin workspace settings | Partial/unknown | Current layout has account/sign-out behavior; staff account and granular permission administration were not confirmed. |

Status is based on the inspected branch files and is not a claim that every feature in a category is complete.

## 6. Category classification

### Category A — Universal shared capabilities
Implement or extend once and reuse across the learner application and admin console:
- Notification records, preferences, consent, delivery tracking and channel adapters.
- Event contracts, job processing/scheduling, retry/backoff and deduplication.
- Audit trail and structured observability.
- Shared search, filters, pagination, exports and reusable action/form patterns.
- Configuration/feature flags and provider health abstractions.

Before adding these, search for and reuse existing Notification, AuditLog, PlatformSetting, worker and cache/services.

### Category B — Safe admin additions
Prefer read-only views using existing authoritative data:
- Overview and operational summaries.
- User, course/curriculum, roadmap, resource, quiz/progress, payment/refund and audit viewers.
- AI request/usage diagnostics where data already exists.
- Integration health summaries and links to source records.

Read-only does not mean automatically safe: enforce backend authorization and avoid exposing password fields, JWTs, credentials or unnecessary personal data.

### Category C — Architecture/functionality changes
Require explicit service contracts, authorization, idempotency and regression tests:
- Granular permissions/MFA/session revocation.
- Course publication/versioning changes and new curriculum fields.
- Shared notification delivery/workflow engine and new delivery/consent records.
- AI provider routing/prompt versioning/budgets.
- Payment/refund/invoice/entitlement changes.
- Jobs, scheduler, exports, privacy workflows, CMS and incident-management persistence.
- New indexes, backfills or data migrations.

## 7. Risks and required follow-up

1. **Overlapping admin routers:** `admin.routes.js` and `adminPro.routes.js` both register `/users`, `/users/:userId`, and `/analytics`; mount order affects which duplicate route handles requests. Inventory frontend callers before changing.
2. **Admin role/token contract:** frontend role guard and server role plus `accessType` checks must agree. Verify token issue/refresh/login flows with tests.
3. **Sensitive fields:** legacy admin user list excludes password explicitly in its query, while the newer user model also marks password `select: false`. Check every admin response for safe projections and secrets.
4. **Financial invariants:** payment, refund, subscription and entitlement state must remain separate; verify webhook signature and idempotency behavior before expanding controls.
5. **Course/progress compatibility:** nested course schema includes lessons, quiz questions and resource metadata; edits must preserve existing embedded IDs where progress depends on lesson IDs.
6. **Notification side effects:** existing endpoints can send notifications/emails/announcements. Confirm consent, audience filters, frequency caps, deduplication and audit coverage before adding campaigns or automation.
7. **Configuration mismatch:** server README describes OpenAI environment variables while current env config exposes Gemini-related fields. Resolve provider configuration from actual AI services before designing the provider registry; never print or commit secret values.
8. **Generated build artifact:** repository tree contains `vite.config.ts.timestamp-1791458333116-3ce35e840f3fd.mjs`. Check whether it is intentionally required; remove only in a separately reviewed cleanup change if safe.
9. **Limited test baseline:** only two server test files were present in the inspected tree (`achievement.test.js`, `razorpay.test.js`). More regression coverage is needed for auth, courses, enrollment, progress, admin authorization, AI generation, notification and webhook processing.
10. **No local execution in this environment:** a shallow clone attempt could not resolve `github.com`, so frontend typecheck/build, backend tests, lint and syntax checks were not executed here. CI is configured to run typecheck/build, server tests and JS syntax checks; current commit status response returned zero status entries. Treat baseline as unverified until CI or local commands complete.

## 8. Baseline verification commands

Run from the repository root on branch `test`:

```bash
npm ci
npm run typecheck
npm run build
npm run lint
```

Then:

```bash
cd server
npm install
npm test
npm run lint
find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

The server tests currently use Node's built-in test runner. CI supplies test environment variables, including a test-only JWT secret and local MongoDB URI. Never use production credentials for test runs.

## 9. Recommended Phase 1 entry criteria

Do not start broad admin feature coding until:
- The project owner reviews this inventory and confirms the Phase 1 scope.
- The current test/build CI result is available and any baseline failures are recorded.
- Duplicate admin endpoint ownership and auth token semantics are traced.
- Existing frontend API callers and response contracts are inventoried for admin pages.
- A regression checklist exists for login/Google login, course browsing, enrollment, lesson progress, AI roadmap/resource discovery, payment verification and user notifications.

## 10. Scope of this commit

This commit adds the discovery report only. No runtime code, API contract, database schema, environment secret, authentication behavior, learner route, payment behavior or course/progress record was modified.

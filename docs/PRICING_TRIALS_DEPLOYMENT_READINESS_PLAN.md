# Pricing, Trial Campaigns & Deployment Readiness — V2.2

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Execution branch:** `buddy-for-study-v2.2`  
**Baseline candidate:** `3bcad09387c27d0a95430c76993cd7e0391ee44c`  
**Programme:** 30 tracked tasks  
**Release policy:** No production deployment, merge, or change to another branch without explicit approval.

## 1. Product objective

Deliver a deployment-ready pricing and trial experience with clear controls for administrators, transparent plan information for learners, and safe behaviour when paid checkout is disabled.

This programme includes the unfinished release-readiness and platform work carried forward from the previous production-readiness, admin-master, course-pricing, trial-campaign, Build With AI, and deployment work. Existing work is not automatically reopened or marked complete: current-candidate evidence must support its status.

## 2. Confirmed product rules

### 2.1 Subscription plan catalogue

- Administrators control plan name, description, price, currency, billing interval, feature entitlements, usage limits, popular/featured status, active state, and sort order.
- Public plan visibility and checkout availability are different concepts.
- Every active plan configured for public display remains visible on the Pricing page whether `PAYMENTS_ENABLED` is `true` or `false`.
- A learner can review price, billing interval, features, and limits while payments are disabled.
- When payments are disabled, paid plan cards show a clear unavailable/coming-soon state. They do not load or launch Razorpay.
- A zero-price/free plan remains usable without checkout.
- Deactivating a plan must not silently rewrite existing payment history or a learner's historical plan snapshot. Effects on new assignment and existing entitlements must be explicit and tested.
- Do not derive server-side checkout amounts from a browser-provided price. The selected active plan and server-stored price remain authoritative.

### 2.2 Payment availability

- Disabling payments blocks creation of new course and subscription payment orders.
- Payment state verification for an order that was already created remains available.
- Verified provider webhooks must continue to be accepted and reconciled for existing transactions and subscriptions. A global payments-off switch must not strand a previous payment or prevent a refund/chargeback/renewal event from being recorded.
- Existing subscription cancellation and billing-history access remain available.
- Payment webhook signature verification and idempotency remain mandatory regardless of whether new checkout is enabled.
- Paid checkout must fail closed on the server even if a client bypasses disabled buttons.

### 2.3 Free/default access

- A learner without an active paid subscription or trial receives the configured active free/default plan.
- If no valid free plan exists, the user experience must show a controlled configuration issue; the application must not invent an entitlement or grant premium features.
- Payments being disabled must not block signup, login, free-plan access, learner progress, or claiming a free trial.
- Free-plan assignment must be idempotent and safe under concurrent requests.

### 2.4 Trial campaign configuration

A self-serve campaign contains:

- Internal campaign name and reason.
- Learner-facing title and description.
- Trial entitlement plan and duration.
- Publication state (draft, published, paused, ended).
- Campaign start and end dates.
- Maximum total claims.
- Eligibility settings (for example: active learner account, verified email, no active subscription, and no previous trial).
- Optional target paid plan for a separately consented conversion offer. A conversion offer is informational until the learner explicitly authorizes recurring payments with the payment provider.
- Audit actor, timestamps, and claim/usage counters.

The administrator can create a trial quickly from presets (7, 14, and 30 days), then edit details before publishing. Presets are convenience defaults, not hidden pricing promises.

### 2.5 Trial claim and expiry

- The offer API is authenticated and returns only a campaign the learner is eligible to claim.
- The learner must take an explicit action to claim. Dismissing the popup does not claim the offer.
- The claim endpoint rechecks campaign dates, cap, eligibility, active subscription, previous claims, and current trial state at write time.
- A learner cannot claim the same campaign twice. A learner cannot hold multiple active trials or an overlapping active subscription.
- Concurrent claims cannot exceed campaign capacity or create duplicate subscription records.
- Claiming a free trial does not create a payment order, call Razorpay, or authorize autopay.
- At expiry, trial entitlements end and the user's normal free/default entitlement resumes unless a paid subscription has separately been authorized and provider-verified.
- No payment method or recurring mandate is collected as a condition of claiming a no-payment trial.
- Existing administrator-granted trials remain supported and visible in trial history.

### 2.6 Trial popup

- Show a modal only to an authenticated, eligible learner when a currently published campaign is available.
- Display the configured offer title, description, plan, duration, and material conditions.
- Provide explicit **Claim trial** and **Not now** actions.
- Dismissal is not acceptance. A later offer can be surfaced again according to the agreed cooldown policy.
- After a successful claim, show confirmation and the end date. Do not show the offer again as claimable.
- Do not rely on browser state for eligibility, claim limits, or duplicate prevention; the server is authoritative.

## 3. Administrator information architecture

Finance & Governance should present clearly separated work areas:

1. **Finance overview** — payment availability, public plans, active subscriptions, trial activity, and recent billing issues.
2. **Subscription Plans** — plan catalogue, creation, prices, billing interval, entitlements, limits, availability, and display order.
3. **Course Pricing Studio** — course catalogue, filters, bulk price changes, recommendation profile, rules, previews, and history.
4. **Trial Campaigns** — campaign overview, quick create, eligibility, publish/pause, claims, and grant history.
5. **Billing & Refunds** — transaction records, refunds, and payment issues.
6. **Subscriptions** — learner subscription ledger and provider-derived status.

Existing role-based permissions remain enforced. Navigation grouping is not a permission boundary; each API continues to enforce its specific authorization.

### Subscription plan creation flow

Use a guided, clearly labelled sequence:

1. Basics — name, slug, description.
2. Price & billing — amount, currency, interval, and checkout availability.
3. Entitlements — included features and usage limits.
4. Presentation — popular badge and display order.
5. Review — summary and validation before creation.

### Trial creation flow

Use a short guided sequence:

1. Offer — name, learner-facing copy, trial plan, duration preset.
2. Eligibility & limits — audience rule, dates, claim cap.
3. Review & publish — preview eligibility/configuration and confirm.

Separate self-serve campaigns from one-off admin grants, but show both in a unified trial history.

## 4. Security, data, and operational invariants

- Validate request payloads with strict schemas; do not accept arbitrary MongoDB filters or update operators.
- Keep admin create/update/publish/grant actions permission-protected and auditable.
- Use idempotency and database uniqueness/conditional writes for claims and entitlement assignment.
- Do not expose secrets, payment credentials, webhook signatures, or internal provider configuration to learners.
- Preserve existing billing/payment records and provider reconciliation.
- Review account data export, deletion/anonymization, retention, backup expiry, and privacy disclosures before release.
- Google People API contact import remains optional and consent-based. Imported/mobile-entered phone numbers remain unverified; there is no paid SMS OTP or Twilio dependency.
- Build With AI resource matching, duration acceptance, language correctness, quota controls, and account-level rate limiting remain part of the broader release regression suite.
- Respect the low-cost deployment constraint: validate the configured inline worker mode and do not introduce a mandatory separately billed worker without explicit approval.
- Staging credentials, live provider callbacks, backup restoration, monitoring, rollback rehearsal, and release-owner approval require real environment evidence; repository code alone cannot prove them.

## 5. 30-task register

Task statuses: `DONE`, `IN_PROGRESS`, `BLOCKED`, `FAIL`, or `NOT_STARTED`. A code file existing is not evidence that a task is complete. Close a task only with the relevant check and current candidate SHA.

### Phase 1 — Requirements and architecture

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 1 | Audit current V2.2 source and previous task registers | Findings recorded against exact branch SHA | DONE |
| 2 | Formalize product rules and this 30-task tracker | This document committed to execution branch | DONE |
| 3 | Map plan, checkout, entitlement, trial, admin, and deployment dependencies | Route/model/component/deployment map and identified gaps | DONE |

### Phase 2 — Plans and payment availability

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 4 | Correct public plans API | All active public plans returned independently of payment availability | DONE |
| 5 | Correct learner Pricing page | Paid and free plan cards remain visible when payments are disabled | DONE |
| 6 | Disable paid checkout actions in UI | No Razorpay load/order attempt when disabled; clear status message | DONE |
| 7 | Harden server payment availability controls | New orders blocked; existing verification, webhooks, sync, and cancellation remain usable | DONE |
| 8 | Verify default free-plan assignment | Idempotent free access and concurrent assignment tests pass | DONE |
| 9 | Improve subscription-plan configuration | Validated plan lifecycle, price, interval, features, limits, order, and visibility behaviour | DONE |

### Phase 3 — Trial campaign backend

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 10 | Design TrialCampaign data model | Schema, indexes, validation, and migration/deployment notes reviewed | DONE |
| 11 | Implement campaign management APIs | Permission-protected create, update, list, publish, pause, and disable operations | DONE |
| 12 | Implement quick-trial presets | Safe 7/14/30-day defaults with editable values | DONE |
| 13 | Implement eligibility engine | Deterministic eligibility and skipped reasons | DONE |
| 14 | Implement claim API | Idempotent, atomic, duplicate-safe, capacity-safe claim operation | DONE |
| 15 | Integrate trial entitlements | Free claim activates entitlement without a payment order or provider call | DONE |

### Phase 4 — Learner trial experience

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 16 | Implement learner offer API | Authenticated, server-calculated offer and eligibility response | DONE |
| 17 | Build trial claim popup | Claim and dismiss paths work; no duplicate prompt after claim | DONE |
| 18 | Implement trial lifecycle handling | Start, expiry, revocation, and free-plan fallback are consistent | DONE |
| 19 | Update learner Billing experience | Trial plan, start/end, remaining duration, and no-autopay status are clear | DONE |

### Phase 5 — Admin experience

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 20 | Redesign Trial Dashboard | Campaigns, claims, grants, status, and history are separated | DONE |
| 21 | Simplify trial creation | Guided quick-create, eligibility, limits, review, and publish flow | NOT_STARTED |
| 22 | Reorganize Course Pricing Studio | Overview, catalogue, bulk editor, recommendations/rules, and history sections | NOT_STARTED |
| 23 | Organize Subscription Plans dashboard | Basics, billing, entitlements, presentation, and review sections | NOT_STARTED |
| 24 | Improve Finance & Governance navigation | Clear grouping, concise labels, descriptions, and permission consistency | NOT_STARTED |

### Phase 6 — Quality and release readiness

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 25 | Audit plan and pricing integrity | Currency, ordering, sale price, feature and limit regression tests pass | NOT_STARTED |
| 26 | Payment and subscription regression suite | Enabled/disabled checkout, verification, webhook, and cancellation tests pass | DONE |
| 27 | Trial security and lifecycle regression suite | Eligibility, role isolation, concurrency, cap, idempotency, expiry and audit tests pass | DONE |
| 28 | Frontend quality/accessibility checks | Typecheck, lint, unit, responsive, keyboard, accessibility and browser tests pass | DONE |
| 29 | Deployment operations readiness | Environment, DNS/TLS/CORS/OAuth, MongoDB, mail, AI/YouTube, worker, privacy, backups, monitoring and rollback evidence | BLOCKED |
| 30 | Final release gate | Exact-SHA CI and staging verification pass; blockers and accepted risks documented; approval recorded | IN_PROGRESS |

## 6. Carry-forward items from previous work

These are not silently treated as complete by the new programme. They must be revalidated against this V2.2 candidate and mapped to the tasks above:

| Prior area | Carry-forward work | Planned coverage |
|---|---|---|
| Production controls (REL-001) | Main-branch protection and release/rollback authority remain platform-level controls; do not change another branch as part of this work | 29–30 |
| Subscription lifecycle (BILL-001) | Upgrade/downgrade semantics, grace period, cancellation, expiry, and plan-change impact | 18, 25–27, 29 |
| Data rights (DATA-001) | Account deletion/anonymization, export, retention matrix, backup expiry, and privacy policy | 29 |
| Hosting and workers | Verify Render API/static frontend, health paths, inline worker supervision, and avoid a mandatory separate worker cost | 29 |
| Provider setup | Verify Google OAuth/People API and consent, SMTP, AI/YouTube keys and quotas, MongoDB TLS/backups, CORS, custom domain, and payment settings | 29 |
| Operations | Staging, webhook reconciliation, logs/alerts, restore test, rollback rehearsal, incident ownership | 29–30 |
| Build With AI | Retest requested duration vs selected video duration, language matching, fallback quality, quota handling, and per-account rate limits | 28–30 |
| Google contact import | Verify People API setup/consent and privacy disclosure; retain manual entry and unverified phone status; no SMS OTP | 28–29 |
| Wider admin backlog | Retain unfinished items in `docs/BUDDYFORSTUDY_ADMIN_MASTER_SPEC.md`; this 30-task programme does not claim unrelated admin features are complete | Follow-up backlog |

The older production-readiness checklist and admin master specification remain historical/source trackers. Their statuses must be refreshed rather than copied as current evidence.

## 7. Execution and reporting rules

1. Work only on `buddy-for-study-v2.2`. Do not create a branch or edit another branch without explicit approval.
2. Before every write, read the branch head and use an optimistic expected-SHA update. Never force-push.
3. Work in numbered task order unless a dependency or discovered release blocker requires an explicitly documented sequence adjustment.
4. After each completed task, report `N/30`, the task, changed files, commit SHA, checks executed, results, and remaining blockers.
5. Run focused tests for every change. Run broader lint/typecheck/test/build and browser suites at the relevant gates.
6. Do not mark staging/provider tasks complete without access to and evidence from the actual environment.
7. Do not deploy production or merge to `main` as part of this programme without explicit approval.
8. A green CI status means code checks passed; it does not independently certify live production readiness.


## 8. Current V2.2 architecture map and verified gaps

This map was refreshed against source candidate `9d5e7d7a0ec75dbbde36ff88270b019f777ee37f`. Paths are repository-relative. The map is a code-structure finding, not evidence that the corresponding external deployment is live.

### 8.1 Public plan and learner billing path

| Layer | Current implementation | Finding |
|---|---|---|
| Plan model | `server/src/models/SubscriptionPlan.js` | Stores name, slug, description, price, currency, interval, features, limits, active/popular flags, trialDays, sortOrder, provider plan ID. No separate campaign entity exists in this model. |
| Public catalogue API | `server/src/routes/billing.routes.js` — `GET /api/billing/plans` | Returns every active plan in `sortOrder`, independent of `paymentsEnabled`; checkout availability is returned separately. Regression coverage: `server/test/publicPlanCatalogue.test.js`. |
| Learner plan page | `client/src/pages/Pricing.tsx` | Retains the active public catalogue when payments are disabled, displays paid-plan unavailability, and exits before creating an order or loading Razorpay. |
| Learner billing | `GET /api/billing/me`, `/entitlements`, `/payments`, `/trial` and `client/src/pages/Billing.tsx` | Existing subscription, entitlement, transaction, and active-trial surfaces exist. |
| Default entitlement | `server/src/services/freePlanAssignment.service.js`, `server/src/services/subscriptionEntitlement.service.js`, and `GET /api/billing/me` | Idempotent assignment uses an active free plan and recovers duplicate-key races. Existing stored subscriptions load their referenced plan without checking its current `isActive` state, so deactivation does not itself revoke their plan entitlements. |

### 8.2 Admin pricing path

| Work area | Current implementation | Intended boundary |
|---|---|---|
| Subscription Plans | `client/src/pages/admin/AdminPlans.tsx`, `server/src/models/SubscriptionPlan.js`, existing admin plan APIs | Manage platform membership plans and entitlements. |
| Course Pricing Studio | `client/src/pages/admin/AdminPricingStudio.tsx`, `server/src/controllers/adminPricing.controller.js`, `server/src/routes/adminPricing.routes.js` | Manage individual course pricing, bulk edits, previews, rules, recommendations, history, and rollback. |
| Admin navigation | `client/src/pages/admin/AdminLayout.tsx` | Currently lists both work areas in Finance & Governance; preserve their distinct meaning while making the group easier to scan. |
| Authorization | `server/src/routes/adminPro.routes.js` — `plans.read` for listing; `plans.manage` for create/update; `pricing.manage` for course pricing | The admin route is authenticated and role-protected, with a permission check per endpoint. UI navigation is not a security boundary. |

### 8.3 Existing trial path and self-serve campaign path

| Layer | Current implementation | Finding |
|---|---|---|
| Grant record | `server/src/models/TrialGrant.js` | Records learner, entitlement plan, campaignName, reason, actor, start/end, status, conversion state, provider reference, and idempotency key. Unique user/campaignName and idempotency protections exist. |
| Admin grant flow | `client/src/pages/admin/AdminTrialCampaigns.tsx`, `server/src/controllers/adminTrials.controller.js`, `server/src/routes/adminTrials.routes.js` | Supports choosing a learner or filtered group, previewing eligibility, granting, and viewing recent grants. |
| Learner trial status | `GET /api/billing/trial` in `server/src/routes/billing.routes.js` | Returns a sanitized summary of the latest started trial, including lifecycle status, start/end dates, optional conversion terms, and explicit payment/autopay flags; synchronizes due expiry before reading. |
| Learner trial UI | `client/src/pages/Billing.tsx` and `client/src/pages/Pricing.tsx` | Displays trial status, start/end dates, live remaining duration, auto-pay state, and the optional paid conversion offer; manual trials do not show provider cancellation controls. |
| Campaign configuration | `server/src/models/TrialCampaign.js`, protected admin trial routes/controller, and `client/src/pages/admin/AdminTrialCampaigns.tsx` | Administrators configure reusable published campaigns separately from one-off manual grants. |
| Self-serve offer and claim | `GET /api/trials/offer` and `POST /api/trials/campaigns/:campaignId/claim` in `server/src/routes/trialCampaign.routes.js` | The offer API is authenticated, read-only, and server-calculated; the claim API rechecks eligibility and atomically activates the entitlement. The learner popup is implemented in Task 17 and presents explicit Claim and Not now actions. |

### 8.4 Payment route boundary

Current wiring in `server/src/server.js` and `server/src/routes/payment.routes.js`:

- `/api/payments` is mounted with its rate limiter but without a router-wide payments-enabled guard.
- `requirePaymentsEnabled` is attached only to `POST /course/order` and `POST /subscription/order`.
- `POST /course/verify` remains available for an order created before checkout was disabled.
- Signed provider webhook routes remain mounted without a payments-enabled guard so existing transactions and subscriptions can be reconciled.
- Subscription sync and cancellation remain separate billing routes.

This is the implemented lifecycle boundary. Regression coverage is in `server/test/paymentAvailability.test.js`, `server/test/paymentVerification.test.js`, and webhook transition tests.

### 8.5 Deployment topology and external evidence

- `render.yaml` and `docs/DEPLOYMENT.md` target the `buddy-for-study-v2.2` release branch and include a Render static frontend plus a Node API configured for inline background execution.
- The documented deployment flow includes backend production-config preflight and deployment verification scripts.
- `docs/ENVIRONMENT_VARIABLES.md` distinguishes public Vite settings from backend secrets and records required provider settings.
- The repository cannot prove the current deployment's actual secret-manager values, DNS/TLS state, Google Console consent verification, SMTP/AI/YouTube provider connectivity, database backup/restore status, monitoring, or rollback rehearsal. Those remain environment-evidence gates in Task 29–30.

### 8.6 Prior-work carry-forward map

- Production readiness: the earlier 239-item checklist records unresolved main branch protection/release controls, account data deletion and retention, incomplete plan-change/grace-period lifecycle, live staging/provider verification, backup/restore, worker supervision, monitoring, and rollback evidence. Revalidate the relevant parts on the current candidate; do not copy old DONE statuses forward as current evidence.
- Admin master specification: unfinished user security, course governance, AI operations, finance, communications, worker, data-rights, and accessibility items remain in `docs/BUDDYFORSTUDY_ADMIN_MASTER_SPEC.md`. This focused programme includes only release-critical work and the requested pricing/trial UX.
- Build With AI: prior requested-duration accuracy, content-language matching, resource fallback, API quota handling, and account-level rate limiting must be included in final regression.
- Google contact import: the previous implementation is retained; Google People API scope/consent, privacy disclosure, and manual fallback need live configuration checks. Phone numbers stay unverified and no paid SMS verification is part of this programme.

**Task 3 disposition:** architecture and dependencies mapped against source candidate `5b43ce3534a47b2ca783e9f19e15ae546ac2c6e7`; route, model, component, authorization, and deployment gaps are recorded. Task 3 is complete. Do not mark any external deployment task complete from this source review alone.


## 9. Execution evidence — Phase 2 Tasks 4–8

**Verification date:** 2026-11-19  
**Implementation candidate:** `22be28b96f69615bc79181e36834d5ebd9eef871` on `buddy-for-study-v2.2`  
**CI run:** [BuddyForStudy CI #44520058132](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44520058132) — frontend, backend, and Production release gate completed successfully.

| Task | Verified change | Evidence |
|---:|---|---|
| 4 | Public plans API now returns all active plans irrespective of payment availability and separately returns the checkout flag. | `server/test/publicPlanCatalogue.test.js`, `server/test/subscriptionPlanOrder.test.js`; backend CI passed. |
| 5 | Pricing page continues to render eligible active paid and free plans when payments are disabled. | Updated Pricing page and `client/tests/courseNav.test.cjs`; frontend lint, typecheck, unit, and production build passed. |
| 6 | Paid purchase path exits before calling order API or loading Razorpay when payments are disabled; learner receives a clear unavailable notice. | Frontend test assertions and browser navigation smoke tests passed. |
| 7 | Only new course/subscription order routes are gated. Existing course verification, signed provider webhooks, subscription sync/cancellation, and provider reconciliation remain mounted and can use existing provider credentials. | `server/test/paymentAvailability.test.js`, `server/test/paymentVerification.test.js`, `server/test/paymentWebhookTransitions.test.js`; backend CI and production release gate passed. |
| 8 | Free-plan assignment is extracted to an idempotent service, preserves existing subscriptions, recovers duplicate-key races, and fails without inventing premium access if no free plan exists. | `server/test/freePlanAssignment.test.js`; full backend test suite and production config preflight passed. |

**Limit:** These results verify repository CI, not live Razorpay credentials, webhook delivery, production secrets, DNS, backups, or staging provider behaviour. Keep those as deployment evidence gates in Tasks 29–30.


## 10. Execution evidence — Task 9

**Verification date:** 2026-11-19  
**Implementation candidate:** `15d8758e90f32d08d56227e038934832d715f185` on `buddy-for-study-v2.2`  
**CI run:** [BuddyForStudy CI #44526170528](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44526170528) — backend, frontend, browser navigation smoke tests, and Production release gate completed successfully.

| Area | Verified behaviour | Evidence |
|---|---|---|
| Plan creation | Guided wizard captures name, URL slug, learner-facing description, price, currency, recurring billing interval, active/public visibility, popular status, feature entitlements, usage limits, and a learner-facing review before submission. | `client/src/pages/admin/AdminPlans.tsx`; frontend admin-plan checks in `client/tests/courseNav.test.cjs`. |
| Plan lifecycle and visibility | Admin catalogue includes active and inactive plans in display order. Public catalogue includes active plans only and remains independent of the payment switch. Deactivation prevents new public selection/default assignment but does not itself revoke an existing stored subscription's plan entitlement. | `server/src/controllers/adminPro.controller.js`, `server/src/routes/billing.routes.js`, `server/src/services/subscriptionEntitlement.service.js`; lifecycle regression in `server/test/subscriptionPlanAdminValidation.test.js`. |
| Billing terms | New subscription plans use monthly, quarterly, or yearly recurring intervals. Legacy one-time records can still be edited without rewriting their historical interval. Provider-linked/provider-history price, currency, and interval terms cannot be changed in place. | `server/src/utils/subscriptionPlanAdminValidation.js`, `server/src/controllers/adminPro.controller.js`, `server/test/subscriptionPlanAdminValidation.test.js`. |
| Validation | Price, currency format, description type/length, interval, active/popular flags, trial days, sort order, configured feature labels, duplicate features, usage-limit key shape, and integer limit values (minimum `-1`) are validated on the server. Limit normalization no longer silently truncates invalid fractions. | Expanded `server/test/subscriptionPlanAdminValidation.test.js`; backend suite: **1,031 passed, 0 failed**. |
| Frontend and browser | Admin wizard/visibility/order assertions, lint, typecheck, unit tests, deployment config tests, production build, and browser navigation smoke tests passed. | Frontend unit test runs: **56 + 7 passed**; Playwright browser suite: **119 passed**. |

**Task 9 disposition:** complete for the V2.2 repository candidate. CI validates the repository code only; live provider credentials, database contents, staging behaviour, and production deployment remain in Tasks 29–30.


## 11. Task 10 implementation candidate — verified

The self-serve campaign collection is designed independently from administrator-issued `TrialGrant` records. The schema, model-level tests, and deployment notes are now present:

- `server/src/models/TrialCampaign.js`
- `server/test/trialCampaignModel.test.js`
- `docs/TRIAL_CAMPAIGN_DATA_MODEL.md`

The model defines draft/published/paused/ended lifecycle states, bounded trial duration and claim capacity, learner eligibility defaults, consent-only conversion configuration, lifecycle actor/timestamp audit fields, strict unknown-field rejection, and named discovery/admin indexes. The design note specifies claim-time atomic capacity enforcement, a stable campaign/learner claim ledger for Task 14, and a non-destructive new-collection rollout.

**Implementation candidate:** `430e946e356effed5a6626b277e58b8c2224d321` on `buddy-for-study-v2.2`  
**CI run:** [BuddyForStudy CI #44539175264](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44539175264) — backend, frontend, browser navigation smoke tests, and Production release gate completed successfully.

**Verification evidence:** 7 new TrialCampaign model tests passed. Full backend test suite: **1,038 passed, 0 failed, 0 skipped**. Backend lint, production-config preflight, and server syntax checks passed. Frontend lint, typecheck, unit tests, deployment-config checks, production build, and Playwright browser navigation smoke tests passed.

**Task 10 disposition:** complete for this V2.2 repository candidate. Live MongoDB index initialization and environment backup/rollback evidence remain deployment gates in Tasks 29–30.


## 12. Task 11 implementation and verification — complete

Implemented on `buddy-for-study-v2.2`:

- `server/src/utils/trialCampaignAdminValidation.js` — strict create/update schemas, bounded fields, date-window checks, eligibility validation, and explicit consent-only conversion configuration.
- `server/src/controllers/adminTrialCampaigns.controller.js` — paginated list/search, detail, create, update, publish, pause, disable, active-plan reference validation, conditional lifecycle writes, and audit events.
- `server/src/routes/adminTrials.routes.js` — seven protected self-serve campaign endpoints under `/api/admin/trials/campaigns`, each using the existing `trials.manage` permission.
- `server/test/trialCampaignAdminRoutes.test.js`, `server/test/trialCampaignAdminControllerSafety.test.js`, and `server/test/trialCampaignAdminValidation.test.js` — route/permission, lifecycle safety, and request-validation coverage.

The existing administrator-issued `TrialGrant` routes (`/grants`, `/preview`, `/grant`) remain registered and unchanged. Campaign creation always starts in draft. Only draft or paused campaigns with no learner claims may be edited. Publish/pause/disable use conditional state transitions. Disabling a campaign stops new offers and does not revoke or rewrite existing learner entitlements. An optional paid conversion plan is configuration only and requires a separate learner-consent flow in later tasks.

**Implementation candidate:** `fd45cd939aa29c8929a53e2ba97a15f60ae310b1`  
**CI run:** [BuddyForStudy CI #44584056449](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44584056449) — backend, frontend, and Production release gate all completed successfully.

**Verification:** backend lint, production-config preflight, full backend test suite, AI selector comparison, server JavaScript syntax checks; frontend lint, typecheck, unit tests, Vercel deployment-config tests, production build, Playwright browser navigation smoke tests; and the Production release gate all passed on the exact implementation candidate.

**Task 11 disposition:** complete for the V2.2 repository candidate. This verifies repository CI only; no staging campaign CRUD or real MongoDB-backed administrator walkthrough has been performed. External-environment verification remains in Tasks 29–30.


## 13. Task 12 implementation candidate — frontend integration

**Scope:** Integrate the existing quick-trial preset API into the administrator trial page without changing the administrator-issued manual grant workflow.

Implemented on `buddy-for-study-v2.2`:

- `client/src/pages/admin/AdminTrialCampaigns.tsx` now loads the editable preset catalogue and existing self-serve campaigns through the protected campaign endpoints.
- Administrators can start from the 7-day, 14-day, or 30-day preset and edit internal name/reason, learner-facing offer title/description, active trial plan, duration, start/end window, claim capacity, all four eligibility rules, and an optional consent-required recurring paid conversion offer.
- The page validates required fields, duration/capacity bounds, date windows, and distinct conversion-plan selection before sending the request. The server remains authoritative for plan references and campaign validation.
- Saving calls `POST /api/admin/trials/campaigns` only. The UI explicitly reports that the result is a draft and does not publish it or create a payment.
- Existing drafts and published campaigns are listed with separate publish, pause, and disable actions. Disable messaging explains that existing learner claims remain unchanged.
- The existing one-learner/group manual preview and grant workflow and recent grant history are retained separately.
- Added `client/tests/adminTrialCampaigns.test.mjs` and included it in `npm run test:unit`.

**Verification:** the corrected preset UI and browser regression suite passed backend, frontend, Playwright, and production release-gate CI on `b70ed8b7925647e1b9b3d864b84045a950e0fc49` (run [44721916052](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44721916052)). Task 12 is complete for this repository candidate. No staging or production deployment has been performed.


## 14. Task 13 implementation candidate — deterministic eligibility engine

**Scope:** Add a read-only, reusable eligibility service for self-serve trial campaigns. Claim mutation, capacity reservation, campaign claim ledger, and subscription creation remain in Tasks 14–15.

Implemented on `buddy-for-study-v2.2`:

- `server/src/services/trialCampaignEligibility.service.js` provides a pure deterministic evaluator, an audience evaluator, a current-subscription period check, and a database-backed learner evaluator.
- The engine checks campaign publication/window/capacity/configuration, active trial-plan availability when populated, learner role isolation, configured active-account and email-verification rules, current subscription status/period, prior administrator-issued trial history, and an already-claimed campaign fact when supplied by the later claim ledger.
- Results use stable reason codes and human-readable messages in a fixed order. Audience evaluation preserves input order and returns eligible/skipped records plus skipped counts by reason code.
- Database-backed evaluation reloads role, active state, email verification, subscription status/period, and TrialGrant history from MongoDB. It does not trust learner-supplied eligibility flags.
- Missing required eligibility facts fail closed. Malformed subscription period data is treated as active so it cannot accidentally authorize a new trial.
- Added `server/test/trialCampaignEligibility.service.test.js` with deterministic unit and injected-model tests.

**Verification:** Task 13 eligibility engine and regression tests passed backend, frontend, Playwright, and production release-gate CI on `b70ed8b7925647e1b9b3d864b84045a950e0fc49` (run [44721916052](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44721916052)). Task 13 is complete for this repository candidate. Transactional claim and entitlement mutation are tracked separately in Tasks 14–15.


### Task 12 CI correction note

The first exact-candidate CI run \`44718122920\` reported backend success and 118/119 browser tests passed. The single failure was an existing administrator browser assertion expecting the established page heading \`Grant a free trial\`; the new campaign section had unnecessarily renamed it. The established heading has now been restored while keeping the self-serve campaign workspace. The corrected candidate passed all CI and release-gate jobs on `b70ed8b7925647e1b9b3d864b84045a950e0fc49` (run [44721916052](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44721916052)).


## 15. Task 14 implementation candidate — transactional campaign claim reservation

**Scope:** Implement a learner-authenticated, idempotent campaign claim endpoint. The claim ledger and campaign capacity reservation are committed in the same MongoDB transaction. Trial entitlement activation remains Task 15.

Implemented on buddy-for-study-v2.2:

- server/src/models/TrialCampaignClaim.js adds the durable trial_campaign_claims ledger. Unique indexes enforce one claim per campaign/learner and one idempotency key per learner. The record preserves campaign trial-plan, duration, and conversion-offer snapshot and has reservation/activation/failure lifecycle fields for Task 15.
- server/src/services/trialCampaignClaim.service.js performs replay lookup, duplicate-claim rejection, authoritative eligibility evaluation, a hard active-subscription/trial guard, and an active trial-plan check inside a MongoDB transaction.
- Capacity is reserved using a conditional findOneAndUpdate that requires published status, an active date window, and $expr: { $lt: ["$claimedCount", "$maxClaims"] } while incrementing claimedCount. The unique claim row is created in the same session; a transaction failure rolls both operations back.
- server/src/controllers/trialCampaignClaim.controller.js accepts an explicit Idempotency-Key header (or matching body value), scopes it to the authenticated user, and returns the durable reservation or a structured conflict/eligibility response.
- server/src/routes/trialCampaign.routes.js exposes POST /api/trials/campaigns/:campaignId/claim behind authentication. No payment, Razorpay, or recurring-payment code is called. New claims remain reserved until Task 15 attaches the entitlement.
- Task 13's database-backed eligibility reads now accept the same transaction session so campaign, user, subscription, and prior-trial facts are evaluated consistently with the claim write.
- Added service, model-index, and route tests. Fixed the browser test's unscoped checkbox selector so it targets the manual-grant confirmation control after separate campaign eligibility controls were added.

**Verification:** Task 14 claim protections and Task 15 entitlement activation passed backend, frontend, Playwright browser smoke tests, and the Production release gate on exact branch commit `c2c79881d6d6b4ffb460aeed9f9f3efb2d5fc12f` (run [44871892402](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44871892402)). Transactional claims require a MongoDB deployment that supports multi-document transactions (replica set or sharded cluster). No staging or production deployment has been performed.


Task 14 concurrency hardening: a partial unique active-claim key prevents a learner from reserving two different campaigns concurrently. Lifecycle expiry/revocation must unset this key without deleting claim history.


## 16. Task 15 implementation candidate — transactional trial entitlement activation

**Scope:** A successful self-serve claim now activates the trial entitlement in the same MongoDB transaction as its campaign capacity reservation and claim-ledger row.

Implemented on buddy-for-study-v2.2:

- TrialGrant now records source=campaign, campaign, claim, and the claiming learner. Administrator grants retain the default source=admin and continue to require grantedBy; a campaign claim is not misattributed to the administrator who configured the campaign.
- UserSubscription now carries optional TrialGrant and TrialCampaign references for subsequent expiry, revocation, and audit operations.
- The claim transaction creates the TrialGrant, creates or conditionally replaces the learner subscription with the configured trial plan, and changes the claim record to active. If any write fails, the MongoDB transaction rolls back the capacity increment and every entitlement write.
- An existing active free/default-plan subscription is conditionally replaced with the trial entitlement. A current paid, past-due, or trial subscription is never overwritten. Expired/cancelled subscriptions can be replaced safely.
- The eligibility reader now populates the subscription plan and treats a known zero-price/free plan as the free baseline, not as an active paid subscription. A trialing subscription remains a conflict even when its plan costs zero.
- If campaign conversion is configured, TrialGrant stores pending_user_consent. The claim flow makes no payment order, Razorpay call, provider subscription, or recurring authorization.
- The learner claim response now confirms activation and includes the claim ID, entitlement references, and trial end timestamp.
- Added claim activation, free-plan replacement, paid-subscription protection, campaign provenance, and no-payment regression tests.

**Verification:** exact-SHA backend lint and full backend tests, frontend lint/typecheck/unit tests/build, Playwright browser navigation smoke tests, and the Production release gate all passed on `c2c79881d6d6b4ffb460aeed9f9f3efb2d5fc12f` (run [44871892402](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44871892402)). This verifies repository behaviour only; live MongoDB transaction/index rollout and staging activation remain release tasks.


## 17. Task 16 implementation candidate — authenticated learner offer API

**Scope:** Add a read-only learner endpoint that surfaces one currently available published campaign only after rechecking eligibility from persisted account, subscription, trial-history, and claim-ledger facts.

Implemented on `buddy-for-study-v2.2`:

- `GET /api/trials/offer` is mounted behind the existing authentication middleware and rejects non-learner roles.
- `server/src/services/trialCampaignOffer.service.js` queries only published campaigns whose start/end window is current and whose campaign cap has remaining capacity. Candidate evaluation is bounded to the 50 most recently published campaigns.
- Eligibility is calculated from fresh MongoDB reads for learner role/account state/email verification, current subscription and populated plan, prior TrialGrant history, campaign-specific claim history, a live cross-campaign claim lock, and an active trial grant.
- The service hard-enforces the global no-active-paid-subscription-or-trial invariant even when a campaign's configurable eligibility flag is relaxed. A known free/default plan does not block an otherwise eligible offer; an active trial does.
- The endpoint skips campaigns already claimed by the learner and can return a later eligible campaign. It fails closed for missing/inactive trial plans and returns stable eligibility reason codes when no candidate is eligible.
- The learner response is a narrow allowlist: offer copy, campaign window, duration, trial-plan features/limits, optional paid conversion-plan details with a separate-consent flag, and explicit payment-method/payment-order/autopay false values. Internal campaign name/reason, counters, audit actors, and persistence fields are not exposed.
- The endpoint is read-only. It does not reserve campaign capacity, create a claim, create a TrialGrant/UserSubscription, or invoke a payment provider. Task 15 claim-time revalidation and transactional capacity protection remain authoritative.
- Added service regression coverage for no active offer, safe response shaping, free-plan handling, paid-subscription exclusion, prior claims, live claims, active administrator trials, inactive plans, and unverified email.

**Verification:** exact-SHA backend lint and full backend tests, frontend lint/typecheck/unit tests/build, Playwright browser navigation smoke tests, and the Production release gate all passed on `d3de84cf7f467f5133b9ca0c4a1fd4461dc4a031` (run [44872385306](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44872385306)). No staging or production deployment has been performed.


## 18. Task 17 implementation candidate — learner trial claim popup

**Scope:** Add a learner-facing offer modal that presents the server-calculated offer, distinguishes claiming from dismissal, and confirms activation without implying a payment obligation.

Implemented on \`buddy-for-study-v2.2\`:

- \`client/src/components/TrialCampaignOfferPrompt.tsx\` is mounted once in the application layout. It only requests offers for authenticated learner accounts and suppresses display on authentication, legal, and administrator routes.
- The prompt waits for a saved cookie choice and for account legal/profile gates to be settled. It refreshes when consent is settled, the cookie choice changes, the app regains focus, or the document becomes visible.
- The modal displays the configured learner title/description, trial duration, trial plan, selected feature entitlements, optional future paid-plan price, and an explicit statement that no payment method, payment order, or recurring authorization is required to claim.
- **Claim free trial** sends the authenticated campaign claim endpoint with a generated \`Idempotency-Key\`. It shows a busy state, preserves the same key when the user retries an uncertain request, handles errors without dismissing the offer, and only confirms success when the API returns an active claim.
- Successful activation shows the trial end date when returned, confirms no automatic payment, dispatches entitlement/cache refresh events, and suppresses further offer requests for that learner during the current app session. On subsequent visits the backend offer API remains authoritative and excludes prior/active claims.
- **Not now**, the close control, and Escape dismiss without calling the claim endpoint. Dismissal is stored per learner and campaign for a 24-hour UI cooldown; this storage affects prompt frequency only and never affects server eligibility or entitlement.
- Added a tested dismissal/idempotency helper, Playwright coverage for dismiss-without-claim and claim-confirmation/no-repeat, and API GET cache invalidation after trial mutations.

**Verification:** exact-SHA frontend lint, typecheck, unit tests, production build, Playwright browser navigation smoke tests, backend lint and full test suite, production-config preflight, server JavaScript syntax validation, and the Production release gate all passed on implementation candidate `9d5e7d7a0ec75dbbde36ff88270b019f777ee37f` (run [44873843558](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44873843558)). No staging or production deployment has been performed.


## 19. Task 18 implementation — trial expiry, revocation and free-plan restoration

**Scope:** Keep the durable TrialGrant, UserSubscription and campaign claim ledger in agreement as a trial ends or is revoked, without touching a newer provider-backed subscription or creating a payment action.

Implemented on \`buddy-for-study-v2.2\`:

- Added \`server/src/services/trialLifecycle.service.js\` as the shared lifecycle coordinator for administrator-issued and self-serve grants. Each grant transition uses a MongoDB transaction and fails closed when transactions are unavailable.
- Expiry is a bounded worker operation. Inline maintenance processes at most 25 due grants per pass; standalone maintenance processes at most 250. Both use the same service inside the existing lease-controlled maintenance run.
- A transition changes TrialGrant to \`expired\` or \`revoked\`, cancels pending conversion consent, restores the configured active free plan on the exact linked manual trial subscription, and clears its TrialGrant/TrialCampaign references. If no active free plan is configured, the trial subscription becomes \`expired\` and no replacement plan is invented.
- Campaign claims retain their audit history but move to \`expired\` or \`revoked\` and unset \`activeClaimKey\`, releasing the cross-campaign live claim lock. Campaign capacity counters are not decremented.
- New administrator-issued grants persist their TrialGrant reference on UserSubscription. A narrowly scoped exact-plan/exact-end-time fallback reconciles older admin grants that predate this reference.
- Expiry does not overwrite a paid/provider subscription, a converted grant, or a subscription that no longer matches the original manual trial. If the trial subscription row is missing and no newer subscription exists, the configured free plan is recreated within the lifecycle transaction.
- Added \`POST /api/admin/trials/grants/:grantId/revoke\`, guarded by \`trials.manage\`, with a required administrator reason and an audit event. The existing grant workspace exposes a revoke action for currently trialing grants.
- \`GET /api/billing/me\` synchronizes an ended learner trial before returning subscription details, so the Billing page does not depend only on the next worker interval to show free-plan fallback.

**Verification:** exact-SHA backend lint and full test suite, frontend lint/typecheck/unit tests/build, Playwright browser navigation smoke tests, and the Production release gate all passed on `5922a8bea8da489cb2bcea2b06b9c1e2c45c3747` (run [44876841654](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44876841654)). No staging or production deployment has been performed.


## Task 19 implementation — verified

**Scope:** Make the learner's latest started trial understandable from Billing, including lifecycle state, dates, remaining duration, and whether any recurring payment was separately authorized.

Changes prepared on `buddy-for-study-v2.2`:

- `GET /api/billing/trial` synchronizes any due trial expiry/revocation for that learner, then returns the latest started trial in active or terminal lifecycle states.
- The endpoint returns a narrow learner-safe summary. It omits administrator actor/reason, learner IDs, internal grant IDs, and idempotency keys while including the trial plan, start/end timestamps, status, optional conversion terms, and explicit payment flags.
- A trial claim remains payment-free: the response states that no payment method or payment order was required for the trial. Auto-pay is only reported as authorized when a separate conversion authorization/provider subscription is recorded.
- Billing displays the trial's start date, end date, a live remaining-duration value refreshed every minute, and distinct Active, Ending soon, Ended, Revoked, or Converted states.
- The Billing load sequence synchronizes `/api/billing/me` before reading the trial summary. The optional conversion offer is only actionable during an active trial.
- Manual trial subscriptions no longer display the Razorpay auto-renewal cancellation action; that action is reserved for provider-backed subscriptions.
- Regression tests cover duration formatting, lifecycle labels, safe API serialization, no-autopay semantics, and cancellation-action provider gating.

**Verification:** exact-SHA backend lint and full backend tests, frontend lint/typecheck/unit tests/production build, Playwright browser navigation smoke tests, and the Production release gate all passed on implementation candidate `8d3bdca9a7a2bb843d4d7eeb7d2603a163827e1a` (run [44878605895](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/44878605895)). The learner Billing API and UI are verified for this repository candidate. No staging or production deployment has been performed.


## Task 20 implementation — verified

- Added a dedicated `GET /api/admin/trials/claims` ledger endpoint, protected by `trials.manage`, with bounded pagination, validated claim-status filtering, optional campaign filtering, and populated learner/campaign/plan/linked-grant context.
- Added dashboard navigation anchors for Overview, Campaigns, Claims, Grants, and History.
- Added an operations overview with campaign, published campaign, recent claim, active grant, and historical grant counts, plus a claim-status breakdown.
- Added a dedicated claims ledger with a status filter. Claim attempts are displayed separately from TrialGrant entitlements.
- Separated the manual grant workflow and the historical grant ledger into distinct dashboard sections. Existing preview, explicit confirmation, revocation, campaign lifecycle, and no-autopay protections remain in place.

**Exact-SHA verification:** commit `e46ab9c48b2e56a703bb50c7ed4927daa1ca7bc3`, CI run [45850778809](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45850778809):
- Backend: **1,231 passed, 0 failed, 0 skipped**; lint, production-config preflight, selector comparison and JavaScript syntax checks passed.
- Frontend: lint, TypeScript, unit tests, deployment-config tests and production build passed.
- Browser navigation/accessibility suite: **168 passed**.
- Production release gate: passed.

No staging/production deployment, pull request, branch creation, or merge was performed.

**Status:** implementation candidate committed for exact-SHA CI and release-gate verification. No staging or production deployment has been performed.


## Task 26 implementation — verified

**Scope:** Extend the payment-disabled regression coverage to the subscription-charge webhook path, ensuring previously-created provider transactions still reconcile after new checkout is disabled.

Implemented on `buddy-for-study-v2.2`:

- Added `server/test/subscriptionWebhookAvailability.test.js`.
- Verifies a valid signed `subscription.charged` webhook reconciles the existing pending payment using the provider-confirmed amount/currency, activates the linked subscription, and finalizes the webhook event while `paymentsEnabled=false`.
- Verifies a previously processed event is acknowledged as a duplicate without replaying billing mutations.
- Verifies an invalid signature is rejected before a webhook claim or payment/subscription mutation.
- Uses test-only signing secrets and mocked persistence. No live Razorpay call, credential, deployment, or payment runtime code was changed.
- Existing tests continue to cover enabled/disabled new checkout, course-payment verification, amount/currency matching, webhook signatures and transitions, duplicate provider events, refunds, subscription cancellation, and checkout concurrency.

**Verification:** exact-commit CI passed on `b5242fd2469f21a4598abed852b170f59ba8dfbb`: backend `npm test` 1,153 passed / 0 failed; backend lint, production-config preflight, selector comparison and JavaScript syntax validation passed. Frontend checks and the production release gate also passed. Run [45157423392](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45157423392).

## Task 27 regression suite — completed and expanded

Task 27 is complete on `buddy-for-study-v2.2`. Existing regression suites already covered persisted learner eligibility, prior claims and active subscriptions, deterministic fail-closed reasons, unique claim/idempotency constraints, transaction-backed entitlement activation, campaign-capacity and cross-campaign races, expiry/revocation, free-plan restoration, individual-purchase preservation, and admin audit/permission controls.

Additional HTTP-boundary coverage was added to close the remaining gaps:

- `server/src/controllers/trialCampaignClaim.controller.js` now accepts an optional claim-service dependency for isolated controller testing; normal Express invocation still uses the existing `claimTrialCampaign` service. The controller continues to bind the claim to `req.user.userId`, not a learner ID supplied in request JSON.
- New `server/test/trialCampaignClaimController.test.js` covers authenticated-user binding (including a spoofed body `userId`), successful activation, idempotent replay, invalid campaign IDs, missing/mismatched idempotency keys, preservation of eligibility/concurrency error codes, and forwarding unexpected errors to Express.
- `server/test/adminTrialCampaignRoutes.test.js` now explicitly asserts that the admin trials router installs `authMiddleware` followed by `adminMiddleware`, denies non-admin and non-admin-access tokens, and allows the valid admin token before the per-route permission checks.
- Existing `trials.manage` permission tests still exercise the admin role matrix and explicit permission override.

Regression coverage remains in `trialCampaignEligibility.service.test.js`, `trialCampaignClaim.service.test.js`, `trialCampaignClaim.integration.test.js`, `trialCampaignClaimRoutes.test.js`, `trialLifecycle.service.test.js`, `trialCourseAccessLifecycle.integration.test.js`, `adminTrialCampaignSafety.test.js`, `adminTrialCampaignControllerSafety.test.js`, `adminTrialCampaignRoutes.test.js`, `adminTrialCampaignAudit.integration.test.js`, `adminTrialGrantAtomicity.test.js`, `adminTrialGrantAudit.integration.test.js`, `adminRoutePermissionCoverage.test.js`, and `courseLearningAccessGuards.test.js`.

**Exact-SHA verification:** commit `379fad5724dff64637f3e2e3355ff381f00a0460`, CI run [45186373273](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45186373273):

- Backend: **1,181 passed, 0 failed, 0 skipped**. MongoDB replica-set integration tests ran as part of this suite.
- Frontend: lint, TypeScript typecheck, unit tests, deployment-config tests, and production build passed.
- Browser navigation/admin/accessibility suite: **126 passed**.
- Production release gate: passed.

The task tracker status is `DONE`. Repository CI verifies the regression suite for this SHA; it is distinct from Task 29 live-provider operations readiness and Task 30 staging/release approval.
 
## Task 28 frontend quality and accessibility — DONE

Task 28 is complete on `buddy-for-study-v2.2`. Existing Playwright coverage verifies the acceptance areas without duplicating existing UI tests:

- Responsive layout: learner routes are checked at 360, 390, 768, 1024, and 1440 pixels; public pages are also checked at a 360-pixel viewport for horizontal overflow.
- Forms: accessible labels, required-field validation, alert announcements, and prevention of invalid authentication requests.
- Dialogs: semantic dialog roles, labelled controls, focus trapping, Escape dismissal, and focus restoration.
- Keyboard access: account-menu arrow/Home/End/Escape behaviour, dialog tab order, and keyboard activation of administrator controls.
- Accessibility: axe-based scans are included in navigation and administrator browser suites.
- Browser coverage runs against the production build and includes learner navigation, administrator access, Google Sign-In behaviour, and accessibility regressions.

**Exact-current-HEAD verification:** `786babc3e899d293b313cdb6cb7a4e05aa73ce80`, CI run [45187112505](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45187112505):

- Backend: **1,181 passed, 0 failed, 0 skipped**.
- Frontend unit tests: **93 passed**; deployment-configuration tests: **7 passed**.
- Playwright browser navigation/admin/accessibility suite: **126 passed**.
- Frontend lint, TypeScript typecheck, production build, backend lint, and the Production release gate completed successfully.

**Non-blocking quality note:** the successful lint steps still report 53 frontend and 3 backend warning diagnostics (zero lint errors). These warnings are not represented as a warning-free lint result and should remain visible technical-debt cleanup.

**Status: DONE.** The browser checks are repository evidence; they do not replace live-device, staging-provider, or production verification.

## Task 29 — deployment configuration and repository operations controls — DONE (repository scope)

Implemented on `buddy-for-study-v2.2`:

- Added the strict read-only deployment verifier with bounded retries for transient network and HTTP 408/425/5xx failures.
- Added optional exact Google OAuth client-ID verification and an authenticated, read-only `/api/health/operations` check for configured worker mode, heartbeat, and job-lease health.
- Kept the existing root `/health` response contract unchanged and updated the strict deployment verifier to check `/api/health`, the release-aware liveness controller that exposes `status: "ok"` and the non-secret release SHA.
- Added a regression test proving the root endpoint is wired to the same release-aware health controller.
- Added `.github/workflows/staging-verification.yml` as a separate, manual, V2.2-only, read-only option for an operator who later chooses to verify an independently deployed staging copy.
- Added the operations runbook and deployment/environment documentation describing the low-cost inline scheduler topology, environment requirements, verification evidence, and known production risks.

The configured low-cost deployment mode remains `BACKGROUND_WORKER_MODE=inline`: scheduled server-side jobs execute inside the API process rather than a separate paid worker. This is best-effort on a free/sleeping host; it does not provide always-on or exact-time scheduling guarantees. Learner-device IndexedDB/Service Worker progress synchronization remains a separate browser capability and does not execute privileged server jobs.

**Exact-candidate verification:** commit `55b0e16eb932fbcc46d558e11f175af48534964c`, CI run [45210687511](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45210687511) passed: backend **1,181/1,181**, frontend unit **93/93**, deployment configuration **7/7**, Playwright **126 passed**, backend/frontend lint, TypeScript, production build, production-config preflight, and the Production release gate all succeeded.

**Status: DONE for repository implementation.** Live DNS/TLS/CORS/OAuth, SMTP/provider delivery, Gemini/YouTube quota, MongoDB backup/restore, monitoring/alerts, privacy retention/deletion, rollback rehearsal, and hosting-plan suitability remain environment-specific go-live checks for the deployment operator. They are not represented as passed by repository CI.

## Task 30 — final repository readiness gate — DONE (repository scope)

The workflow `.github/workflows/final-release-gate.yml` has been reshaped into a repository-only readiness gate, aligned with the deployment workflow you will handle separately:

- Manual-only and restricted to `buddy-for-study-v2.2`.
- Read-only GitHub permissions (`contents: read`, `actions: read`).
- Confirms the dispatched candidate is still the current V2.2 branch HEAD.
- Finds the latest completed successful **BuddyForStudy CI** run for the exact candidate SHA.
- Requires the `backend`, `frontend`, and `Production release gate` jobs to be successful.
- Rechecks the branch HEAD before recording the repository-readiness result.
- Does not require staging URLs, staging admin tokens, GitHub deployment environments, or production reviewer configuration.
- Does not deploy, change hosting settings, update DNS, rotate secrets, or mutate databases.
- The separate manual staging verifier remains available for later operator use but is not a prerequisite for repository readiness.

The gate explicitly labels its result as repository-level code/build/test/production-configuration CI evidence only. It does not represent staging verification, legal/privacy approval, production go-live approval, or deployment authorization.

**Status: DONE for repository implementation.** Exact-candidate CI passed at `55b0e16eb932fbcc46d558e11f175af48534964c` in run [45210687511](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45210687511). The manual repository-readiness workflow is implemented and tested but was not dispatched during this work. The independent production go-live checklist in `docs/OPERATIONS_READINESS_RUNBOOK.md` remains applicable; a green repository gate does not certify live infrastructure or waive known privacy/data-rights and backup/rollback work.


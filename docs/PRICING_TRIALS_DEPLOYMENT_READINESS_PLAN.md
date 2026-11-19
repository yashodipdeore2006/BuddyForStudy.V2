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
| 3 | Map plan, checkout, entitlement, trial, admin, and deployment dependencies | Route/model/component/deployment map and identified gaps | NOT_STARTED |

### Phase 2 — Plans and payment availability

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 4 | Correct public plans API | All active public plans returned independently of payment availability | DONE |
| 5 | Correct learner Pricing page | Paid and free plan cards remain visible when payments are disabled | DONE |
| 6 | Disable paid checkout actions in UI | No Razorpay load/order attempt when disabled; clear status message | DONE |
| 7 | Harden server payment availability controls | New orders blocked; existing verification, webhooks, sync, and cancellation remain usable | DONE |
| 8 | Verify default free-plan assignment | Idempotent free access and concurrent assignment tests pass | DONE |
| 9 | Improve subscription-plan configuration | Validated plan lifecycle, price, interval, features, limits, order, and visibility behaviour | NOT_STARTED |

### Phase 3 — Trial campaign backend

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 10 | Design TrialCampaign data model | Schema, indexes, validation, and migration/deployment notes reviewed | NOT_STARTED |
| 11 | Implement campaign management APIs | Permission-protected create, update, list, publish, pause, and disable operations | NOT_STARTED |
| 12 | Implement quick-trial presets | Safe 7/14/30-day defaults with editable values | NOT_STARTED |
| 13 | Implement eligibility engine | Deterministic eligibility and skipped reasons | NOT_STARTED |
| 14 | Implement claim API | Idempotent, atomic, duplicate-safe, capacity-safe claim operation | NOT_STARTED |
| 15 | Integrate trial entitlements | Free claim activates entitlement without a payment order or provider call | NOT_STARTED |

### Phase 4 — Learner trial experience

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 16 | Implement learner offer API | Authenticated, server-calculated offer and eligibility response | NOT_STARTED |
| 17 | Build trial claim popup | Claim and dismiss paths work; no duplicate prompt after claim | NOT_STARTED |
| 18 | Implement trial lifecycle handling | Start, expiry, revocation, and free-plan fallback are consistent | NOT_STARTED |
| 19 | Update learner Billing experience | Trial plan, start/end, remaining duration, and no-autopay status are clear | NOT_STARTED |

### Phase 5 — Admin experience

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 20 | Redesign Trial Dashboard | Campaigns, claims, grants, status, and history are separated | NOT_STARTED |
| 21 | Simplify trial creation | Guided quick-create, eligibility, limits, review, and publish flow | NOT_STARTED |
| 22 | Reorganize Course Pricing Studio | Overview, catalogue, bulk editor, recommendations/rules, and history sections | NOT_STARTED |
| 23 | Organize Subscription Plans dashboard | Basics, billing, entitlements, presentation, and review sections | NOT_STARTED |
| 24 | Improve Finance & Governance navigation | Clear grouping, concise labels, descriptions, and permission consistency | NOT_STARTED |

### Phase 6 — Quality and release readiness

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 25 | Audit plan and pricing integrity | Currency, ordering, sale price, feature and limit regression tests pass | NOT_STARTED |
| 26 | Payment and subscription regression suite | Enabled/disabled checkout, verification, webhook, and cancellation tests pass | NOT_STARTED |
| 27 | Trial security and lifecycle regression suite | Eligibility, role isolation, concurrency, cap, idempotency, expiry and audit tests pass | NOT_STARTED |
| 28 | Frontend quality/accessibility checks | Typecheck, lint, unit, responsive, keyboard, accessibility and browser tests pass | NOT_STARTED |
| 29 | Deployment operations readiness | Environment, DNS/TLS/CORS/OAuth, MongoDB, mail, AI/YouTube, worker, privacy, backups, monitoring and rollback evidence | NOT_STARTED |
| 30 | Final release gate | Exact-SHA CI and staging verification pass; blockers and accepted risks documented; approval recorded | NOT_STARTED |

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

This map was checked against candidate `ee972d68b70ba02688488c57a51e92b91ffd453f`. Paths are repository-relative. The map is a code-structure finding, not evidence that the corresponding external deployment is live.

### 8.1 Public plan and learner billing path

| Layer | Current implementation | Finding |
|---|---|---|
| Plan model | `server/src/models/SubscriptionPlan.js` | Stores name, slug, description, price, currency, interval, features, limits, active/popular flags, trialDays, sortOrder, provider plan ID. No separate campaign entity exists in this model. |
| Public catalogue API | `server/src/routes/billing.routes.js` — `GET /api/billing/plans` | Returns active plans but filters to zero-price/free plans when `paymentsEnabled=false`. This contradicts the confirmed display requirement. |
| Learner plan page | `client/src/pages/Pricing.tsx` | Reads the payment flag and also filters paid plans on the client. Paid cards can show “Coming soon” but are currently removed from the displayed list in the disabled state. |
| Learner billing | `GET /api/billing/me`, `/entitlements`, `/payments`, `/trial` and `client/src/pages/Billing.tsx` | Existing subscription, entitlement, transaction, and active-trial surfaces exist. |
| Default entitlement | `server/src/services/subscriptionEntitlement.service.js` and `GET /api/billing/me` | There is a free-plan lookup and a race-safe unique-user subscription assignment path. Must be regression-tested under the final changes. |

### 8.2 Admin pricing path

| Work area | Current implementation | Intended boundary |
|---|---|---|
| Subscription Plans | `client/src/pages/admin/AdminPlans.tsx`, `server/src/models/SubscriptionPlan.js`, existing admin plan APIs | Manage platform membership plans and entitlements. |
| Course Pricing Studio | `client/src/pages/admin/AdminPricingStudio.tsx`, `server/src/controllers/adminPricing.controller.js`, `server/src/routes/adminPricing.routes.js` | Manage individual course pricing, bulk edits, previews, rules, recommendations, history, and rollback. |
| Admin navigation | `client/src/pages/admin/AdminLayout.tsx` | Currently lists both work areas in Finance & Governance; preserve their distinct meaning while making the group easier to scan. |
| Authorization | `plans.read/manage`, `pricing.manage`, admin middleware and per-route permission checks | UI navigation is not security; backend permission checks must remain in place. |

### 8.3 Existing trial path and missing self-serve campaign path

| Layer | Current implementation | Finding |
|---|---|---|
| Grant record | `server/src/models/TrialGrant.js` | Records learner, entitlement plan, campaignName, reason, actor, start/end, status, conversion state, provider reference, and idempotency key. Unique user/campaignName and idempotency protections exist. |
| Admin grant flow | `client/src/pages/admin/AdminTrialCampaigns.tsx`, `server/src/controllers/adminTrials.controller.js`, `server/src/routes/adminTrials.routes.js` | Supports choosing a learner or filtered group, previewing eligibility, granting, and viewing recent grants. |
| Learner trial status | `GET /api/billing/trial` in `server/src/routes/billing.routes.js` | Returns a learner's current active TrialGrant and optional conversion plan. |
| Learner trial UI | `client/src/pages/Billing.tsx` and `client/src/pages/Pricing.tsx` | Displays an active trial and, when configured, a paid conversion offer with explicit consent. |
| Campaign configuration | No `TrialCampaign` model or public campaign CRUD/claim route exists in the audited tree | Admin grants are not the same as reusable, publishable self-serve campaigns. |
| Self-serve offer | No authenticated eligible-offer endpoint or trial-claim popup exists in the audited tree | Must be implemented without allowing browser-only eligibility or duplicate claim decisions. |

### 8.4 Payment route boundary

Current wiring in `server/src/server.js`:

- `/api/payments` is protected by `paymentLimiter` and `requirePaymentsEnabled` at the router mount.
- The mounted router contains both order creation and verification endpoints: `POST /course/order`, `POST /course/verify`, and `POST /subscription/order`.
- `/api/webhooks` is also protected by `requirePaymentsEnabled`.
- Billing subscription sync and cancellation are separate routes under `/api/billing`.

This protection is too broad for the required lifecycle. The revised design should guard only new order-creation actions. It must allow verification of an already-created order, signed provider webhooks, reconciliation/sync, and subscription cancellation. The exact route-level guard and regression tests are part of Task 7.

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

**Task 3 disposition:** architecture and gaps mapped; proceed to Task 4. Do not mark any external deployment task complete from this source review alone.


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

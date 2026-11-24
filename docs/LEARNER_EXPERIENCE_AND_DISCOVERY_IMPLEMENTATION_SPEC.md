# Learner experience, Explore discovery, trials and Build with AI — implementation specification

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Execution branch:** `buddy-for-study-v2.2` only  
**Baseline commit:** `c718773eb313f89ba6c24a519c8339df7289e70e`  
**Task programme:** 24 tasks; progress is reported after every task as `N / 24`  
**Release policy:** no deployment, merge, pull request, new branch or change to `main` without explicit authorization.

## 1. Product outcome

Deliver a coherent learner experience across five connected areas:

1. Guest discovery and authenticated enrollment.
2. Search-state continuity when learners navigate away from Explore and return.
3. Domain-relevant, quality-weighted course discovery.
4. Permanent Free access with explicitly claimed, admin-configured welcome trials.
5. Observable, resumable Build with AI generation that protects the user's active request from accidental changes.

The implementation must preserve existing payment, subscription, course-publication, consent, privacy, authentication and background-work invariants. Existing code is reused where it already meets the acceptance criteria; this programme is not a reason to rewrite working subsystems.

## 2. Agreed product decisions and recommended defaults

### 2.1 Guest experience and enrollment gate

- Keep public course discovery, public course detail pages, About, Contact, FAQ and Pricing accessible without an account.
- The root route remains the public entry experience for logged-out visitors. It should be a purposeful landing/discovery experience with clear **Create account** and **Log in** calls to action, not a login wall. Authenticated learners see their personal Home/dashboard at the same route.
- When a guest selects **Enroll**, show an accessible sign-in/sign-up choice dialog while retaining the course and intended action.
- The dialog's actions enter the existing full authentication and verification flows. Do not duplicate the email OTP, consent or Google OAuth implementation inside a second form.
- After successful authentication, return the learner to the same course and resume the intended enrollment action exactly once. Never automatically submit a payment or recurring mandate; payment authorization remains a separate explicit action.
- Enrollment endpoints remain authoritative and must enforce duplicate/idempotency and entitlement rules server-side. Client-side modal state is not an authorization control.

### 2.2 Explore state continuity

- URL search parameters are the canonical, shareable representation of Explore state: query, domain/category, level, sort, page/cursor and supported filters.
- Browser Back/Forward and refresh must restore the same search state.
- On in-app navigation from a course detail page back to Explore, restore the previous result snapshot and scroll position immediately when it is still valid; revalidate in the background without unexpectedly clearing the current view.
- Cache entries are keyed by the normalized search parameters and have a bounded freshness policy. Do not persist private user data or enrollment state in a public search cache.
- Search state must not be lost when a learner opens a course, signs in, or returns from authentication.

### 2.3 Domain-aware relevance and quality ranking

- Introduce stable canonical domain identifiers and a controlled alias/taxonomy map. Do not rely on free-text category equality alone.
- Existing course category/title/content data must be mapped conservatively. Ambiguous or unclassified courses must not be silently assigned to an unrelated domain; expose them for an administrator/content-quality review.
- Resolve ordinary search queries deterministically against the domain/topic taxonomy. Normal Explore search must not consume Gemini quota.
- Apply the domain/relevance boundary before ranking. A query classified as a domain-specific search must not return courses from a different domain simply because a generic text match or high popularity score exists.
- When there is no relevant course, return a clear no-results state and, where available, related topics from the same domain. Any YouTube fallback must obey the same domain constraint.
- Default sort is **Best match**. Additional modes should include **Highest quality**, **Most popular**, **Highest rated** and **Newest**, while all modes preserve the domain/relevance filter.
- Ranking is explainable and versioned. A starting score model (to be calibrated against the actual dataset) is:
  - query/topic relevance: 35%;
  - verified course quality/completeness: 25%;
  - curriculum depth and coverage: 15%;
  - confidence-adjusted approved learner rating: 15%;
  - enrollment popularity with diminishing returns: 5%;
  - freshness: 5%.
- Use a Bayesian/shrunk rating so a course with one five-star review does not outrank a well-reviewed course solely on its raw average. Use only approved, non-hidden reviews. Use completion/outcome signals only after confirming that the underlying data is reliable and sufficiently populated.
- Keep ranking weights configurable in code or controlled settings with a documented version. Do not let client-provided values influence server ranking.

### 2.4 Permanent Free plan and welcome trial

- Every eligible learner has access to the canonical, active, zero-price Free plan by default. The Free plan is not a temporary welcome campaign.
- A welcome campaign grants a separate, time-limited entitlement to the admin-selected trial plan only after the learner explicitly selects **Claim trial**.
- The countdown begins at claim/activation time, not when the campaign is created or published.
- Default eligibility: ordinary active learner account, required verification/consent completed, no current paid subscription or trial, and no previous trial unless an administrator explicitly configures another eligible audience.
- Default claim limit: one claim per learner per campaign and one active self-serve trial at a time. Claims are idempotent and auditable.
- The popup should be offered after sign-in/registration and required consent/profile gates are complete, preferably on the learner's first suitable dashboard visit. Do not compete with another modal or interrupt an active payment/authentication flow.
- Dismissing a popup does not grant a trial. A learner should be able to find an eligible offer again from an appropriate account/billing surface while the campaign remains claimable.
- On expiry or revocation, restore the canonical Free entitlement only when the expiring trial is still the active subscription being changed. Never overwrite a newer paid subscription.
- A trial claim never initiates a payment, recurring mandate or silent auto-renewal. Conversion, if offered later, requires separate explicit learner consent and provider-hosted authorization.
- When payments are disabled, Free access and eligible promotional trial entitlements continue to work; the user must not be pushed into checkout or charged.

### 2.5 Build with AI progress and interaction safety

- Use the persisted server-side roadmap draft/job as the source of truth. The job must be scoped to the authenticated owner, idempotent, observable and resumable after navigation or refresh.
- The user experience must expose real workflow stages, such as request validation, goal/skill mapping, curriculum generation, resource curation and final validation/persistence.
- Before the curriculum skeleton and total work units are known, show a truthful indeterminate stage state. Once the backend has a reliable node/lesson total, show progress from completed/failed/pending work units. Never fabricate a percentage or promise an unsupported finish time.
- Persist stage and node events so a reconnecting client can reconstruct the current state. Polling is acceptable where bearer-token authentication makes native EventSource unsuitable; the API contract remains transport-independent.
- Once generation starts, lock the submitted input fields. If a learner asks to edit the request, explain the effect and require an explicit confirmation to stop/replace the current job. Do not silently create a second billable generation.
- Navigation away should not accidentally cancel a job. Provide a persistent way to return to its progress. Explicit cancellation must be cooperative and safe; a building job cannot be shown as cancelled until the worker has stopped, released its lease and handled partial private output.
- Retain job status long enough for recovery/support, but avoid indefinite retention of learner input and generated content. Apply a documented retention window and owner-scoped access checks.

## 3. Technical architecture and invariants

### Authentication and enrollment
- Reuse `AuthContext`, `Login`, `Register`, email verification, Google Sign-In and existing consent gates.
- Carry a typed return intent (course ID + intended action) through the full authentication flow. Validate that the course still exists, is published/enrollable and is eligible before resuming.
- Use a one-shot resume guard and server-authoritative enrollment checks to survive refresh/back/retry without duplicate side effects.
- Do not automatically create a paid order or accept recurring billing after login. Present the payment action for explicit confirmation.

### Explore and search
- Keep URL parameters canonical; use a bounded result cache keyed by canonical query state. Restore scroll using history-entry identity rather than only a single global scroll value.
- Use server-side filtering, ranking and pagination. The browser may request sort modes but cannot submit a score or ranking weight.
- Add domain fields and indexes with a reversible/backfillable migration strategy. Backfill only high-confidence mappings; ambiguous rows stay unclassified pending curation.
- Preserve the existing rule that ordinary search is separate from Build with AI and does not call Gemini.

### Plans and trials
- Preserve existing `SubscriptionPlan`, `UserSubscription`, `TrialCampaign`, `TrialCampaignClaim` and `TrialGrant` boundaries.
- Preserve transaction requirements, unique claim/idempotency behavior, campaign capacity limits, admin authorization and audit events.
- Treat payment-provider webhooks/reconciliation as authoritative for paid subscriptions. A trial claim is not payment evidence.
- Keep the canonical Free plan resolution/assignment idempotent and safe when a plan is missing, inactive or ambiguous.

### Build with AI
- Preserve Mongo-backed drafts and distributed lease/heartbeat ownership.
- Store state transitions and stage/node events durably. Avoid local-process memory as the only source of progress.
- Cancellation must be a cooperative request respected by the worker at safe checkpoints. A lease loss must not allow the former worker to publish or overwrite a newer owner's result.
- Scope all status, event and cancel endpoints to the authenticated draft owner.
- Keep existing admission limits, plan entitlement checks, provider fallback behavior and partial-course cleanup.

## 4. Fixed implementation task checklist (24 tasks)

A task is counted complete only after its acceptance criteria and tests pass on the exact current branch head. Existing code is not automatically credited as complete; it must be inspected and verified. A task blocked by unavailable live credentials or staging is reported as blocked, not silently marked done.

| # | Task ID | Scope and completion evidence | Initial status |
|---:|---|---|---|
| 1 | LXP-001 | Freeze this product/technical specification, acceptance rules and 24-task tracker in repository documentation. | In progress |
| 2 | AUTH-001 | Build accessible enrollment sign-in/sign-up choice dialog and connect it to existing full auth routes without losing course context. | Pending |
| 3 | AUTH-002 | Resume the intended enrollment once after authentication; preserve course/action through email verification/Google flow; keep paid checkout explicit. | Pending |
| 4 | AUTH-003 | Implement guest landing and authenticated dashboard behavior at `/`; preserve public exploration and dedicated login/register routes. | Pending |
| 5 | AUTH-004 | Add unit/E2E coverage for guest enrollment, login, registration, verification, cancellation, reload, return and duplicate-enrollment safety. | Pending |
| 6 | EXP-001 | Make Explore query/filter/sort/page state canonical in URL parameters with browser history support. | Pending |
| 7 | EXP-002 | Restore previous Explore results and scroll when returning from details/auth; revalidate without view flicker or state loss. | Pending |
| 8 | EXP-003 | Add regression tests for refresh, Back/Forward, deep links, filter clearing, pagination and stale-cache handling. | Pending |
| 9 | DISC-001 | Define canonical domain/topic taxonomy and conservative existing-course mapping/backfill with review for ambiguous records. | Pending |
| 10 | DISC-002 | Resolve search intent and enforce server-side same-domain relevance before returning courses or fallback recommendations. | Pending |
| 11 | DISC-003 | Implement versioned, explainable quality ranking with confidence-adjusted ratings and diminishing-return popularity. | Pending |
| 12 | DISC-004 | Add supported sort modes and learner-facing labels/reasons without bypassing relevance filtering. | Pending |
| 13 | DISC-005 | Add ranking/relevance fixtures and regression tests for cross-domain exclusion, low-review bias, quality and pagination. | Pending |
| 14 | TRIAL-001 | Audit and verify automatic canonical Free-plan assignment, idempotency and protection of existing paid access. | Pending |
| 15 | TRIAL-002 | Verify/improve admin welcome-campaign setup, plan/duration/audience/window/claim-cap configuration, preview, publish/pause and audit. | Pending |
| 16 | TRIAL-003 | Verify/improve learner popup timing, eligibility, dismissal/re-entry and explicit idempotent Claim trial flow. | Pending |
| 17 | TRIAL-004 | Verify expiry/revocation restores Free safely, prevents duplicate active trials and never charges or forces checkout when payments are disabled. | Pending |
| 18 | TRIAL-005 | Add end-to-end trial campaign tests and ensure learner-visible plan, end date, status and remaining time are accurate. | Pending |
| 19 | AI-001 | Define and persist meaningful Build with AI stage/node progress events and an owner-scoped status contract. | Pending |
| 20 | AI-002 | Build an accessible animated progress experience driven only by real server stages and measurable work units. | Pending |
| 21 | AI-003 | Lock submitted inputs and add explicit confirmation for replacing/stopping an active generation; prevent duplicate submissions. | Pending |
| 22 | AI-004 | Resume progress across navigation/refresh, support persistent active-job discovery and implement safe cooperative cancellation/retention. | Pending |
| 23 | AI-005 | Add worker/service/controller/frontend tests for stage progress, reconnect, retries, cancel races, lease loss and cross-user isolation. | Pending |
| 24 | REL-001 | Run cross-feature security, accessibility, performance and regression gates; document staging/provider checks, rollout flags, monitoring and rollback. | Pending |

## 5. Definition of done for each task

1. Read-only audit of the exact `buddy-for-study-v2.2` head and relevant dependencies.
2. Implementation plan and precise file/API/schema scope recorded before code changes.
3. Changes remain on `buddy-for-study-v2.2`; no branches, PRs, merges, `main` changes or deployment.
4. Targeted unit/integration/E2E tests run. Add regression coverage for every fixed defect.
5. Run the relevant broader CI gates and verify the exact commit SHA. A code task is not complete while its required CI is pending or red.
6. Update this task tracker with status, commit SHA, test evidence and known limitations.
7. Report progress after every task as `N / 24`, with remaining, blocked and failed counts.

## 6. Baseline audit — what already exists (not yet accepted as complete)

The following foundations were found on the baseline commit; each corresponding task must still verify behavior and tests before being credited:

- `App.tsx` routes `/` to `Home`, `/explore` to `Courses`, and provides separate `/login` and `/register` routes. Logged-out Home currently shows a learner-start state and exploration/build CTAs; it is not yet a dedicated conversion-focused guest landing.
- `CourseDetails.tsx` redirects a guest who clicks Enroll to Login with course path state. It does not show the recommended choice dialog or automatically resume the enrollment action after login.
- `Courses.tsx` keeps its search/filter/sort/page state in component state. It currently does not canonicalize the full search state in the URL or reliably restore previous result/scroll state.
- `course.service.js` already aggregates approved rating counts and supports recent/popular ordering, and direct course/module/YouTube fallback search. It does not yet implement the full controlled-domain filter and weighted quality ranking specified above.
- The Course schema has a free-text `category` field; a canonical domain taxonomy/backfill is not evidenced in the current schema.
- The backend already has a canonical Free-plan resolver/assignment service and regression tests. Verify registration, legacy users and paid/trial transitions before changing it.
- Admin trial campaign routes, campaign models, eligibility/claim services, an admin screen and a learner popup already exist. They include explicit claims and idempotency protections. Audit exact eligibility, timing, campaign configuration and expiry behavior before changing this system.
- Build with AI already has a persisted `RoadmapDraft`, admission leases, stored events, polling and an authenticated event-stream endpoint. The frontend currently stores an active draft ID in local storage and polls status; its visible loading state does not yet provide the requested complete stage/node progress UX. The Render Blueprint keeps async roadmap rollout disabled by default.
- `RoadmapDraft` currently has a one-hour TTL based on `createdAt`; confirm this is sufficient for long builds and recovery before changing retention.

## 7. Operational safety and release policy

- Do not commit or disclose secrets. Do not change live provider settings.
- Do not enable payments, AI rollout flags, or other production feature flags as part of code implementation without a separate release decision.
- Do not deploy. CI verification is not a deployment or provider-staging test.
- Preserve the existing public route SEO/security behavior and all admin permission/audit controls.
- Any database backfill must be idempotent, bounded, observable, tested against a backup/fixture and safe to rerun.
- The final release decision requires real staging evidence for email/OAuth/payment integrations (where enabled), API health, worker/job heartbeat, backup/restore and rollback. A green CI run alone is not production clearance.

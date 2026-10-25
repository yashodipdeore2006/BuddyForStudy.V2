# BuddyForStudy.V2 — Reported Bug History and Platform Audit Register

**Branch audited:** `main`  
**Purpose:** Keep one durable record of bugs, errors, regressions, reliability risks, and product gaps reported during development; distinguish those historical reports from defects confirmed in the current source.  
**Status rule:** “Fixed + CI verified” means a code change and passing repository CI were recorded. “Historical / status unconfirmed” means the issue was reported, but the current provider/environment or a live production instance was not independently verified. “Audit candidate” means the current implementation needs further evidence before calling it a bug.

This is a living register. It is based on the user's conversation history and source-level/CI checks available to this audit; it is not a claim that every browser path or production integration has been exhaustively exercised.

## 1. Issues reported by the user

| ID | Area | Reported problem / symptom | Current register status | Notes |
|---|---|---|---|---|
| REP-001 | Learning progress | Marking a lesson complete persisted in the backend, but the green check/status did not update until the entire page was refreshed. | **Fixed + CI verified** | Completion endpoint now returns the complete progress snapshot, and the player replaces local state with that full snapshot. |
| REP-002 | Learning progress | The lesson's completion circle/check should itself mark complete and unmark complete when clicked. | **Fixed + CI verified** | Sidebar icon is now its own control; POST marks complete and DELETE removes that completion. |
| REP-003 | Course quiz | Submitting a course-module quiz the first time should complete the quiz lesson. | **Fixed + CI verified** | The first submission records the quiz lesson as complete regardless of the score; the score/pass state remains separate. |
| REP-004 | Admin learning roadmaps | `/admin/roadmaps` showed only one roadmap although Build with AI also stores generated roadmaps as Course records. | **Fixed + CI verified** | Admin inventory now unions saved learner plans with AI-generated course records and distinguishes learner completion from course publication status. |
| REP-005 | Admin learning roadmaps | Admins could see raw learner email addresses on a view guarded only by `courses.read`. | **Fixed + CI verified** | List/detail projections return learner names only; quiz responses and answer keys are excluded. |
| REP-006 | Billing / checkout | A pending subscription checkout could be reused for a different requested plan or trial-conversion context. | **Fixed + CI verified** | Checkout matching now requires the same plan and trial-conversion grant; mismatches are rejected. |
| REP-007 | Billing | Admin and learner billing totals could mix currencies and display an incorrect combined total. | **Fixed + CI verified** | Totals are grouped/displayed by currency; the legacy total is INR-only. Gross totals are labelled accordingly. |
| REP-008 | Billing / access | Refunds, stale enrollments, and current entitlement were not consistently tied to lesson/progress access. | **Fixed + CI verified** | Lesson, learning-item, and progress APIs re-check current access and reject revoked enrollment access. |
| REP-009 | Subscription webhook | A subscription charge could be recorded from stale checkout-intent amount/currency or insufficiently validated provider identifiers/status. | **Fixed + CI verified** | Charge handling validates subscription/payment relationship, captured status, positive amount and currency, and persists actual charge details. |
| REP-010 | Google Sign-In | Google Identity Services/FedCM token retrieval logged `NetworkError: Error retrieving a token` and “Prompt dismissed.” | **Historical / live status unconfirmed** | The symptom pointed to browser identity/token retrieval, but no current browser/Google configuration was available to confirm whether it still reproduces. |
| REP-011 | Build with AI / YouTube | YouTube Data API returned `forbidden`. | **Historical / live status unconfirmed** | Needs a live check of API key restrictions, enabled API, quota and provider response. Do not treat an API/configuration error as a confirmed application-code defect without current evidence. |
| REP-012 | Build with AI / LLM | OpenRouter generation request failed. | **Historical / live status unconfirmed** | API key, model availability, request schema, provider status and response body must be checked against current configuration. |
| REP-013 | AI course quality | A course could remain available when quiz questions were missing; retrying quiz generation was necessary. | **Mitigation implemented; monitor** | Course readiness explicitly treats on-demand quiz generation as a retryable learner workflow. Live generation reliability still depends on providers/quota and approval policy. |
| REP-014 | Frontend build | Reported TypeScript/JSX/build failures, including malformed JSX, missing symbols/imports, and `CoursePlayer.tsx` initialization/type errors. | **Historical reports; current CI passes** | Keep typecheck and production build as required checks; new errors need their own reproducible issue. |
| REP-015 | Browser tests | Playwright/navigation/admin-access tests failed, including a role-isolation assertion and push-permission UI checks. | **Historical reports; current coverage is not exhaustive** | Some previous CI runs failed during development before fixes; passing later CI does not prove every user journey. |
| REP-016 | Routing/auth UI | React Router reported no matching route and `useLocation()` outside a Router in earlier project work. | **Scope/status unconfirmed** | Some of these reports may refer to adjacent prototypes/projects, not this repository. Confirm reproduction in this app before modifying routing. |
| REP-017 | Pricing/plan UI | A screenshot showed plan details that did not appear to match the plan/pricing card being displayed. | **Audit candidate** | Requires comparing the actual plan DTO/API, currency/period, frontend selector and screenshot state. The page can be wrong even when checkout internals are correct. |
| REP-018 | Admin free trials | Trial campaign audience was effectively capped at 200 recipients despite the expectation that all matching eligible users should be selectable by filters. | **Product gap to verify** | Verify recipient caps, pagination, filter semantics and provider send limits; do not remove safety/provider caps without a safe batch/queue design. |
| REP-019 | Admin course pricing | Asked for a practical way to make individual courses free and ensure admin changes flow into user-facing price details. | **Product behavior to verify** | Audit free-course pricing end-to-end: admin write → persistence → catalogue/checkout/entitlement → receipt and UI. |
| REP-020 | General AI/build workflow | AI-generation retries, quota handling, async roadmap generation and approval states could make the UI appear stuck or give inconsistent feedback. | **Audit candidate** | Test pending/running/failed/ready and manual-approval paths, including reload/resume and duplicate requests. |

## 2. Recently changed code and evidence

- [Lesson completion UI and toggle behavior](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/779b16f4af34df419c0f69cd29b07653e7e11d9f)
- [Progress API returns full snapshot](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/1589c851c6bceeda9a487c5f6195d557473efacc)
- [Unmark lesson completion service](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/c875b19caf3a374332a28489acaeb38d5771fe6b)
- [Completion/quiz regression tests](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/a6e1a2a80d61a9387274995e7d9bd4b81d99c5e3)
- [Combined admin roadmap inventory](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/18e6553c22a5c5a3ad4d7d324ebe8125a8d5368e)
- [Roadmap search/detail UI](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/b0ad6dbd726ef9330eaf86e1d10bcad72eea998d)
- [Roadmap detail privacy tests](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/995aa1033f14dc5c0191d611d7672434db6c69e4)
- [Billing totals by currency](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/6e1762df0bcf7be96d180583ebff863d61a03f2f)
- [Subscription checkout plan isolation](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/b81aea5a7e4bb64d1c466f709bd2af38e5b4a89b)
- [Lesson access revalidates current entitlement](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/ee4a694677c62e912342e9f4f0ef526f2b52a7c6)
- [Progress API entitlement guard](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/dcbf40cdc79d4fca30120a75d4d6af471a67dcad)

Recent full CI verifications recorded during this conversation:
- [Roadmap inventory/search/detail: passed](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40217891719)
- [Lesson progress/quiz completion/toggle: passed](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40218840701)

## 3. Audit backlog and execution rules

Prioritize confirmed defects in this order:

1. **P0 — security/data integrity:** authorization bypass, cross-user data exposure, payment/refund/entitlement corruption, duplicate or missing financial records.
2. **P1 — core learning:** lesson/quiz progress correctness, course availability, AI generation state transitions, enrollment and free/paid access.
3. **P1 — admin operational workflows:** free trials, plan/pricing consistency, audience filters, notifications and action audit logs.
4. **P2 — reliability:** external provider retries/timeouts/quota, stale UI state, idempotency, error recovery.
5. **P2 — interface consistency/accessibility:** stale badges, misleading counts, disabled controls, keyboard/accessibility, no-result and loading/error states.

For every new finding, record the route/file and root cause, add a regression test where practical, make the smallest safe fix, and verify backend tests, syntax, frontend typecheck/build and browser smoke tests. A passing static test is not proof of a live third-party integration, production database state, or every UI interaction.

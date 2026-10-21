# BuddyForStudy Platform UI/UX Audit

**Branch:** `test`  
**Audit started:** 2026-10-21  
**Status:** In progress — source review started; browser verification not yet performed.

## Audit rules

- Separate source-confirmed defects from hypotheses that need browser evidence.
- Do not mark a visual or interaction issue fixed until the affected route is checked in a browser.
- Every finding should include an ID, severity, route/component, observed evidence, expected behavior, proposed fix, and verification steps.
- Fix shared root causes before applying page-specific overrides.
- After each task, report completed and remaining tasks.

## Initial source-confirmed findings

### UIX-001 — Course detail hero title contrast
- **Severity:** P1 (readability)
- **Route:** `/courses/:courseId`
- **Component:** `src/pages/CourseDetails.tsx`
- **Evidence:** The course hero uses a dark `bg-slate-950` background. The title previously had no explicit light text class, unlike adjacent hero content. It now explicitly uses `text-white`.
- **Status:** Source change committed in `b1e0e2c`; browser verification pending.
- **Verification:** Open a course with a long title at desktop and mobile widths; check title contrast, wrapping, and clipping.

### UIX-002 — Course detail rating card missing for zero reviews
- **Severity:** P1 (layout consistency / trust)
- **Route:** `/courses/:courseId`
- **Component:** `src/pages/CourseDetails.tsx`
- **Evidence:** The trust-statistics row conditionally rendered the learner-rating card only when `reviewStats.count > 0`, leaving an absent grid item for unrated courses.
- **Expected:** Always render the card. Show `0.0 (0 ratings)` for an unrated course and actual average/count otherwise.
- **Status:** Source change committed in `b1e0e2c`; browser verification pending.
- **Related follow-up:** The hero review-summary button still uses “New course” / “Be the first to review” when there are no reviews. Decide whether that copy should remain motivational or align with the numeric `0.0 / 0 ratings` presentation; avoid implying a rating exists.

### UIX-003 — Course card click affordances and click targets
- **Severity:** P1 (navigation usability)
- **Routes:** `/my-learning`, `/explore`, and any route using course cards
- **Components:** `src/pages/MyCourses.tsx`, `src/components/CourseCard.tsx`, `src/styles/learner-components.css`
- **Evidence:** Course-card implementations are not identical: My Learning has a page-specific card; shared cards use a reusable component. The My Learning card uses a body wrapper with `pointer-events: none` and selectively restores interaction on links; absolute-positioned elements and media overlays require browser validation.
- **Expected:** Every visible link shows a pointer cursor, has a visible hover/focus state, and navigates to its intended route. Buttons such as Save, Share, and Continue remain independent.
- **Status:** Cursor/link source updates committed in `475035a`, `7f721e0`, and `288e76a`; browser verification pending.
- **Verification:** Hover and click thumbnail/title/description/rating; test Save, Share, Continue; repeat at mobile width and while signed out/in.

### UIX-004 — Review summary language differs across the same course page
- **Severity:** P2 (content consistency)
- **Route:** `/courses/:courseId`
- **Component:** `src/pages/CourseDetails.tsx`
- **Evidence:** The hero review-summary control displays “New course” and “Be the first to review” at zero reviews, while the trust-statistics row displays `0.0 (0 ratings)`.
- **Expected:** Choose a consistent pattern. Recommended: keep the rating card numeric and use the hero control to invite the first review, clearly stating that no ratings exist yet.
- **Status:** Identified; not changed.

### UIX-005 — Admin design system requires cross-page interaction verification
- **Severity:** P1 (admin task reliability)
- **Scope:** `/admin/*`
- **Components:** `src/components/admin/DataTable.tsx`, `FilterBar.tsx`, `DetailDrawer.tsx`, `TypedConfirmDialog.tsx`, `StatusBadge.tsx`, `src/styles/admin-design-system.css`
- **Evidence:** Reusable components exist, but source inspection alone does not establish consistent focus management, responsive behavior, overflow handling, or action feedback across every consuming page.
- **Expected:** Verify keyboard navigation, filter reset, drawer close/focus restoration, destructive confirmations, table overflow, and loading/empty/error states.
- **Status:** Audit required; no defect claimed without reproducing it.

## Prioritized audit backlog

Severity definitions:
- **P0:** Blocks a core task, creates misleading information, or makes key content unreadable.
- **P1:** Significant usability/accessibility issue with a practical workaround.
- **P2:** Consistency/polish issue with limited task impact.
- **P3:** Optional refinement.

### Task 1 — Route and surface inventory
- [x] Extract route list from `src/App.tsx`.
- [ ] Map every route to its page, shared shell, auth requirement, and key states.
- [ ] Identify redirects, fallback routes, and any routes needing a test account.

### Task 2 — Learner visual audit
- [ ] Home (`/`, `/home`): hero hierarchy, primary CTA, responsive layout, section rhythm, footer.
- [ ] Explore (`/explore`): search/filter clarity, active filters, results count, empty results, card consistency.
- [ ] Course details (`/courses/:courseId`): hero contrast, rating states, statistics grid, long titles, curriculum, reviews.
- [ ] My Learning (`/my-learning`): card links, status labels, progress, action separation, loading/empty/error states.
- [ ] Course player (`/learn/:courseId`, `/learn/:courseId/:lessonId`): navigation, video/quiz states, progress, mobile layout.
- [ ] Roadmaps (`/courses/:courseId/roadmap`, `/roadmaps/:roadmapId`): stage clarity, progress, action labels, narrow-screen layout.
- [ ] Saved courses (`/saved`): empty state, removal feedback, card consistency.
- [ ] Profile and settings (`/profile`, `/settings`): form feedback, settings states, theme consistency, account actions.
- [ ] Notifications (`/notifications`): unread/read differentiation, bulk actions, empty/error states.
- [ ] Pricing and billing (`/pricing`, `/billing`): plan comparison, currency/interval clarity, payment status, refund/payment issue states.

### Task 3 — Authentication and account flows
- [ ] Login, register, forgot password, verify email, verify login, admin invitation acceptance.
- [ ] Required/invalid fields, password visibility, pending states, provider errors, success messages, redirect destination.
- [ ] Keyboard and screen-reader behavior for validation and feedback.

### Task 4 — Shared component audit
- [ ] Navbar, course cards, buttons, empty/error states, skeletons, page headers, notifications menu, command palette, dialogs.
- [ ] Pointer/hover/focus/active/disabled states.
- [ ] Reusable color, spacing, typography, radius, shadow, and motion tokens.
- [ ] Avoid conflicting CSS selectors and duplicate component-specific overrides.

### Task 5 — Admin visual and workflow audit
- [ ] Dashboard/control center and analytics.
- [ ] Users and courses management.
- [ ] Content quality and roadmaps.
- [ ] Plans, subscriptions, billing, and coupons.
- [ ] Communications, templates, deliveries, and retry flows.
- [ ] Roles, invitations, settings, AI content, support, operations, and audit log.
- [ ] Verify table density, filters, saved views, drawers, dialogs, permissions, and responsive behavior.

### Task 6 — Responsive and accessibility pass
- [ ] Check at 360px, 390px, 768px, 1024px, and wide desktop.
- [ ] No accidental horizontal page scrolling.
- [ ] Keyboard-only route traversal and visible focus.
- [ ] Contrast, zoom/reflow, semantic headings, labels, status announcements, reduced motion.
- [ ] Touch target and icon-only control audit.

### Task 7 — Loading, empty, error, and data edge states
- [ ] No courses, no saved items, no ratings, no notifications, no payments.
- [ ] Missing thumbnail/creator/duration/curriculum.
- [ ] Slow network, failed API, expired session, access denied, stale data, retry.
- [ ] Prevent duplicate submissions and communicate success/failure.
- [ ] Verify skeleton geometry and layout stability.

### Task 8 — Verification and report
- [ ] Run typecheck and production build.
- [ ] Perform browser walkthrough of each route and key state.
- [ ] Capture screenshots for confirmed visual issues.
- [ ] Produce a final ranked issue list with repro steps and exact files/components.
- [ ] Fix in small batches and repeat relevant regression checks.

## Route inventory from `src/App.tsx`

### Public / account
- `/`, `/home` → Home
- `/login` → Login
- `/register` → Register
- `/accept-admin-invitation` → AcceptAdminInvitation
- `/verify-email` → VerifyEmail
- `/verify-login` → VerifyLogin
- `/forgot-password` → ForgotPassword
- `/explore` → Courses
- `/pricing` → Pricing
- `/courses/:courseId` → CourseDetails
- `/courses/:courseId/roadmap` → CourseRoadmap
- `/courses` → redirect to Explore
- `/dashboard` → redirect to Home
- `/my-courses` → redirect to My Learning
- `/saved-courses` → redirect to Saved

### Authenticated learner
- `/billing` → Billing
- `/my-learning` → MyCourses
- `/saved` → SavedCourses
- `/learn/:courseId`, `/learn/:courseId/:lessonId` → CoursePlayer
- `/profile` → Profile
- `/settings` → Settings
- `/notifications` → Notifications
- `/playlists/:playlistId` → PlaylistCourse
- `/roadmaps/:roadmapId` → SavedRoadmap

### Admin
- `/admin/login` → redirect to Login
- `/admin` → AdminControlCenter
- `/admin/analytics` → AdminAnalytics
- `/admin/users` → AdminUsersPro
- `/admin/courses` → AdminCoursesPro
- `/admin/content-quality` → AdminContentQuality
- `/admin/roadmaps` → AdminRoadmaps
- `/admin/plans` → AdminPlans
- `/admin/billing` → AdminBilling
- `/admin/subscriptions` → AdminSubscriptions
- `/admin/communications` → AdminCommunications
- `/admin/deliveries` → AdminDeliveries
- `/admin/coupons` → AdminCoupons
- `/admin/settings` → AdminSettings
- `/admin/design-system` → AdminDesignSystem
- `/admin/audit` → AdminAudit
- `/admin/roles` → AdminRoles
- `/admin/ai-content` → AdminAIContent
- `/admin/support` → AdminSupport
- `/admin/operations` → AdminOperations
- `*` → NotFound

## Progress log

### Task 1 — Initial source review and audit document
- **Completed:** Extracted route inventory; inspected core learner pages, shared course cards, learner styles, and representative admin components; recorded five initial findings and created a prioritized audit backlog.
- **Not completed:** No full browser walkthrough, responsive screenshot sweep, automated typecheck/build, or exhaustive review of every page's runtime state has been performed.
- **Next:** Work through learner visual audit, starting with shared components and course discovery/details/learning flows. Verify each suspected issue before changing code.


## Task 2 — Learner visual/source review (first pass)

**Status:** Partial — source inspection completed for Home, Explore, Course Details, My Learning, Saved Courses, Course Player, Navbar, and shared CourseCard. No browser runtime verification yet.

### Additional findings / verification targets

### UIX-006 — Course-card thumbnail link is removed from keyboard tab order in shared card
- **Severity:** P1 (keyboard accessibility; verify intended interaction model)
- **Component:** `src/components/CourseCard.tsx`
- **Evidence:** The thumbnail link is rendered with `tabIndex={-1}` while the title, outcome, rating, and card-level link are separate links.
- **Concern:** If the thumbnail is presented as an independent link, keyboard users cannot focus it directly. If the card-level stretch link is the intended keyboard target, verify that it provides a clear accessible name and that controls within the card remain independently reachable.
- **Status:** Needs interaction test; do not change until the card link model is confirmed.

### UIX-007 — My Learning cards hide pointer events on the card body and selectively restore them
- **Severity:** P1 (interaction fragility)
- **Component:** `src/pages/MyCourses.tsx`, `src/styles/learner-components.css`
- **Evidence:** The shared body styling uses `pointer-events: none`; links then explicitly restore `pointer-events: auto`. A similar card has a separate full-card link pattern.
- **Concern:** This is easy to regress when a new interactive element is added and can make hover/click behavior differ between cards.
- **Expected:** Prefer normal pointer events on the body and explicit, well-layered links/buttons; avoid broad pointer-event suppression unless required by a tested overlay pattern.
- **Status:** Candidate for a focused refactor after browser reproduction.

### UIX-008 — Course detail page uses different zero-review copy in hero and statistics
- **Severity:** P2 (consistency)
- **Component:** `src/pages/CourseDetails.tsx`
- **Evidence:** The statistics card now says `0.0 (0 ratings)`, while the hero review summary says `New course` and `Be the first to review` when count is zero.
- **Expected:** Make the two areas complementary and unambiguous: numeric state in statistics; invitation copy in the review summary is acceptable if it clearly states no reviews exist.
- **Status:** Confirmed source inconsistency; content decision/fix pending.

### UIX-009 — Explore filters and search need a combined-state usability check
- **Severity:** P2 (discovery usability; verification required)
- **Route:** `/explore`
- **Component:** `src/pages/Courses.tsx`
- **Evidence:** Search, level, category filters, and clear-filter behavior are separate controls.
- **Verification:** Test combined filters, clear-all behavior, zero-result states, result-count updates, keyboard focus after clearing, and whether active filters are visible without reopening controls.
- **Status:** Audit target only; no confirmed defect yet.

### UIX-010 — Course player and detail page require narrow-screen interaction verification
- **Severity:** P1 (responsive task completion; verification required)
- **Routes:** `/courses/:courseId`, `/learn/:courseId/:lessonId`
- **Components:** `src/pages/CourseDetails.tsx`, `src/pages/CoursePlayer.tsx`
- **Evidence:** Both pages use multi-column layouts, horizontally scrollable tabs, and long content areas. The player deliberately clips horizontal overflow.
- **Verification:** At 360px and 390px widths, check video/quiz content, lesson sidebar access, tabs, sticky controls, long lesson titles, and whether clipped content remains reachable.
- **Status:** Audit target only; no confirmed defect yet.

### UIX-011 — Home has multiple recoverable loading/error states that need consistent presentation
- **Severity:** P2 (resilience; verification required)
- **Route:** `/` and `/home`
- **Component:** `src/pages/Home.tsx`
- **Evidence:** Home has a page-level error state, section-level alerts, retry controls, and a refresh progress indicator.
- **Verification:** Simulate a failed Home request and partial failures in enrollment/progress/stats. Ensure alerts do not duplicate, retry actions identify the affected section, and stale data remains understandable.
- **Status:** Audit target only; no confirmed defect yet.

### UIX-012 — Navbar desktop and bottom navigation need parity checks
- **Severity:** P2 (navigation consistency; verification required)
- **Component:** `src/components/Navbar.tsx`
- **Evidence:** The component renders a primary navigation and a separate bottom-tab navigation for learners.
- **Verification:** Compare active route indication, labels, access to saved/profile/settings, viewport breakpoint transitions, and keyboard access. Confirm there is no missing route or duplicate focusable navigation at breakpoints.
- **Status:** Audit target only; no confirmed defect yet.

### Task 2 progress
- **Completed:** Inspected source for Home, Explore, Course Details, My Learning, Saved Courses, Course Player, Navbar, and shared CourseCard. Added findings UIX-006 through UIX-012, clearly marking verification targets as unconfirmed.
- **Remaining:** Browser screenshots and interaction tests; inspect auth, profile/settings/billing, all admin routes, shared admin components, responsive breakpoints, accessibility, and loading/empty/error states.
- **Next:** Continue the source pass through authentication/account pages and then admin workflows; avoid code changes until a defect is confirmed or an unambiguous source defect is found.


## Task 3 — Authentication and account source audit

**Status:** Source pass completed for Login, Register, Forgot Password, Verify Email, Verify Login, Accept Admin Invitation, Profile, Settings, Notifications, Billing, and Pricing. Browser/keyboard validation remains outstanding.

### UIX-013 — Authentication form focus styling needs consistency verification
- **Severity:** P1 if focus is not visible; currently a verification target
- **Components:** `src/pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx`, `VerifyLogin.tsx`, `AcceptAdminInvitation.tsx`
- **Evidence:** These pages use a mixture of shared form classes and page-specific utility classes. The invitation form uses `outline-none` with custom border/ring styling; other forms rely on shared `input-field` and button classes.
- **Expected:** Every input, password toggle, resend action, and submit button has a clear keyboard focus indicator with consistent contrast.
- **Status:** Verify in browser using keyboard-only navigation before changing styles.

### UIX-014 — Auth error and success announcements need consistent placement and persistence checks
- **Severity:** P1 if users miss or cannot recover from errors; verification target
- **Components:** Login, Register, ForgotPassword, VerifyEmail, VerifyLogin, AcceptAdminInvitation
- **Evidence:** Pages implement error/message state, but use a mix of conditional error blocks and shared classes. ForgotPassword contains more than one conditional error rendering location in the component.
- **Expected:** A single clear message per current failure, associated with the relevant form, announced accessibly, retained until corrected/dismissed, and not duplicated.
- **Status:** Inspect runtime paths for invalid OTP, expired link, failed resend, network error, and successful submission.

### UIX-015 — Password visibility controls need accessible state verification
- **Severity:** P1 (form accessibility; verification target)
- **Components:** Login, Register
- **Evidence:** Both forms expose a password visibility toggle with an accessible label.
- **Expected:** Toggle label communicates the action/state (show or hide password), keyboard activation works, and toggling does not unexpectedly lose focus or clear the value.
- **Status:** Browser/keyboard verification pending.

### UIX-016 — Email/OTP resend states need usability checks
- **Severity:** P1 (account recovery; verification target)
- **Components:** VerifyEmail, VerifyLogin
- **Evidence:** Resend controls are disabled during a resend, during countdown, and in some cases when email is missing; OTP submit controls are disabled until six digits are entered.
- **Expected:** The countdown is understandable, resend success/failure is announced, users can correct an email when necessary, and disabled states explain why an action is unavailable.
- **Status:** Runtime verification pending.

### UIX-017 — Account/profile tabs may need explicit scroll affordance on small screens
- **Severity:** P2 (responsive usability; verification target)
- **Route:** `/profile`
- **Component:** `src/pages/Profile.tsx`
- **Evidence:** Profile sections are rendered in a horizontally scrollable navigation row.
- **Expected:** On narrow screens, all sections remain discoverable and keyboard reachable; selected section is visible and has an accessible active state.
- **Status:** Verify at 360px and 390px widths.

### UIX-018 — Settings contain independent loading/error states that need recovery-path checks
- **Severity:** P2 (settings reliability; verification target)
- **Route:** `/settings`
- **Component:** `src/pages/Settings.tsx`
- **Evidence:** Notification preferences and learning goals maintain separate loading and error states.
- **Expected:** One failed section should not make unrelated settings appear broken; each error should explain the affected setting and provide a retry path where safe.
- **Status:** Simulate partial API failures and inspect the resulting page.

### UIX-019 — Notifications error state needs an explicit retry affordance check
- **Severity:** P1 if retry is absent; source inspection follow-up required
- **Route:** `/notifications`
- **Component:** `src/pages/Notifications.tsx`
- **Evidence:** The page has a loading state and an error message branch.
- **Expected:** If the list fails to load, users should see a clear retry action and keep unrelated notification actions disabled until data is available.
- **Status:** Inspect full error branch and verify in browser before treating as a confirmed defect.

### UIX-020 — Billing combines several actions and messages; action-specific feedback needs verification
- **Severity:** P1 (financial workflow clarity; verification target)
- **Route:** `/billing`
- **Component:** `src/pages/Billing.tsx`
- **Evidence:** Refund requests and payment issue reporting write to a shared `refundMessage` state.
- **Concern:** A shared message can be ambiguous if multiple actions are present or a result appears far from the action that triggered it.
- **Expected:** Each action should have nearby, clearly labelled pending/success/error feedback and avoid replacing a result from a different action.
- **Status:** Inspect full action layout and test each action separately; no behavior change made yet.

### UIX-021 — Pricing payment confirmation has multiple intermediate states to distinguish
- **Severity:** P1 (purchase confidence; verification target)
- **Route:** `/pricing`
- **Component:** `src/pages/Pricing.tsx`
- **Evidence:** Source distinguishes payment success, subscription activation confirmation, and a state where activation is still being confirmed.
- **Expected:** Clearly distinguish payment accepted from subscription active; avoid implying activation is complete before it is confirmed, and provide a safe refresh/recovery action.
- **Status:** Verify all payment outcomes and timeout/reload paths.

### Task 3 progress
- **Completed:** Inspected source for all six authentication/invitation pages and Profile, Settings, Notifications, Billing, and Pricing. Added UIX-013 through UIX-021, marking unverified behavior as verification targets.
- **Remaining:** Browser/keyboard testing for authentication, OTP/resend, responsive profile navigation, settings partial failures, notifications retry, billing action feedback, and pricing payment states. Continue with admin workflows next.
- **Next:** Audit admin page composition and shared table/filter/drawer/dialog behavior, then append concrete findings to this document.

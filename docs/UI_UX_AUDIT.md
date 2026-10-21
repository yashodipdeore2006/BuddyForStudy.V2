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

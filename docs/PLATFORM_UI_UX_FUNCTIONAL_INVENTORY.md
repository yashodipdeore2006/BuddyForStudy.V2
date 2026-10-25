# BuddyForStudy — UI/UX, Functional Controls, Event and Deployment Inventory

**Audit baseline date:** 2026-10-25  
**Repository:** `yashodip2006/BuddyForStudy.V2`  
**Branch reviewed:** `main`  
**Runtime source of truth:** `src/App.tsx`  
**Companion reports:** [UI/UX audit](UI_UX_AUDIT.md), [User flow and element map](../USER_FLOW_AND_ELEMENT_MAP.md), [Build with AI v2 rollout](BUILD_WITH_AI_V2_ROLLOUT.md)

> **Status: source inventory started; browser verification is not complete.** This report maps implementation surfaces and event/API contracts found in the current source. A control being listed here does not mean its appearance, accessible behavior, provider integration, or production behavior has been validated in a live browser. Every item must move through source review → automated test → browser verification → staging/integration validation before it can be called deployment-ready.

## 1. Goals and audit method

The audit is designed to answer, for every product surface:

1. What route/page is it, and which user/admin roles can reach it?
2. Which links, buttons, inputs, selects, checkboxes, tabs, menu items, dialogs, and keyboard shortcuts does it expose?
3. Which event handler or state transition runs when the control is used?
4. Which API route, persistence operation, provider or permission check does it depend on?
5. What should the user see while loading, after success, after failure, when empty, when denied, and when offline?
6. What unit, integration, authorization, browser and deployment test proves the behavior?
7. What can go wrong with keyboard, screen-reader, responsive, focus, duplicate submission, stale data, or destructive action behavior?

### Evidence labels

- **Source-confirmed:** directly supported by current route/component/server/test source.
- **Automated coverage exists:** a test or CI step exists; passing status must be checked for the commit being released.
- **Needs browser validation:** source review cannot establish visual or interactive behavior.
- **Needs staging/provider validation:** needs real deployment configuration or a provider account.
- **Candidate issue:** suspicious pattern, not a confirmed defect until reproduced.
- **Fixed in source / verify in browser:** a code change exists but still requires the corresponding live check.

### Current release-test facts

- Frontend package scripts include `typecheck`, `build`, `lint`, and `test:unit`.
- Backend package scripts include `test`, `lint`, and `verify:deployment`.
- CI runs frontend typecheck, course-navigation unit tests, production build, Playwright navigation/admin-access smoke tests, backend tests, selector comparison in mock mode, and server JavaScript syntax checks.
- **Frontend lint is advisory in CI** because its step has `continue-on-error: true`. A green CI run therefore does not prove lint is clean.
- Current browser smoke tests are not an exhaustive test of every route/control and do not validate live Google OAuth, YouTube/Gemini quotas, Razorpay, SMTP, Web Push, Redis or deployed callbacks.
- Existing backend tests include admin route authorization/permission coverage, role-based access tests, billing/payment/subscription transitions, consent validation, course publishing/readiness/pricing, notifications, webhooks, and AI/curation/quota logic.

## 2. Route and access inventory

The following list is derived from `src/App.tsx`. Redirects are listed separately from rendered pages.

### 2.1 Public, visitor and account routes

| Route | Page/component | Access expectation | Primary user tasks |
|---|---|---|---|
| `/`, `/home` | `Home` | Public shell; personal sections vary by session | Discover courses, resume learning, view progress/achievements/recommendations |
| `/about` | `About` | Public | Understand product and trust proposition |
| `/contact` | `Contact` | Public | Find contact/support information |
| `/faq` | `FAQ` | Public | Find answers and support guidance |
| `/legal`, `/legal/:slug` | `LegalPage` | Public | Browse legal/policy documents and read a selected document |
| `/login` | `Login` | Public; creates an authenticated session | Email/password login, Google sign-in, validation and recovery |
| `/register` | `Register` | Public | Create account, validate password/confirmation, set optional marketing consent, Google sign-in |
| `/forgot-password` | `ForgotPassword` | Public | Request OTP, enter/validate OTP, set and confirm a new password, resend OTP |
| `/verify-email` | `VerifyEmail` | Public/verification token or email state | Verify six-digit OTP and request resend |
| `/verify-login` | `VerifyLogin` | Public/pending-login state | Verify login OTP and request resend |
| `/accept-admin-invitation` | `AcceptAdminInvitation` | Public invitation token; creates admin account/access | Accept invitation, set name/password/confirmation |
| `/explore` | `Courses` | Public catalog; AI/search capabilities may be entitlement/feature gated | Search and filter catalog; run intent-based Build with AI; open course; save/enroll where authorized |
| `/pricing` | `Pricing` | Public; subscription actions require session/consent | Compare plan price/features, start plan/trial conversion checkout |
| `/courses/:courseId` | `CourseDetails` | Public course view; actions depend on enrollment/entitlement | Course overview, preview, curriculum, reviews, notes, enrollment/purchase, sharing |
| `/courses/:courseId/roadmap` | `CourseRoadmap` | Public route; API access rules apply | Inspect the course learning journey/roadmap |
| `/courses` | Redirect to `/explore` | Public | Canonical catalog destination |
| `/about-us` | Redirect to `/about` | Public | Canonical About destination |
| `/contact-us` | Redirect to `/contact` | Public | Canonical Contact destination |
| `/help` | Redirect to `/faq` | Public | Canonical help destination |
| `/dashboard` | Redirect to `/home` | Public | Legacy URL compatibility |
| `/my-courses` | Redirect to `/my-learning` | Authenticated destination | Legacy URL compatibility |
| `/saved-courses` | Redirect to `/saved` | Authenticated destination | Legacy URL compatibility |
| `/admin/login` | Redirect to `/login` | Public redirect | Legacy admin login URL compatibility |
| `*` | `NotFound` | Public | Recover from unknown route |

### 2.2 Authenticated learner routes

| Route | Page/component | Primary user tasks |
|---|---|---|
| `/my-learning` | `MyCourses` | Move between In progress / Not started / Completed; continue course; save/share; open roadmap/course info; unenroll/undo; search/sort |
| `/saved` | `SavedCourses` | Review saved courses, open a course, remove saved item, recover from empty/error state |
| `/learn/:courseId`, `/learn/:courseId/:lessonId` | `CoursePlayer` | Resolve current/next lesson; watch lesson; complete lesson; quiz/practice quiz; create/manage timestamped notes; navigate lessons; send resource feedback |
| `/playlists/:playlistId` | `PlaylistCourse` | Inspect curated playlist/course and open its audit/review UI |
| `/roadmaps/:roadmapId` | `SavedRoadmap` | Continue a saved roadmap, complete lessons, generate/submit quizzes, delete a saved roadmap |
| `/profile` | `Profile` | Review/update profile and account learning/billing summary |
| `/settings` | `Settings` | Change personal details, learning goal/pace, password, notifications, browser push, marketing and cookie consent |
| `/notifications` | `Notifications` | Read/open notification, mark read, mark all read |
| `/billing` | `Billing` | Inspect subscription/payments, cancel subscription, filter/export transactions, request refund or report payment issue |

### 2.3 Admin routes

All listed admin routes are wrapped by `AdminPage`, which uses `AdminGuard` and `AdminLayout`. The current user's role/permissions are fetched from `/api/admin/access`; server routes still enforce permission middleware independently.

| Route | Page/component | Key workflows |
|---|---|---|
| `/admin` | `AdminControlCenter` | Overview, health, open alerts, refresh and acknowledge alert |
| `/admin/analytics` | `AdminAnalytics` | Choose reporting period, refresh, switch growth/revenue/analytics work areas |
| `/admin/users` | `AdminUsersPro` | Search/filter/sort/paginate users, saved views, select/export, inspect details, PII reveal with reason, status actions, feature overrides and course access |
| `/admin/courses` | `AdminCoursesPro` | Search/paginate courses; publish/feature/enrollment/certificate toggles; pricing; edit metadata, module/lesson/video/resource content and roadmap |
| `/admin/content-quality` | `AdminContentQuality` | Approval policy, AI review, publish/draft/archive/delete/restore, moderation, revisions/rollback, broken-link checks |
| `/admin/roadmaps` | `AdminRoadmaps` | Inspect generated roadmap records and learning status |
| `/admin/plans` | `AdminPlans` | Create/edit/activate subscription plans, change limits/features/billing intervals with reason where required |
| `/admin/trials` | `AdminTrialCampaigns` | Target one learner or filtered audience, preview eligibility, select plan/duration, optionally configure conversion offer, grant trial |
| `/admin/pricing` | `AdminPricingStudio` | Search/filter course prices, generated-course pricing policy, preview/recommend/apply bulk pricing, manage rules and rollback history |
| `/admin/billing` | `AdminBilling` | Work refund queues, payment issues and payments; inspect details; approve/process/reconcile with appropriate reason |
| `/admin/subscriptions` | `AdminSubscriptions` | Inspect subscription ledger/metrics and refresh data |
| `/admin/communications` | `AdminCommunications` | Create/edit/preview/test templates; define audience; preview audience; compose notification/email/announcement; submit reasoned send confirmation; inspect campaigns/deliveries |
| `/admin/deliveries` | `AdminDeliveries` | Filter/search delivery attempts by channel/status/type/date; inspect result; retry eligible failure with reason |
| `/admin/notifications` | `AdminNotifications` | Filter all/unread admin notifications, open and mark read |
| `/admin/coupons` | `AdminCoupons` | Create, bulk-generate, activate/deactivate and filter coupons |
| `/admin/settings` | `AdminSettings` | Advanced AI controls, notification configuration, social links, platform settings create/edit/delete with reason |
| `/admin/legal` | `AdminLegalDocuments` | Create/edit legal draft, import text, preview/version history, publish/unpublish/archive |
| `/admin/design-system` | `AdminDesignSystem` | Preview shared admin components, states, tabs, table density and design patterns |
| `/admin/audit` | `AdminAudit` | Search/filter audit records, inspect event details, manage saved views |
| `/admin/roles` | `AdminRoles` | Inspect administrators/roles, change role with reason, review permission groups |
| `/admin/ai-content` | `AdminAIContent` | Inspect/edit typed AI-content settings with a required reason |
| `/admin/support` | `AdminSupport` | Search/filter payment/support issues, inspect record, assign owner, update status, write internal/admin notes with confirmation/reason |
| `/admin/operations` | `AdminOperations` | Inspect health, failed webhooks, outbox, delivery log, settings registry and alerts; acknowledge an alert |

**Route inventory note:** `AdminInvitationManager.tsx` and `AIPromptVersionsPanel.tsx` are implemented source components. They are not listed as standalone routes in the current `src/App.tsx`; their rendered integration point must be maintained and tested where embedded. Do not invent a direct URL for a non-routed component.

## 3. Global shell and shared controls

### 3.1 Learner/public shell

| Component | Controls/elements and event behavior | Expected outcome / validation |
|---|---|---|
| `Navbar.tsx` | Home/Explore/My learning/Saved links; search icon opens command palette; notification trigger; account avatar menu; profile/settings; theme choices Light/Dark/System; help/shortcuts; sign out | Correct active route and access state; menu closes after navigation; search works by keyboard; sign out clears session; theme persists and follows system mode |
| `Footer.tsx` | About/Contact/FAQ/legal/social destinations; Cookie settings dispatches `bfs:open-cookie-settings` | All destinations exist; cookie control opens consent manager rather than navigating to a dead anchor |
| `CommandPalette.tsx` | Search input; course/command result buttons; active result; mouse/keyboard navigation; Escape/close; recoverable search error/retry | Arrow/Enter behavior matches visual active option; query/result updates do not trap focus; close returns focus |
| `NotificationMenu.tsx` | Open/close; mark all read; click notification (marks read before navigation); open full notifications; outside click/Escape handling | Read state updates in list and server; navigation destination is valid; menu state/focus is stable |
| `CookieConsentManager.tsx` | Reject optional; customize analytics/marketing toggles; save preferences; accept all; dismiss sync error; open from Settings/Footer event | Choice persists server-side; optional cookies default to selected consent; no optional trackers run before consent; retry/message is understandable |
| `PushNotificationPrompt.tsx` | Dismiss; recheck permission; enable Web Push; browser permission and preference API calls | Handles granted/denied/default permission, unsupported browser, missing VAPID key, API failure and unsubscribe; no repeated disruptive prompt |
| `AccountConsentGate.tsx` | Retry/sign out; accept Terms/Privacy; opt in/out marketing; complete Google profile; optional skip where allowed | Incomplete legal/profile requirements block only intended flows; data saves once; consent timestamp/version is auditable |
| `FeatureUpgradeModal.tsx` | Feature-gate event listener; select plan; checkout; “Maybe later”; dismiss and keyboard handling | Correct required feature/plan is shown; checkout and conversion failures retain recovery; backdrop/Escape do not discard an in-flight checkout |
| `AppErrorBoundary.tsx` | Recover/retry and full page reload | Error is reported without leaking details; recovery does not silently lose unsaved form work where preventable |
| `ErrorState.tsx`, `EmptyState.tsx`, skeleton/loading components | Retry action when provided; status/alert text; empty-state CTA when provided | Every retry is wired to the failed resource; empty states distinguish no records from load failure; layout remains stable |

### 3.2 Admin shell

| Component | Controls/events | Expected outcome / validation |
|---|---|---|
| `AdminLayout.tsx` | Collapse/expand desktop sidebar; open/close mobile nav; open learner site; sign out; command search (Ctrl/Cmd+K); quick actions; keyboard shortcut/help dialog; admin notification link; theme switch; user menu; platform settings link; breadcrumbs | Every item respects role and permission visibility; denied route displays access-restricted state; focus is trapped/restored in dialogs; mobile overlay closes; offline banner is accurate |
| `AdminTabs` in `AdminUI.tsx` | Click/keyboard arrow navigation through tabs | Active tab semantics/aria state match displayed content and keyboard focus |
| `AdminPagination` | Rows-per-page select; Previous/Next; disabled loading/out-of-range states | Query parameters/data and page label stay synchronized; changing limit resets or clamps the page |
| `DataTable.tsx` | Sortable header buttons; select-all-current-page; individual row checkboxes; optional clickable row; keyboard Enter/Space for focused row | Sorting/selection are predictable; click on a nested action does not trigger row action; screen reader receives sort/selection state |
| `FilterBar.tsx` | Search input; clear search; removable active-filter chips; Clear all | Debounce/reset state synchronizes with parent query; clearing one chip does not unexpectedly clear unrelated filters |
| `DetailDrawer.tsx` | Previous/next record; close button; click backdrop; Escape | Focus stays in drawer while open, then returns to invoking control; previous/next is disabled at boundaries |
| `TypedConfirmDialog.tsx` / `AdminConfirmDialog` | Cancel/confirm; optional typed phrase; reason (10–500 chars) and notes; keyboard/backdrop dismissal | Destructive action disabled until requirements pass; server revalidates reason/authorization; focus containment/restoration; busy state prevents duplicate submit |
| `SavedViews.tsx` | Save/apply/update/delete saved view, depending on host configuration | Filter/sort/columns/density are restored consistently; delete has clear confirmation and respects permissions |
| `PiiCell.tsx`, `MoneyCell.tsx`, `StatusBadge.tsx` | PII reveal affordance where permitted; currency/status rendering | PII is masked unless explicitly authorized and reasoned; amount uses correct currency/units; unknown status/value is displayed safely |
| `AdminUI.tsx` | Shared buttons/icon buttons/cards/alerts/skeletons/empty states/page headers/tables/dialogs | Correct disabled/loading semantics; no nested buttons/links; focus contrast and target size are consistent |

## 4. Learner route functional inventory

The action names below are source-level responsibilities. They are not a claim that every browser path has been executed.

| Page | Inputs, buttons, links and events to track | Main code handlers/API dependencies | Required state/edge validation |
|---|---|---|---|
| Home | Resume/continue CTA; course cards; Explore/Build with AI links; achievement/stats content; Retry/Refresh actions for failed sections | `loadHome`; `/api/enrollments`, `/api/courses?limit=24`, `/api/achievements/me`, `/api/progress/:courseId` | Empty courses, partial failures, stale progress, retry one failed section, no duplicate alerts, no dead course destination |
| Explore/catalog (`Courses.tsx`) | Search form/Enter; search input; level/category selectors; Clear filters; Build with AI; close/cancel; intent topic/goal question buttons; text/paste answers; Skip/Next/Change; AI goal/level/study-time/known-skills fields; generate/status retry; expand modules; course detail/preview; save/enroll; curation feedback | `fetchCourses`, `handleSearch`, `handleKeyDown`, intent question helpers, AI roadmap generation/status, enroll-generated-course and curation-feedback handlers; course/discovery/intent/AI/enrollment/saved APIs | Combined filters, URL/back navigation, zero results, quota-degraded search, provider error, invalid topic/long syllabus, request timeout, duplicate generation, cancel without state leak |
| Course card (`CourseCard.tsx`) | Cover/title/outcome/rating links; primary Start/Continue/Review/Enroll; Save/Undo; Share; error refresh where present | `handleSave`, `handleUndoSave`, `handleShare`, `handlePrimaryAction`; saved-course and enrollment APIs | Each link has one intentional destination; keyboard and pointer parity; optimistic action rollback; no malformed IDs; disabled/retry/success feedback |
| Course details/sales/hub (`CourseDetails.tsx`) | Share; Start/Continue/Review; course tabs; preview open/close; curriculum module expand/collapse; review stars/comment/submit/update; notes input/save; roadmap link; subscription vs individual purchase choice; checkout/enroll | `fetchCourse`, `handleCheckout`, `handleEnroll`, `handleSelectedPurchase`, `handleStartLearning`, `handleShareCourse`, `submitReview`; course/progress/enrollment/review/billing/payment APIs | Unpublished/removed course, enrollment/purchase race, entitlement denial, payment pending/failure/success, zero reviews, review edit, preview failure, long title/description, duplicate click |
| Course roadmap (`CourseRoadmap.tsx`) | Roadmap node/timeline actions supplied by rendered journey component; course/progress fetch/error view | Course, progress and journey-roadmap service | A roadmap must be available or a recoverable message shown; no dead links when no saved roadmap; responsive timeline and lesson IDs valid |
| Course player (`CoursePlayer.tsx`) | Open/close lesson sidebar; lesson selection; Prev/Next; mark complete; quiz generate/reattempt/submit/check; practice quiz options/submit; retry; lesson tabs; resource curation feedback; note timestamp, text, formatting buttons, save/clear/delete, filter/sort, jump-to-note; AI assistant actions if rendered | `load`, `loadQuiz`, `handleNavigate`, `handleComplete`, `handleGeneratePracticeQuiz`, `handlePracticeQuizSubmit`, `handleGenerateLessonQuiz`, `handleQuizSubmit`; course/player/progress/AI quiz/practice quiz/curation APIs | Missing/removed lesson, no curriculum, provider quota/timeout, access denied/subscription expiry, duplicate completion, quiz invalid answer/retry, timestamp malformed, note save failure, next-lesson fallback, completion status/notification |
| My Learning (`MyCourses.tsx`) | In progress / Not started / Completed tabs; search/sort when shown; Start/Continue/Review; Save/Unsave; Share; roadmap/course info; Unenroll, confirmation, Undo; retry on page-level load error | Current design uses `GET /api/enrollments` for persisted `learningStatus` plus batched `learningProgress`, and `/api/saved-courses`; actions call saved/enrollment APIs. Per-card hidden progress/enrollment preloader was removed in the latest implementation. | All three tabs match server state; no temporary zero state; not-started means no start activity/completions; in-progress means started/incomplete; completed means all current trackable lessons; undo/enrollment state stays consistent; verify no per-course progress N+1 calls in Network panel |
| Saved courses (`SavedCourses.tsx`) | Saved list; open course; remove/un-save and state feedback; empty/retry states; shared course cards | `load`; `/api/saved-courses` plus shared CourseCard actions | Failed list vs empty list; duplicate save; stale deleted/unpublished course; undo/success response; correct status-aware CTA |
| Saved roadmap (`SavedRoadmap.tsx`) | Open roadmaps; lesson completion; quiz generation/submission; delete/remove; return navigation | `/api/roadmaps` and per-roadmap endpoints | Unauthorized/not-found roadmap, empty roadmap, quiz provider error, delete confirmation and progress persistence |
| Playlist course (`PlaylistCourse.tsx`) | Open audit; close audit; rerun audit; playlist/resource actions; save/enroll/preview controls from rendered child | `auditCourse`; discovery playlist and roadmap APIs | Invalid playlist, zero usable videos, duplicate/reordered items, quota-limited resource; dialog focus and retry |
| Pricing (`Pricing.tsx`) | Plan CTA; trial conversion choice/consent checkbox; subscribe action | `subscribe`; plans/me/trial/subscription-order/subscription-sync APIs | Consent required; checkout cancellation; already active plan; no eligible conversion; price/interval/currency clarity |
| Billing (`Billing.tsx`) | Cancel subscription; export CSV; search; transaction-status filter; report issue; category/description; refund request/reason and submit/cancel | `loadBilling`, `submitRefund`, `submitIssue`, `exportCsv`; billing me/payments/refunds/issues/trial/cancel APIs | Empty history, zero records after filters, refund eligibility, pending states, malformed CSV data, duplicate request, cancellation failure |
| Profile (`Profile.tsx`) | Personal-information form/save; profile fields; learning and billing summaries/links | `handleSave`; enrollments, payments, subscription and auth/profile APIs | Initial load, invalid form, stale server version, save failure, no payment/enrollment records |
| Settings (`Settings.tsx`) | Contact info edit/save; learning goal selector/save/reset; password change; per-category email/in-app toggles; learning reminders; browser push enable/test/recheck; marketing email consent; cookie settings; reset and retry states | `loadPreferences`, `handlePasswordChange`, `handleNotifSave`, `handlePushToggle`, `saveLearningGoal`, `saveContactDetails`, `saveMarketingConsent`; consent/preferences/achievement/password APIs | Unavailable push APIs/browser, denied permission, invalid current password, no consent, save/cancel behavior, per-channel preference consistency |
| Notifications (`Notifications.tsx`) | Open notification, mark individual read, mark all read, unread state; return destinations | `markRead`, `markAllRead`; notifications API | Failed mark-read should not silently mislead; read state survives refresh; no duplicate side effect; unknown destination safely falls back |
| Account gate + verification | Terms/privacy acknowledgement; optional marketing consent; Google profile completion/skip; six-digit OTP entry; resend; recovery forms; password visibility | `saveLegalAcceptance`, `saveGoogleProfile`, `skipGoogleProfile`, auth submit/resend/recovery handlers | Invalid/expired OTP, resend throttling, repeated click, focus/announcement, expired invite, password policy, return-to-origin after sign-in |

### 4.1 Canonical learner event catalog

Track events (or explicitly document why not tracked) consistently across Explore, Home, Saved, My Learning, course detail and Course Player:

- `search_used`, `filter_changed`, `path_builder_opened`, `intent_answered`, `course_previewed`
- `course_saved`, `course_unsaved`, `course_enrolled`, `course_started`, `course_continued`, `course_unenrolled`
- `roadmap_opened`, `lesson_opened`, `lesson_completed`, `course_completed`, `quiz_started`, `quiz_submitted`
- `course_review_submitted`, `lesson_note_saved`, `resource_feedback_sent`, `checkout_started`, `subscription_started`, `refund_requested`

Recommended common properties: `userId` only where permitted, `courseId`, `lessonId`, `source` (home/explore/my_learning/saved/search/player), `status`, `feature`, `durationMs`, `outcome`, and a request/correlation ID. Avoid PII and raw user text. **Instrumentation coverage remains to be checked; this is the audit contract, not proof that all events currently exist.**

## 5. Administrator control and event inventory

| Page | Controls and event responsibilities | Main API/permission dependencies | Required validation |
|---|---|---|---|
| Admin shell (`AdminLayout.tsx`) | Expand/collapse navigation; mobile drawer; command palette; quick actions; shortcut help; theme switch; profile/settings; sign out; admin notifications; breadcrumbs; access retry; offline banner | `/api/admin/access`; each destination's own API permissions | Keyboard shortcuts, menu focus, permission filtered items, stale/revoked session, mobile overlay, denied route, sign out |
| Control Center | Refresh overview/health/alerts; dashboard view selector; acknowledge alert | Admin overview/health/system-health/operations alerts; dashboard/operations permissions | Partial endpoint failures; stale last-updated; duplicate acknowledge; acknowledge only after investigating |
| Analytics | Day-range selector; refresh; tabs/work areas | `/api/admin/analytics?days=`; analytics read permission | Boundary date selection, stale/zero data, partial failure, date label matches data |
| Users | Search/debounce; status/role/auth-provider filters; saved views/quick filters; columns/density; pagination/sorting; selection; clear/export; row/detail drawer; reveal PII with reason; status action with confirmation/reason; feature overrides and expiry; course access grant/revoke | `/api/admin/users`, access, saved views, export, PII reveal, feature overrides, user courses; `users.read`, `users.manage`, `users.pii.reveal` | Role matrix, no client-only security, reason validation, export selected-vs-all clarity, PII masking/audit, saved view lifecycle, filters reset page |
| Courses | Search/Enter/clear/pagination; readiness check; publish, feature, enrollment/certificate toggles; pricing mode/value; edit metadata/outcomes; roadmap edit/regenerate/save; add/update/delete module; add/delete lesson/video/resource; confirm destructive changes | `/api/admin/courses`, readiness, revisions, course roadmap, modules/lessons/videos/resources/tutorial endpoints; courses read/manage/publish | Readiness deny reason, dirty form state, publish failed/stale response, destructive confirmation, invalid lesson URLs, save concurrency |
| Content quality | Approval-policy select/save/reason; tabs lifecycle/moderation/roadmaps/links; AI approve/reject; publish/draft/archive; delete/restore; revision inspect/rollback; broken-link check | Content policies, course lists, moderation, roadmaps, revisions, broken-link endpoint; courses read/manage/publish | Policy rollback and reason, review conflict, optimistic updates, reversible status, malformed link result, error retry |
| Roadmaps | Refresh and inspect roadmap records | Admin content-roadmaps; courses read | Large list/pagination/filter needs; PII visibility; zero records and stale snapshot |
| Plans | Tabs; create form; name/slug/price/interval/trial days/order/popular; feature checkboxes; limits; edit details; activate/deactivate; save with reason | Admin plans; plans read/manage | Currency and billing interval, plan used by subscribers, immutable slug/identity constraints, limits semantics, unsaved draft, reason and confirmation |
| Trials | Single/group mode; email/search; registered-after/before; status/role/verification/provider/subscription/plan/course/city/goal filters where available; plan/duration/campaign/conversion offer; preview; confirmation checkbox; grant | Admin plans/trials grants/preview/grant; trials manage | Eligible count matches preview; no hidden arbitrary recipient cap; idempotency; duplicate grant prevention; reason/audit; duration bounds; conversion/autopay consent |
| Pricing Studio | Search/category/level/mode/publication/min/max price; generated pricing enabled/mode/fixed price/level bands/types/reason; operation type/amount/floor/sale handling; preview/recommend/apply; rule form and enable/auto-apply; run rules; history/rollback | Admin pricing courses/policy/rules/preview/apply/history/rollback; pricing manage | Validate price floor/ceiling; sale compatibility; dry-run preview stale version; rollback audit; newly generated course policy scope |
| Billing | Refund/issue/payment tabs; text/status search; detail drawer; refund approve/process; payment issue transition; reconciliation form/provider refund ID/reason | Admin refunds/payments/payment-issues/access; billing and issue permissions | Idempotent transitions; audit reason; provider/local state reconciliation; currencies and refunded totals; no action on ineligible status |
| Subscriptions | Refresh and read subscription ledger/metrics | `/api/admin/subscriptions`; billing read | Large data/pagination; status/timezone; stale data indicator |
| Communications | Workspace tabs; select/edit/create template; subject/title/body/link/channel/type/active fields; placeholder-token buttons; preview; test send; audience mode/list/segment/filter fields; preview audience; compose content; confirmation and required reason; campaign report/delivery lookup | Message templates, announcements, notification deliveries, audience options/preview; communications/notification/operations permissions | Recipient preview accuracy, suppression/consent, deduplication, rate/quota limits, schedule/timezone, send idempotency, reason/audit, partial channel failures, safe test-send |
| Deliveries | Search; channel/status/type/date preset/from/to filters; clear; inspect event; retry eligible failed email/push delivery with reason/confirmation | Admin deliveries/access/delivery retry; operations permissions | Retry idempotency/backoff, channel eligibility, reason, provider acceptance versus delivery, pagination retains filters |
| Admin notifications | All/Unread filters; mark read; open related destination | Standard authenticated notification APIs for current admin | Do not confuse personal admin notifications with platform-wide broadcast; permission-safe targets |
| Coupons | Create code/type/value/max discount/min order/usage limits/expiration/course; bulk prefix/count; activate/deactivate; reasoned actions | Admin coupons/courses/access; coupons read/manage | Percent vs fixed math, discount caps, expiry timezone, bulk count 1–100, usage exhaustion, course eligibility |
| Settings | Advanced AI limits/toggles/reason; notification config/retry/lead days/reason; social links/reason/reset; key/value/description/public flag; edit/delete setting with reason | Admin settings/access; settings read/manage | Value schema/registry, safe public exposure, rollback and audit, malformed URLs, reason length, unsaved edits |
| Legal & policies | Select/edit document; title/category/slug/summary; import .md/.txt; effective date/hosted URL/revision reason; save draft; preview/history; publish/unpublish/archive | Public/legal and admin document endpoints; legal manage | Markdown/HTML sanitization, slug uniqueness, version history, effective date/timezone, rollback/unpublish |
| Audit | Search/action/target filters; clear filters; inspect audit row; save/apply/delete views | Admin audit logs, saved views; audit read, saved_views manage | Pagination stable; PII sanitization; immutable log; reason shown; saved view belongs to current principal |
| Roles | Role/work area tabs; role selector per administrator; reason; save role | Admin roles/administrators; admin_roles manage | Prevent self-lockout/last-super-admin demotion; reason validation; permission refresh after change; audit event |
| AI Content settings | Group tabs; typed boolean/string/number setting editor; reason; refresh; save | AI content settings; ai.manage | Validate by registry type/range, preview impact, rollback strategy, no accidental provider spend |
| Prompt versions | Feature selector; refresh; load version to editor; import prompt file; edit version/name/notes; activate after save; reset draft; activate prior/builtin version with reason | Prompt version list/get/create/activate; ai.manage | Prompt length/schema, duplicate version race, activation audit, rollback and built-in fallback, dangerous prompt change review |
| Support | Search/filter/pagination; open issue; assign agent; status transition; internal note; public/admin note; reason/typed confirmation | Payment issues and assignee endpoints; support/issue permissions | Legal/PII minimization, explicit customer-visible-vs-internal distinction, required reason, concurrent updates, status transition state machine |
| Operations | Tabs for health/webhooks/outbox/delivery log/alerts/settings registry; refresh; acknowledge alert | System-health/webhooks/outbox/delivery-log/alerts/registry endpoints | Correlation ID, retry/DLQ workflow, false healthy state, freshness timestamp, ack reason/context, secret redaction |
| Admin design system | Demo buttons/cards/alerts/tabs/table density/save/cancel/delete sample | Client-side demo state, not production persistence | Clearly label demo controls so an operator does not confuse demonstration with persisted platform actions |

### 5.1 Destructive, financial, privacy and communication actions

The following actions require stronger proof than ordinary navigation because they affect money, access, PII, user communications or course availability:

- User disable/restore, account role or feature override, course access grant/revoke and PII reveal/export.
- Course publish/archive/delete/restore, module/lesson/resource changes, AI approval and revision rollback.
- Plan create/update/activation, coupon create/bulk generation/toggle, generated pricing policy and bulk pricing apply/rollback.
- Trial grant/extension, subscription cancellation, payment/refund reconciliation, refund processing.
- Bulk notification/email/announcement send, template activation, delivery retry.
- Platform setting change/delete, legal document publish/archive, role assignment, prompt activation, support case status transition.

For each action verify: permission middleware, form validation, typed confirmation when appropriate, 10–500 character reason where enforced, idempotency/concurrency behavior, persistent audit event, success/error feedback, refresh consistency, and a test that proves an unauthorized or malformed request never enters the mutation path.

## 6. Backend route and service map

The Express server mounts route groups in `server/src/server.js`. This table records the primary functional surfaces and the frontend flows they support.

| API prefix / route group | Main capabilities | Primary UI surfaces |
|---|---|---|
| `/api/auth` | Register/login/Google config and login; email/login OTP; password recovery/reset/change; profile/session/logout; admin invitation acceptance | Login/Register/verification/profile/settings/invitation acceptance |
| `/api/courses` | Course search/list/details, course learning data, admin create/update/delete and curriculum module/lesson operations | Explore/course detail/player/admin courses |
| `/api/enrollments` | Enroll/list/mine/by-course/by-ID/cancel | Course detail, My Learning, Home, Billing |
| `/api/progress` | Read progress and complete learning item under `learning_progress` entitlement | My Learning/Home/Course Player/course details |
| `/api/reviews` | List/upsert/delete course reviews | Course details |
| `/api/saved-courses` | List/save/remove saved courses | Cards, Saved courses, My Learning |
| `/api/billing` | Plans, current subscription, entitlements, payment history, cancellation, refunds/issues, trials and conversion | Pricing/Billing/feature gate |
| `/api/payments` | Course order/verification; subscription order | Course details/Pricing |
| `/api/roadmaps` | Save/list/get/delete roadmap; complete lesson; generate/submit quiz | Saved roadmap/player |
| `/api/ai` | Usage/curation feedback, synchronous and asynchronous roadmap draft/event/poll/finalize, quiz/practice quiz, admin course generation | Build with AI, player/admin AI content |
| `/api/intent` | Parse user intent into question plan; gated and rate limited | Explore Build with AI |
| `/api/discovery` | Search/course search, enroll/save YouTube resource, curation feedback and playlist retrieval | Explore/playlist/YouTube fallback |
| `/api/advanced-ai` | Usage, insight generation and ask; feature gated | Advanced AI assistant |
| `/api/notifications` | List/read/read-all/preferences/push key/subscription/test push; unsubscribe flows | Navbar, Notifications, Settings and admin personal notifications |
| `/api/consent` | Policy versions, legal acceptance/status, cookie preferences, Google profile completion/skip, marketing consent | Consent gate/settings/cookie manager |
| `/api/achievements` | Learner achievement summary and preferences | Home/Profile/Settings |
| `/api/legal` | Public policy documents; admin draft/update/publish/unpublish/archive/history | Legal page/Admin Legal |
| `/api/public` | Public social link settings | Footer/social links |
| `/api/me` | Learning pace/goal update | Settings |
| `/api/admin` | RBAC-gated overview, users, PII/export, feature overrides, course lifecycle/roadmaps/curriculum, plans/billing/deliveries/content moderation/roles/invitations/settings/prompts/operations | Admin workspace |
| `/api/admin/pricing` | Generated pricing policy, course pricing, rules, preview/apply/history/rollback | Admin Pricing Studio |
| `/api/admin/trials` | Trial eligibility preview, grants and grant list | Admin Trial Campaigns |
| `/api/admin/saved-views` | CRUD for admin saved views | Users/Audit/data tables |
| `/api/health` | Health and readiness | CI/deployment monitoring |
| `/api/webhooks/razorpay` | Payment-provider webhook event handling | Payment/subscription lifecycle |

**Server security check:** the backend is the source of truth for authorization. UI visibility alone is not security. For every admin write route, verify named permission middleware, input schema/limits, reason/confirmation requirements for sensitive operations, audit persistence, and denial tests.

## 7. Existing automated test inventory and gaps

### 7.1 Frontend/browser tests already present

- `tests/courseNav.test.cjs`: route canonicalization, course navigation state combinations, malformed lesson-ID fallback, course-card and My Learning source invariants, timestamped-note helpers and course-page source checks.
- `tests/navigation.e2e.spec.ts`: production-preview browser navigation smoke tests.
- `tests/admin-access.e2e.spec.ts`: representative admin route/access behavior.
- CI installs Playwright and Chromium and starts the production preview before the smoke tests.

**Known gap:** these do not constitute a control-by-control E2E suite for user and admin workflows. Add tests by workflow and high-risk control instead of only asserting that pages/routes render.

### 7.2 Backend test suites of particular relevance

Existing test files include (not limited to):

- Auth/admin access: `adminAuthMiddleware.test.js`, `adminMiddleware.test.js`, `adminRbac.test.js`, `adminRouteAuthorization.test.js`, `adminLegacyRouteAuthorization.test.js`, `adminRoutePermissionCoverage.test.js`, `adminRolesController.test.js`.
- Admin data governance: `adminAccountSafety.test.js`, `adminPiiReveal.test.js`, `adminUserStatusAudit.test.js`, `adminSettingReason.test.js`, `adminInvitationMongo.integration.test.js`, `adminSavedViews.test.js`.
- Course/content: `courseAdminValidation.test.js`, `coursePublishing.test.js`, `courseReadiness.test.js`, `courseLessonValidation.test.js`, `coursePreview.test.js`, `contentQuality.test.js`, `coursePricing.test.js`.
- Money and subscription state: `razorpay.test.js`, `paymentVerification.test.js`, `paymentWebhookTransitions.test.js`, `subscriptionWebhookTransitions.test.js`, `subscriptionWebhookConcurrency.test.js`, `subscriptionPlanAdminValidation.test.js`, `refundBalance.service.test.js`, `paymentSubscriptionCheckoutGuard.test.js`.
- Notifications/consent: `notificationController.test.js`, `notificationPreferences.test.js`, `notificationDeliveryOutcomes.test.js`, `announcementScheduling.test.js`, `consentValidation.test.js`, `webPush.service.test.js`.
- AI, curation, quota and rollout: `intent.service.test.js`, `asyncRoadmap.service.test.js`, `buildWithAIV2.phase0.test.js`, `buildWithAIV2.phase3.test.js`, `courseCurationDecisionEngine.test.js`, `quota.phase1.test.js`, `youtubeCompliance.test.js`, `courseYouTubeCompliance.test.js`.
- Operational safety/configuration: `productionConfigValidation.test.js`, `jobHeartbeat.test.js`, `webhookEventClaims.test.js`, `operationalAlertController.test.js`, `corsPolicy.test.js`, `safeHtml.test.js`.

Presence of a test file is not proof of passing coverage or that all UI entrypoints are represented. Inspect assertions and current CI result for each release commit.

## 8. Control-level acceptance contract

Every interactive element must have an entry in the working control register with these fields:

| Field | Required content |
|---|---|
| Control ID | Stable key such as `LEARN-COURSE-DETAILS-REVIEW-SUBMIT` or `ADMIN-PRICING-APPLY` |
| Route/component | Exact route and source component |
| Element and label | Visible text or accessible name; icon-only buttons must have an accessible name |
| Type/event | Link, submit button, click, change, keyboard, toggle, row action, modal, file upload, etc. |
| Preconditions | Auth, role, permission, entitlement, valid form, plan/payment state |
| Handler/state | Handler name and state fields changed |
| API/data effect | Method/path, side effect, provider integration or no persistence |
| Pending behavior | Loading indicator, disabled behavior and duplicate-submit guard |
| Success result | Updated UI/navigation and durable server result |
| Failure result | Inline error/alert/toast, safe state rollback and retry |
| Accessibility | Label, keyboard, focus, announcement, contrast and target size |
| Tests | Unit, API/integration, authorization, browser test identifiers |
| Release evidence | CI URL, browser screenshot/video, staging run ID, date and reviewer |
| Status | Not reviewed / source reviewed / automated pass / browser pass / staging pass / blocked |

**Rules:**
- Never mark a control as verified because its handler exists.
- A click handler that only changes local state is not a persisted save unless the element is explicitly a demo.
- Every mutation is checked for duplicate submission, stale data, API failure and retry semantics.
- Every icon-only button has an accessible name and visible focus.
- Every modal/drawer has Escape/backdrop policy, keyboard focus containment and focus return.
- Every filter can be reset, and page number/selection/saved view state is coherent when filters change.
- Every destructive/financial/privacy action has permission checks and appropriate confirmation/reason.
- Empty states must not hide load failures; errors must not appear as empty success.
- Use real course/user/lesson identifiers in tests; include missing/null/legacy values.
- Avoid logging secrets, tokens, raw PII, free-text prompts, review content or payment credentials.

## 9. Planned validation matrix

### 9.1 Learner end-to-end journey

1. Visitor opens Home/About/FAQ/Legal; all global links resolve and layout works at desktop and mobile.
2. Register, verify email, sign in by password; validate malformed fields, expired OTP, resend throttling and network failure.
3. Google sign in on configured staging origin; verify popup, callback, consent gate and return destination.
4. Explore: search; combine level/category filters; clear one/all; test zero result; open Build with AI; answer questions; skip/change answer; cancel; generate; handle quota/provider error.
5. Course detail: preview, curriculum expand/collapse, reviews list/write/update/delete where allowed, notes, roadmap, share; test new/unpublished/course-missing states.
6. Enrollment/payment: free enrollment and paid checkout; duplicate click, cancelled checkout, failed verification and refresh after success.
7. My Learning: confirm persisted status in all three tabs; opening a course changes not-started to in-progress; completing one lesson stays in-progress; completing all trackable lessons becomes completed; add curriculum lesson after completion and verify status reconciliation; verify only the batched enrollment/progress snapshot is used on page entry.
8. Course Player: open course with no lesson ID, navigate prev/next, complete; quiz/practice-quiz generate/submit/reattempt; save/edit/delete timestamped notes; feedback; provider timeout; learner access denied; course completion state.
9. Saved courses and roadmaps: save/unsave/undo; create/open/delete roadmap; absent record and stale course handling.
10. Settings/consent/notifications: change and persist every preference group; push unsupported/granted/denied states; cookie settings reopen from footer; mark one/all notification read and revisit.
11. Billing: status/search/filter/export payments; request eligible/ineligible refund; report issue; cancel eligible subscription; handle provider webhook delay and refresh.
12. Recovery: expired session, 403, 404, 429, offline, server 5xx, empty account, missing image, missing curriculum and no reviews.

### 9.2 Admin role/action journey

1. For every current admin profile, visit every `/admin/*` route: expect allowed render, or expected restricted-state with no leaking data.
2. Run command palette, quick actions, collapse/expand, mobile drawer, theme and sign out by mouse and keyboard.
3. Users: filters + pagination + saved view + selection + export; PII reveal with/without permission and reason; disable/reactivate; feature override expiry; grant/revoke course; ensure audit log records each write.
4. Courses: update metadata, module, lesson, video, resource, roadmap; test publish/readiness fail, archive/restore, revisions/rollback and stale edit.
5. Plans/coupons/pricing/trials: boundary values, plan in use, duplicate coupon, bulk count limit, filtered audience preview, zero eligible recipients, retry grant, pricing dry-run then apply and rollback.
6. Billing: refunds and issues across each allowed status transition; reconciliation provider reference/reason; duplicate action/idempotency; currency totals.
7. Communications/deliveries: test template preview/test send; audience count/list accuracy, suppression, consent, channel failures; send confirmation/reason; failed delivery retry/backoff and duplicate prevention.
8. Governance: settings update/delete, role change, invitation create/revoke, legal publish/archive/history, prompt version activation/rollback, support transition/reason and PII redaction.
9. Operations: failing health/readiness, webhook/outbox failures, alert acknowledgment and delivery retry; verify trace/correlation IDs and secret redaction.

### 9.3 Responsive, accessibility and performance

Test viewports of 360, 390, 768, 1024 and 1440 CSS pixels, plus browser zoom/reflow. At each route:
- no unintended page-level horizontal overflow; intentional internal table/list scroll remains operable;
- visible keyboard focus, logical tab order, no keyboard trap outside dialogs, accurate accessible names/state;
- heading hierarchy, form labels, errors tied to fields, status changes announced;
- adequate contrast across light/dark themes; reduced motion and sticky header layering;
- all tap targets practical on touch; no hover-only information/actions;
- slow/failed API states retain usable layout; no overlapping skeletons, duplicate alerts or layout shifts;
- no uncaught runtime error, unhandled promise rejection or broken route after user action;
- profile real-world performance with Chrome Performance/Network and deployment metrics instead of assuming that absence of console errors means performance is good.

## 10. Deployment-readiness gates

### Gate A — Code and CI
- [ ] Latest `main` CI is green; link exact run/commit.
- [ ] Frontend typecheck, build, unit tests and relevant Playwright scenarios pass.
- [ ] Backend tests and server syntax check pass.
- [ ] ESLint debt reviewed; remove advisory-only treatment or document an approved exception list.
- [ ] Dependency, secret-scanning and package audit reviewed with relevant vulnerabilities triaged.
- [ ] Migration/backfill scripts are idempotent and tested against representative existing data.

### Gate B — Environment and infrastructure
- [ ] `.env.example` documents variable names (never values); production secrets are held in platform secret storage.
- [ ] CORS/origin allowlist, OAuth origins/callbacks, cookie/session policy and HTTPS are verified for production domains.
- [ ] MongoDB indexes and migrations are reviewed, including duplicate-index warnings seen during local runs.
- [ ] Redis/cache outage mode, job worker, webhook worker/outbox and scheduled maintenance are tested.
- [ ] Health and readiness checks distinguish API live vs dependencies ready.
- [ ] Logging includes safe correlation IDs, redacts credentials/PII and has retention/alerting.
- [ ] Backups/restore, rate limits, quota limits and operational rollback are documented.

### Gate C — External provider staging tests
- [ ] Google Identity Services OAuth login/consent/return flow, including production COOP/headers.
- [ ] YouTube Data API quota and internal quota guard match the active Google Cloud quota configuration; degraded-mode UX and cached results are tested.
- [ ] Gemini/OpenAI request limits, timeout, structured output validation, fallback, content moderation and provider outage are tested.
- [ ] Razorpay order creation, signature verification, webhook signature, duplicate webhook/idempotency, cancellation, refunds and reconciliation are tested in staging.
- [ ] SMTP send, bounce/failure/retry and unsubscribe/preferences are tested.
- [ ] Web Push VAPID, permission handling, subscription renewal, delivery outcomes and worker availability are tested on HTTPS.
- [ ] AI roadmap/quiz async jobs, polling/events, retries, dead-letter and rollback flags are tested.

### Gate D — Product acceptance
- [ ] All route and control inventories have an owner/status and corresponding evidence.
- [ ] P0/P1 issues closed or explicitly signed off with mitigation.
- [ ] Admin permissions tested by role matrix at API and UI levels.
- [ ] Accessibility and responsive pass completed for core learner and admin paths.
- [ ] Analytics event coverage compared with the canonical event catalog; privacy/consent reviewed.
- [ ] Support runbook, incident response, rollback and release notes are ready.
- [ ] Final staging sign-off records browser, account role (not credentials), environment build SHA, test timestamp and evidence links.

## 11. Initial findings and immediate priorities

| ID | Priority | Evidence / issue | Next action | Verification |
|---|---|---|---|---|
| `INV-001` | P1 | `USER_FLOW_AND_ELEMENT_MAP.md` and the route inventory in older `UI_UX_AUDIT.md` do not list every current public route and newer admin routes from `src/App.tsx`. | Treat this inventory/App.tsx as runtime truth; reconcile canonical navigation and page specs. | Compare route table to App.tsx and exercise every entry/redirect. |
| `INV-002` | P1 | CI workflow marks frontend lint advisory with `continue-on-error: true`. | Triage existing violations and phase lint into a blocking gate. | CI fails on intentional lint regression; existing debt has an explicit baseline. |
| `INV-003` | P1 | Playwright currently covers navigation/admin access smoke paths, not every visible button or end-to-end task listed in this report. | Add scenario-based tests for high-impact learner flows and representative admin mutations. | Tests verify outcomes/API calls, not just presence of text. |
| `INV-004` | P1 | Production-only provider integrations are outside the standard local-Mongo CI test. | Build a staging test checklist and safe sandbox account setup for OAuth, YouTube/Gemini, Razorpay, SMTP and push. | Attach staging results, environment SHA and correlation IDs. |
| `INV-005` | P1 | Admin mutations involve money, PII, access, bulk messaging, pricing and legal content. UI inspection alone cannot prove API enforcement. | Complete a control-to-permission-to-audit matrix for every mutation. | Authorization tests prove denial before mutation and audit persistence on success. |
| `INV-006` | P1 | Current UI/source inventory has no single reusable control-level register containing handler, API, failure state and test evidence fields. | Use Section 8 as the required schema and build out the control register route by route. | Every event-bearing file/control cluster has a stable ID and test status. |
| `INV-007` | P1 | The latest My Learning implementation uses persisted `learningStatus` and a batched enrollment/progress snapshot instead of per-course preloader requests. This code path passed CI at the reviewed checkpoint; browser Network verification is still needed. | Test existing data backfill and one-lesson/all-lesson transitions in a signed-in browser. | Verify three tabs, status transitions, no per-course progress requests, and legacy records. |
| `INV-008` | P2 | Responsive/keyboard/focus/contrast/performance checks are not established by source review. | Capture desktop/mobile screen recordings/screenshots and run keyboard/assistive-technology pass. | Link evidence for route and viewport; log reproducible findings. |
| `INV-009` | P2 | Shared confirmation/filter/table/drawer components are used across high-density admin workflows. | Add shared component interaction tests before page-by-page refinements. | Keyboard/focus, select all, sorting, clear filters, drawer previous/next, confirm/reason validation. |
| `INV-010` | P2 | Learning and admin action analytics are defined by product guidance, but runtime coverage has not been proven for every listed event. | Compare event catalog against actual analytics calls and add non-PII tests. | Verify events on success/failure without leaking free-text or PII. |

## 12. Execution sequence and report maintenance

### Phase 1 — Inventory and controls
- [x] Extract live route map and list public, learner and admin surfaces.
- [x] Identify shared shell, shared cards, menus, consent, table/filter/drawer/confirmation primitives.
- [x] Map primary control groups to handlers and API families.
- [x] Record CI/test surfaces and release gates.
- [ ] Create the complete control-level register with stable IDs for each event-bearing control.
- [ ] Map each admin mutation to permission, reason, confirmation, audit event and regression test.

### Phase 2 — Verify behavior and capture evidence
- [ ] Run current CI and store exact passing run URL/SHA.
- [ ] Execute learner journey smoke tests in browser.
- [ ] Execute admin route/permission matrix and all high-risk mutations in staging.
- [ ] Capture each route's loading/empty/error/success state at desktop and mobile widths.
- [ ] Verify keyboard, focus, screen reader labels and contrast.

### Phase 3 — Fix/refine
- [ ] Prioritize reproducible P0/P1 issues and shared root causes.
- [ ] Add regression tests before or alongside each fix.
- [ ] Update control register, source code, tests and release evidence together.
- [ ] Prefer small batches and run related tests after each batch.

### Phase 4 — Deployment validation
- [ ] Run production-config validation and dependency/secret checks.
- [ ] Validate provider credentials and callback/allowlist settings in staging.
- [ ] Validate migrations/indexes/cache/worker/webhook/monitoring/backup/rollback.
- [ ] Perform final production-build smoke and sign-off.

### Report maintenance rules
- Update this report when adding/removing a route, interactive control, action handler, API capability or permission.
- Record issue ID, source file and line, reproduction, expected behavior, severity, fix commit, tests and browser evidence.
- Never use “fully tested” unless the exact environment, role, build SHA and evidence are recorded.
- If a feature is behind a flag, state default/current flag configuration and test both enabled and disabled behavior.
- Keep PII, credentials, tokens and raw user/provider data out of this report.

## 13. Source files used for this baseline

- Routing/layout: `src/App.tsx`, `src/components/Navbar.tsx`, `src/components/Footer.tsx`, `src/pages/admin/AdminLayout.tsx`.
- Learner pages: `src/pages/Home.tsx`, `Courses.tsx`, `CourseDetails.tsx`, `CoursePlayer.tsx`, `CourseRoadmap.tsx`, `MyCourses.tsx`, `SavedCourses.tsx`, `SavedRoadmap.tsx`, `PlaylistCourse.tsx`, `Pricing.tsx`, `Billing.tsx`, `Profile.tsx`, `Settings.tsx`, `Notifications.tsx`, plus public/auth pages.
- Shared components: `CourseCard.tsx`, `CommandPalette.tsx`, `NotificationMenu.tsx`, `CookieConsentManager.tsx`, `AccountConsentGate.tsx`, `PushNotificationPrompt.tsx`, `FeatureUpgradeModal.tsx`, `AdvancedAIAssistant.tsx`, `YouTubeSearchFallback.tsx`, `AppErrorBoundary.tsx`, `EmptyState.tsx`, `ErrorState.tsx`.
- Admin pages: `AdminControlCenter.tsx`, `AdminAnalytics.tsx`, `AdminUsersPro.tsx`, `AdminCoursesPro.tsx`, `AdminContentQuality.tsx`, `AdminRoadmaps.tsx`, `AdminPlans.tsx`, `AdminTrialCampaigns.tsx`, `AdminPricingStudio.tsx`, `AdminBilling.tsx`, `AdminSubscriptions.tsx`, `AdminCommunications.tsx`, `AdminDeliveries.tsx`, `AdminNotifications.tsx`, `AdminCoupons.tsx`, `AdminSettings.tsx`, `AdminLegalDocuments.tsx`, `AdminDesignSystem.tsx`, `AdminAudit.tsx`, `AdminRoles.tsx`, `AdminAIContent.tsx`, `AIPromptVersionsPanel.tsx`, `AdminSupport.tsx`, `AdminOperations.tsx`, `CourseBuilder.tsx`, `AdminInvitationManager.tsx`.
- Shared admin primitives: `src/components/admin/AdminUI.tsx`, `DataTable.tsx`, `FilterBar.tsx`, `DetailDrawer.tsx`, `TypedConfirmDialog.tsx`, `SavedViews.tsx`, `StatusBadge.tsx`, `MoneyCell.tsx`, `PiiCell.tsx`.
- Server route map: `server/src/server.js`, `server/src/routes/*`, `server/src/controllers/*`, `server/src/middleware/*`, `server/src/services/*`.
- Test and release config: `tests/*.test.cjs`, `tests/*.spec.ts`, `server/test/*`, `server/src/**/*.test.js`, `.github/workflows/ci.yml`, root and `server/package.json`.

---

**Next working unit:** complete the event-by-event register for the global shell and Explore/course-detail/player flows first, then the admin shell and high-risk mutation workflows. That creates the shared control and test pattern before expanding to lower-risk pages.

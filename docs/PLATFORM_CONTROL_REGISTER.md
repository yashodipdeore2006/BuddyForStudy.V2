# BuddyForStudy — UI/UX Control Register

**Baseline:** 2026-10-25  
**Branch:** main  
**Parent audit:** [Platform UI/UX Functional Inventory](PLATFORM_UI_UX_FUNCTIONAL_INVENTORY.md)  
**Historical findings:** [UI/UX Audit](UI_UX_AUDIT.md)

> A source handler is not proof that a feature passes. Status in this register reflects the strongest evidence recorded, not an assumption based on code existing.

## Evidence statuses

- **Inventory only:** source responsibility identified; no dedicated outcome test recorded.
- **Test added — CI pending:** automated test is committed; wait for the current run.
- **Automated pass:** named test passed on a recorded commit; this does not prove live provider or complete visual behavior.
- **Browser verified:** exercised in a browser with reproducible evidence.
- **Staging verified:** deployed environment/provider verified with build SHA and test record.
- **Blocked:** a dependency, credential, account role or fixture prevents verification.

## Required fields for each control

Keep a stable ID, route/component, visible and accessible label, event/handler, preconditions, API or side effect, pending/success/failure behavior, accessibility expectation, test ID, evidence link and status. If a control only changes local state, say so explicitly.

## 1. Global learner shell

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| NAV-SEARCH-001 | Navbar / command palette: search icon or Ctrl/Cmd+K | Opens and focuses search; results work by keyboard and mouse; close returns focus; destinations are valid | Inventory only |
| NAV-NOTIFICATIONS-001 | Notification menu: open, mark read, click notification | Read state syncs with the API; invalid/external destinations are rejected; menu closes coherently | Inventory only |
| NAV-ACCOUNT-MENU-001 | Avatar account menu | Exposes profile/settings/help/theme/sign-out according to role; menu closes after selection | Inventory only |
| NAV-THEME-001 | Light/Dark/System theme control | Immediate theme change, persistent preference and correct system mode behavior | Inventory only |
| NAV-SIGNOUT-001 | Sign out | Clears local credentials even when server logout fails; protected routes respond to the cleared session | Inventory only |
| NAV-SIGNOUT-FAILURE-001 | Sign out when the logout API fails | Attempts server logout, clears local token regardless of 503, navigates to the public landing route and exposes signed-out navigation | Automated pass on `7f27ecb25d5edeb88b6354784ede64b489fa5045`; [CI run #40185807422](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185807422) |
| CONSENT-COOKIE-001 | Cookie manager: reject, customize, accept all, reopen settings | Choice persists and syncs; optional services respect consent; footer/settings entry reopens the dialog | Existing consent E2E tests |
| CONSENT-PUSH-001 | Push prompt: enable, dismiss, recheck permission | Native browser permission only after explicit opt-in; unsupported/denied states have recovery guidance | Existing push E2E tests |
| NAV-FOOTER-001 | Footer: public links and cookie settings | Internal links resolve; cookie settings opens consent manager; mobile layout has no page overflow | Existing footer E2E tests |

## 2. Explore and discovery

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| EXP-SEARCH-001 | Explore / search field and Search submit | Trims submitted query, sends q, shows query-specific results and distinguishes empty results from failure | Automated pass on commit `883ef448`; [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048) |
| EXP-LEVEL-001 | Explore / level selector | Level is reflected in request and result set; reset state remains visible | Included in [EXP-SEARCH-001] |
| EXP-CATEGORY-001 | Explore / category selector | Category is reflected in request and does not overwrite query | Included in [EXP-SEARCH-001] |
| EXP-CLEAR-001 | Explore / Clear filters | Clears q, level and category, resets controls and restores unfiltered catalog | Included in [EXP-SEARCH-001] |
| EXP-BUILD-AI-001 | Explore / Build with AI | Opens the intended flow with the topic; duplicate generation is guarded; quota/provider errors are recoverable | Inventory only |
| EXP-INTENT-001 | Build with AI / choose, type, skip, change, next | Current answer/step stay synchronized; field constraints and cancel/reset behavior are clear | Inventory only |
| CARD-PRIMARY-001 | Shared CourseCard / Enroll free, Start, Continue, Review | Destination reflects enrollment/progress state; IDs are valid; no false direct enrollment from a catalog card | Existing navigation E2E and route unit tests |
| CARD-SAVE-001 | Shared CourseCard / Save or Remove from saved | Pending guard and pressed state are accurate; failure is visible; undo is available where supported | Inventory only |
| CARD-SHARE-001 | Shared CourseCard / Share | Native share or clipboard fallback reports success/failure without hijacking other card controls | Inventory only |

## 3. Course details and reviews

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| DETAIL-TABS-001 | Course Details / Overview, Curriculum, Ratings & Reviews, Notes, About | Active tab and content panel match; URL state is preserved where implemented; focus is visible | Inventory only |
| DETAIL-REVIEWS-001 | Ratings & Reviews / empty state and Refresh reviews | Empty data is explicit; refresh requests reviews again and preserves the correct empty state | Automated pass on commit `883ef448`; [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048) |
| DETAIL-RATING-001 | Review form / select rating star | Accessible star labels and pressed state; score updates after selection | Inventory only |
| DETAIL-REVIEW-SUBMIT-001 | Review form / submit or update review | Eligible enrolled learner can submit rating/comment; payload and success state are verified; update/failure cases remain open | Automated pass on `6a3ff555a914e5b8ce8c37b865680a12c1a647ac`; [CI run #40172832880](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172832880) |
| DETAIL-REVIEW-FAILURE-001 | Review submit when API fails | Error is announced, comment/rating remain intact and retry remains available | Automated pass on `66bf73e3cd02c6d2714acf6c29a102adfb8676f7`; [CI run #40173675839](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173675839) |
| DETAIL-START-001 | Start, Continue or Review course | Resolves first incomplete lesson or review destination; invalid optional lesson ID cannot crash the card | Existing course-navigation tests |
| DETAIL-ROADMAP-001 | Journey Roadmap link | Uses canonical route and handles missing curriculum/roadmap safely | Existing roadmap E2E tests |
| DETAIL-PURCHASE-001 | Plan choice, enroll, checkout | Correct plan chosen; payment signature/order verified; duplicate action safe; pending and failure states recoverable | Backend payment tests exist; staging pending |
| DETAIL-PURCHASE-ORDER-FAILURE-001 | Paid course order API returns 503 | Error is announced; checkout action recovers and can retry without losing the selected option | E2E passed; [CI run #40175128836](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40175128836) |

## 4. My Learning

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| LEARN-TABS-001 | In progress / Not started / Completed | Uses persisted learningStatus in the batched GET /api/enrollments response; counts and cards align; no per-course progress GET fan-out | Automated pass on commit `883ef448`; [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048) |
| LEARN-CONTINUE-001 | Continue course link | Uses nextLessonId from the batch; missing/malformed optional lesson ID falls back to player root and never crashes render | Included in [LEARN-TABS-001]; route unit tests exist |
| LEARN-SEARCH-001 | Search your courses | Searches the loaded snapshot; empty result has a clear reset action and causes no new progress requests | Inventory only |
| LEARN-SORT-001 | Recently active / Progress / A to Z | Changes order only, not enrollment membership or status | Inventory only |
| LEARN-SAVE-001 | Save/remove saved course | API result and icon pressed state remain synchronized; failures are announced | Inventory only |
| LEARN-SAVE-FAILURE-001 | Save course when API returns 503 | Reverts optimistic state, announces server error and leaves control enabled for retry | Automated pass on `bb8463a9687410abe69821a26ba52c9e98398b57`; [CI run #40173299948](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173299948) |
| LEARN-UNENROLL-001 | Overflow → Unenroll → confirm/cancel | Course is identified; cancel has no side effect; remove only after success; duplicate submission guarded | Automated pass on `6a3ff555a914e5b8ce8c37b865680a12c1a647ac`; [CI run #40172832880](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172832880) |
| LEARN-UNDO-001 | Undo unenroll toast | Restores enrollment only after API success; failure shows a recovery message | Automated pass on `6a3ff555a914e5b8ce8c37b865680a12c1a647ac`; [CI run #40172832880](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172832880) |
| LEARN-SHARE-001 | Share course | Native share/clipboard fallback reports result in a status region | Inventory only |
| LEARN-ROADMAP-001 | Overflow → Roadmap | Available when there is a curriculum; opens the canonical roadmap route | Inventory only |
| LEARN-COURSE-INFO-001 | Overflow → Course info | Opens details for exactly the selected course | Inventory only |

### Learning status acceptance rule

- **Not started:** no lessons completed and the learner has not entered the lesson player.
- **In progress:** the learner has entered the player or completed a lesson, but the current trackable curriculum is not fully complete.
- **Completed:** every current trackable lesson is complete.
- The status is persisted on enrollment and returned in a batched enrollment response. My Learning must not fetch each course's progress separately on every visit.
- If curriculum content changes, reconcile stale stored status against the current progress. Browser tests must cover legacy enrollments and adding a lesson after completion.

## 5. Course Player

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| PLAYER-COMPLETE-001 | Mark complete | One POST to the lesson completion endpoint; progress updates; button becomes disabled Completed; duplicate write prevented | Automated pass on commit `883ef448`; [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048) |
| PLAYER-LESSON-NAV-001 | Previous/Next/sidebar lesson selection | Uses curriculum order and canonical routes; invalid lesson ID has a safe fallback | Automated pass on `841281740a1b5b97936d01b7392d5bc70a29e412`; [CI run #40173489346](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173489346) (two-lesson Prev/Next route test) |
| PLAYER-QUIZ-001 | Generate/retry quiz | Pending state guards duplicate attempts; empty/provider failure has recovery | Backend AI tests exist; browser test pending |
| PLAYER-PRACTICE-QUIZ-001 | Answer, check and reattempt practice quiz | Requires an answer per question; submitted state and score/explanation are clear | Browser test pending |
| PLAYER-PRACTICE-QUIZ-FAILURE-001 | Generate practice quiz when provider/API fails | Announces failure and keeps a retry path available; retry issues a new request | Automated pass on `841281740a1b5b97936d01b7392d5bc70a29e412`; [CI run #40173489346](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173489346) |
| PLAYER-NOTE-SAVE-001 | Timestamp, text, formatting, save/clear note | Invalid timestamp or blank note blocked; success visible; storage errors surfaced | Automated pass on `bb8463a9687410abe69821a26ba52c9e98398b57`; [CI run #40173299948](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173299948) |
| PLAYER-NOTE-DELETE-001 | Delete note or jump to timestamp | Only selected note removed; jump opens correct lesson/second and is keyboard operable | Same-lesson delete/persistence and filter/sort automated; cross-lesson jump pending; [CI run #40173299948](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173299948) |
| PLAYER-NOTE-DELETE-001 | Delete note or jump to timestamp | Only selected note removed; jump opens correct lesson/second and is keyboard operable | Browser test pending |
| PLAYER-RESOURCE-FEEDBACK-001 | Helpful/Outdated/Wrong level | Correct resource payload, duplicate guard, feedback failure never blocks progress | Inventory only |
| PLAYER-ACCESS-001 | Direct URL or expired entitlement | Safe access-denied/recovery screen and return route; backend remains final authorization boundary | Protected-route E2E exists; entitlement scenario pending |

## 6. Admin shell and high-risk actions

| ID | Component / control | Expected behavior | Status |
|---|---|---|---|
| ADM-SHELL-SEARCH-001 | Admin Layout / Ctrl/Cmd+K, search, choose page | Opens and focuses palette; only permitted search results; selected Audit log destination renders | Automated pass on commit `883ef448`; [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048) |
| ADM-COMMAND-PERMISSION-001 | Admin command palette search | Search results exclude routes the current role cannot access | Automated pass on `bb8463a9687410abe69821a26ba52c9e98398b57`; [CI run #40173299948](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173299948) |
| ADM-SHELL-ROLE-NAV-001 | Admin navigation and direct URLs | Links are permission-filtered; direct access denied; protected data/actions remain hidden | Existing admin-access E2E tests |
| ADM-SHELL-MOBILE-001 | Mobile admin navigation | Drawer/overlay closes correctly; focus and scroll are managed; current item is clear | Inventory only |
| ADM-USER-PII-001 | Reveal/export PII | Permission/reason checked server-side; masking default; audit event recorded; invalid request never reaches mutation | Backend PII/auth tests exist; browser test pending |
| ADM-PII-REVEAL-001 | Reveal and re-mask a learner email | Masked by default; reveal needs PII permission and a 10–500 character reason; request sends the reason; returned value can be masked again | Automated pass; [CI run #40183419386](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40183419386) |
| ADM-PII-EXPORT-001 | Export selected users to CSV | Requires a reason and exact EXPORT N USERS phrase; sends selected IDs and sorting; downloads CSV with formula-like values prefixed safely | Automated pass; [CI run #40183668430](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40183668430) |
| ADM-USER-STATUS-001 | Disable/reactivate user | Valid transitions, reason, audit event and refreshed state | Disable/retry and reactivate UI flows have browser tests; server audit persistence remains a backend/staging concern |
| ADM-USER-STATUS-FAILURE-001 | Disable user API returns 503 | Reason remains in the confirmation dialog, no optimistic disable occurs, error is announced, and retry can complete the change | Automated pass; [CI run #40184125922](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40184125922) |
| ADM-USER-REACTIVATE-001 | Re-enable a disabled account | Requires an audit reason, sends `isActive: true`, closes confirmation on success and refreshes the row to Disable | Automated pass on `938d233afc767d2d0aa8aaaff244b6657617e879`; [CI run #40185351855](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185351855) |
| ADM-COURSE-PUBLISH-001 | Readiness then publish | Readiness and publish permission enforced; failure explained; state refreshed | Course readiness/publishing tests exist; browser test pending |
| ADM-COURSE-PUBLISH-READINESS-001 | Attempt publish when readiness fails | Checklist explains blockers; publish endpoint is not called and published state stays false | E2E passed; [CI run #40175128836](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40175128836) |
| ADM-COURSE-DELETE-001 | Soft-delete/restore course | Confirmation/reason, safe lifecycle and audit/revision trail | Backend validation tests exist; browser test pending |
| ADM-PRICING-APPLY-FAILURE-001 | Pricing apply API returns 503 after preview | No price changes before preview; the preview and operator reason remain available after the failure, and the same preview can be retried | E2E passed; [CI run #40182316415](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40182316415) |
| ADM-PRICING-APPLY-001 | Preview/apply pricing and rollback | Preview bound to selected batch/version; reason required; price/sale/currency invariants enforced | Backend pricing tests exist; browser test pending |
| ADM-TRIAL-GRANT-PREVIEW-001 | Preview and confirm filtered trial audience | Preview reports the full eligible count above 200; filters and exclusion totals remain visible; grant requires explicit confirmation, carries an idempotency key and states no autopay | E2E passed; [CI run #40176135648](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40176135648) |
| ADM-TRIAL-GRANT-001 | Preview audience and grant free trial | Eligibility/exclusion count, permission, reason and idempotency revalidated; no misleading arbitrary recipient cap | Backend validation tests exist; browser test pending |
| ADM-BILLING-REFUND-001 | Process/reconcile refund | Valid transition, provider identifier, currency/balance and reason/audit are consistent | Backend payment tests exist; staging provider pending |
| ADM-BILLING-REFUND-FAILURE-001 | Finance operator receives 503 while approving refund | Short reason is rejected before mutation; API failure preserves typed confirmation and reason and allows retry | E2E passed; [CI run #40175485965](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40175485965) |
| ADM-BILLING-REFUND-PERMISSION-001 | Billing reader views a pending refund | Read-only role can inspect the request but cannot see approve/reject controls or send a refund mutation | E2E passed; [CI run #40175201786](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40175201786) |
| ADM-COMMUNICATION-SEND-FAILURE-001 | Notification queue returns 503 after audience preview | Send payload is bound to the preview token; error is announced while message/reason and confirmation remain available for retry | E2E passed; [CI run #40182316415](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40182316415) |
| ADM-COMMS-SEND-001 | Preview audience then send | Consent/suppression respected; reason audited; duplicate send guarded; channel outcomes reported | Backend communication tests exist; browser/staging pending |
| ADM-DELIVERY-RETRY-001 | Retry failed channel delivery | Only eligible channel retried; reason/permission enforced; attempts/backoff visible | Backend delivery tests exist; browser test pending |
| ADM-DELIVERY-RETRY-FAILURE-001 | Delivery retry endpoint returns 503 | A retryable failure is announced and the required reason/confirmation remain intact so the operator can retry | E2E passed; [CI run #40175773311](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40175773311) |
| ADM-ROLE-CHANGE-001 | Change administrator role | Permission/reason enforced; unsafe lockout prevented; role refreshed; audit visible | Backend role tests exist; browser test pending |
| ADM-SETTING-SAVE-001 | Update/delete platform setting | Registry/type validation, permission and reason enforced, success/error visible | Backend setting tests exist; browser test pending |
| ADM-PROMPT-ACTIVATE-001 | Activate prompt version | Limits/reason/audit validated and prior version/builtin fallback remains available | Backend prompt tests exist; browser test pending |
| ADM-SUPPORT-STATUS-001 | Assign/update/resolve support issue | Valid transition, internal/public notes separated, required reason/confirmation and audit enforced | Backend operations tests exist; browser test pending |

## 7. First browser-test batch

| Test ID | What it proves | Test file |
|---|---|---|
| EXP-SEARCH-001 | Search q, combined level/category filters, and clearing all three | [navigation.e2e.spec.ts](../tests/navigation.e2e.spec.ts) |
| LEARN-TABS-001 | Persisted status determines all tabs/CTA hrefs; no per-course progress or enrollment GET requests | [navigation.e2e.spec.ts](../tests/navigation.e2e.spec.ts) |
| PLAYER-COMPLETE-001 | Completion POST occurs once and disabled Completed state is shown | [navigation.e2e.spec.ts](../tests/navigation.e2e.spec.ts) |
| DETAIL-REVIEWS-001 | Review empty state and Refresh reviews API interaction | [navigation.e2e.spec.ts](../tests/navigation.e2e.spec.ts) |
| ADM-SHELL-SEARCH-001 | Ctrl+K opens/focuses admin palette and routes to allowed Audit log result | [admin-access.e2e.spec.ts](../tests/admin-access.e2e.spec.ts) |

These browser tests use mocked API responses. They prove frontend contracts against controlled fixtures, not production database state or external provider credentials. Do not mark them passing until CI succeeds on the commit containing the tests.

### Responsive viewport regressions

| ID | Control surface | Expected behavior | Status |
|---|---|---|---|
| RESP-LEARNER-OVERFLOW-001 | Home, Explore, course details, My Learning, course player | No document/body horizontal overflow at 360, 390, 768, 1024 or 1440 CSS px | Automated pass on commit `5b1465cb816757512e625731c8903ce9b3ae7f69`; [CI run #40184735235](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40184735235) |
| RESP-ADMIN-OVERFLOW-001 | Admin dashboard, Users, Courses | No document/body horizontal overflow at 360, 768 or 1440 CSS px | Automated pass on commit `4b98a64e061b6642b457a64d45c3e4b47569b101`; [CI run #40185035275](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185035275) |

The overflow checks verify page width only; they do not replace focus-order, contrast, zoom, or screen-reader audits.

## 8. Work queue

- [x] Create stable IDs for the first global shell, Explore, My Learning, course-details, player and admin-shell control groups.
- [x] Add browser tests for search/filter/clear, three My Learning status tabs, no per-course progress fan-out, lesson completion, review refresh, and admin command palette.
- [x] Confirm CI pass for the first control-level browser batch and fix initial selector/cache issues (run #40172529048).
- [x] Add My Learning save/unsave and unenroll cancel/confirm/undo tests; [ ] Share and API-failure rollback cases remain.
- [ ] Add course review submit/update, course purchase and payment failure browser tests.
- [ ] Add Player Prev/Next lesson navigation and practice-quiz API failure/retry tests now pass CI; quiz success/answer/score scenarios remain open. Timestamped note validation/persistence/delete/filter tests also pass CI.
- [x] Add account reactivation UI coverage and automated horizontal-overflow checks for key learner/admin screens. [ ] Remaining pricing/trial edge cases and keyboard/focus, contrast, zoom and screen-reader checks remain open. PII reveal/export and account-disable failure recovery, pricing apply/communications failure recovery, refund failure/permission, delivery retry and publish-readiness tests have passing CI evidence.
- [x] Add responsive horizontal-overflow E2E coverage for primary learner pages at 360, 390, 768, 1024 and 1440px (run #40184735235). Admin dashboard/Users/Courses viewport coverage passed in run #40185035275. [ ] Complete focus-order, contrast, zoom and screen-reader checks at representative breakpoints.
- [ ] Validate configured integrations in staging: OAuth, YouTube/Gemini quotas, payment webhooks, SMTP, push and workers.

## 9. Change log

### 2026-10-25 — Stable IDs and first browser-test batch
- Added [EXP-SEARCH-001], [LEARN-TABS-001], [PLAYER-COMPLETE-001] and [DETAIL-REVIEWS-001] to navigation.e2e.spec.ts.
- Added [ADM-SHELL-SEARCH-001] to admin-access.e2e.spec.ts.
- Extended deterministic fixtures to filter catalog results using query/level/category, return batched learning-status snapshots and simulate lesson completion responses.
- CI **passed** on commit `883ef448663e40f658b536c0046be855721440e7`: [CI run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048). Frontend typecheck/build/browser navigation smoke and backend tests/syntax/selector checks succeeded.


### 2026-10-25 — CI validation and refresh-cache correction
- **Passing CI:** commit `883ef448663e40f658b536c0046be855721440e7`, [run #40172529048](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172529048). Both frontend and backend jobs succeeded.
- **Control IDs passed:** `EXP-SEARCH-001`, `LEARN-TABS-001`, `PLAYER-COMPLETE-001`, `DETAIL-REVIEWS-001`, `ADM-SHELL-SEARCH-001`.
- **Defect fixed:** review refresh buttons now call `apiFetch(..., { cache: "no-store" })`; `src/lib/api.ts` honors this option by bypassing both the short GET response cache and in-flight request deduplication for the explicit fresh-read request.
- **Remaining scope:** the tests use deterministic API fixtures; the learner controls still need staging/data-backed verification and the admin mutation suite remains incomplete.


### 2026-10-25 — Second user-control batch passed
- **CI passed:** [CI run #40172832880](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40172832880); commit `6a3ff555a914e5b8ce8c37b865680a12c1a647ac`.
- **New automated-pass IDs:** `LEARN-SAVE-001`, `LEARN-UNENROLL-001`, `LEARN-UNDO-001`, `DETAIL-REVIEW-SUBMIT-001`.
- The My Learning tests verify Save/Unsave network mutations and button state; cancel has no enrollment mutation; confirm sends DELETE and removes the course; Undo sends POST and restores it. The review test verifies the 4-star/comment payload and success feedback.
- The browser fixtures still mock server writes; persistence across a real database-backed browser session is a staging acceptance test.


### 2026-10-25 — Negative-path and lesson-note control batch (CI passed)
- Added `LEARN-SAVE-FAILURE-001`: API 503 must revert optimistic saved state, announce the error and keep Save available for retry.
- Added `PLAYER-NOTE-SAVE-001` and extended `PLAYER-NOTE-DELETE-001`: blank/invalid timestamp validation, valid timestamped note save, browser-storage persistence across reload, deletion and note filter/sort controls.
- Added `ADM-COMMAND-PERMISSION-001`: current role must not see inaccessible Users routes in the admin command palette.
- CI passed on commit `bb8463a9687410abe69821a26ba52c9e98398b57`; [run #40173299948](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173299948) ran 57 Playwright tests successfully and both frontend/backend jobs succeeded. Tests use mocked APIs and browser-local note storage, not live provider/database validation.


### 2026-10-25 — Player navigation and quiz recovery passed
- **Commit:** `841281740a1b5b97936d01b7392d5bc70a29e412`.
- **CI:** [CI run #40173489346](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173489346) passed both frontend and backend jobs; **59 Playwright tests passed**.
- **New passing IDs:** `PLAYER-LESSON-NAV-001` (Prev/Next follows curriculum order and canonical URL) and `PLAYER-PRACTICE-QUIZ-FAILURE-001` (API 503 announced and Generate Practice Quiz can be retried).
- Remaining player scope: quiz success/answer/score, practice-quiz submit/reattempt, cross-lesson note jump and lesson/sidebar navigation edge cases.


### 2026-10-25 — Course review failure recovery passed
- **Commit:** `66bf73e3cd02c6d2714acf6c29a102adfb8676f7`.
- **CI:** [run #40173675839](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40173675839) passed frontend and backend jobs; browser suite passed.
- **New passing ID:** `DETAIL-REVIEW-FAILURE-001`: an HTTP 503 is announced, rating/comment are preserved, submit becomes available again, and retry sends a new request.
- The test uses a mocked review endpoint. Real persistence/moderation and production API failure behavior still require staging validation.


### 2026-10-25 — Pricing and communication failure recovery passed
- **Commit:** `77ee6468a4d0901ae5f0c76aa0b0258f7ec17b6f`.
- **CI:** [run #40182316415](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40182316415) passed frontend and backend jobs; the Playwright run completed successfully.
- **New passing IDs:** `ADM-PRICING-APPLY-FAILURE-001` (preview table is targeted by its Proposed column; failed apply keeps preview/reason available and supports retry) and `ADM-COMMUNICATION-SEND-FAILURE-001` (failed queue request preserves the reviewed audience and send confirmation for retry).
- These tests use mocked API responses; they do not prove live price mutations, notification worker delivery, or provider integration in staging.


### 2026-10-25 — PII reveal/re-mask control passed
- **Commit:** `6e6d7ea5010780d0789107e1eec758be2fc45bfa`.
- **CI:** [run #40183419386](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40183419386) passed frontend and backend jobs; **69 Playwright tests passed**.
- **New passing ID:** `ADM-PII-REVEAL-001`: email is masked by default; reveal requires PII permission and a valid reason; the reason is sent to the reveal endpoint; the value can be masked again by keyboard activation.
- The UI test uses a mocked reveal response; server-side authorization/audit tests and live audit persistence remain separate evidence. Export flow and CSV content are not covered by this control and remain queued.


### 2026-10-25 — PII export safeguards passed
- **Commit:** `247113e4b52aa77a4640628a3d8cd0eb6ee44756`.
- **CI:** [run #40183668430](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40183668430) passed frontend and backend jobs; **70 Playwright tests passed**.
- **New passing ID:** `ADM-PII-EXPORT-001`: export is not submitted until the reason and exact typed phrase are valid; request includes selected IDs and sort state; downloaded CSV includes a BOM and prefixes formula-like names to reduce spreadsheet formula execution risk.
- The API response is mocked. Live authorization/audit persistence and real exported production data remain staging/server-side verification items.


### 2026-10-25 — Account disable failure recovery passed
- **Commit:** `216acad21fb358bb89a98c7d53f0f8396c43ebc6`.
- **CI:** [run #40184125922](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40184125922) passed frontend and backend jobs; **71 Playwright tests passed**.
- **New passing ID:** `ADM-USER-STATUS-FAILURE-001`: a failed disable request preserves the required operator reason and confirmation, announces the server error and supports retry; success refreshes the visible state to Enable.
- The API is mocked in the browser test; the server audit record and live account access enforcement still need staging verification.


### 2026-10-25 — Learner responsive viewport smoke test passed
- **Commit:** `5b1465cb816757512e625731c8903ce9b3ae7f69`.
- **CI:** [run #40184735235](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40184735235) passed frontend and backend jobs; **72 Playwright tests passed**.
- **New passing ID:** `RESP-LEARNER-OVERFLOW-001`: checks Home, Explore, course details, My Learning and course player at 360, 390, 768, 1024 and 1440 CSS px and asserts that document/body width does not exceed the viewport.
- Admin dashboard/Users/Courses viewport check `RESP-ADMIN-OVERFLOW-001` passed on commit `4b98a64e061b6642b457a64d45c3e4b47569b101`; [CI run #40185035275](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185035275) passed both jobs with 73 Playwright tests. The first attempt had a non-unique main locator, which was corrected before the passing run.
- These tests detect horizontal overflow only; keyboard/focus, contrast, zoom, and assistive-technology verification remain open.


### 2026-10-25 — Admin responsive viewport smoke test passed
- **Commit:** `4b98a64e061b6642b457a64d45c3e4b47569b101`.
- **CI:** [run #40185035275](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185035275) passed frontend and backend jobs; **73 Playwright tests passed**.
- **New passing ID:** `RESP-ADMIN-OVERFLOW-001`: checks the admin dashboard, Users and Courses at 360, 768 and 1440 CSS px and asserts that document/body width does not exceed the viewport.
- Together with `RESP-LEARNER-OVERFLOW-001`, this adds automated horizontal-overflow checks across major learner and admin surfaces. Keyboard/focus, contrast, zoom and assistive-technology checks remain open.


### 2026-10-25 — Account reactivation browser control passed
- **Commit:** `938d233afc767d2d0aa8aaaff244b6657617e879`.
- **CI:** [run #40185351855](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185351855) passed frontend and backend jobs; **74 Playwright tests passed**.
- **New passing ID:** `ADM-USER-REACTIVATE-001`: a disabled account can be re-enabled only after entering an audit reason; the test checks the `isActive: true` mutation payload and that the row refreshes to show Disable.
- The browser uses a mocked API; production role enforcement, audit record persistence and effect on authenticated sessions must still be verified in backend/staging checks.


### 2026-10-25 — Sign-out failure recovery passed
- **Commit:** `7f27ecb25d5edeb88b6354784ede64b489fa5045`.
- **CI:** [run #40185807422](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40185807422) passed frontend and backend jobs; **75 Playwright tests passed**.
- **New passing ID:** `NAV-SIGNOUT-FAILURE-001`: when the logout endpoint returns 503, local credentials are still cleared, the app returns to the public landing route, and the primary navigation presents Sign in.
- The E2E mocks the logout API. Real browser push-subscription cleanup, protected-route behavior across reloads, and server session revocation need staging validation.

### 2026-10-25 — Pricing page and feature upgrade modal consistency passed
- **Implementation commit:** `0791e03bfee6751b87a551cb6a731e63f8f09f35`.
- **CI:** [run #40187178516](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40187178516) passed frontend and backend jobs; **77 Playwright tests passed**.
- **New passing ID:** `PRICING-MODAL-CONSISTENCY-001`: the upgrade modal shows the complete configured feature list and all six AI usage limits for Pro and Premium, renders missing limits as “Not configured,” and labels the Free plan “forever” to match the main pricing page.
- Both views consume `/api/billing/plans`; this test uses mocked plan data and does not validate production subscription configuration or payment-provider behavior.

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
| DETAIL-START-001 | Start, Continue or Review course | Resolves first incomplete lesson or review destination; invalid optional lesson ID cannot crash the card | Existing course-navigation tests |
| DETAIL-ROADMAP-001 | Journey Roadmap link | Uses canonical route and handles missing curriculum/roadmap safely | Existing roadmap E2E tests |
| DETAIL-PURCHASE-001 | Plan choice, enroll, checkout | Correct plan chosen; payment signature/order verified; duplicate action safe; pending and failure states recoverable | Backend payment tests exist; staging pending |

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
| ADM-USER-STATUS-001 | Disable/reactivate user | Valid transitions, reason, audit event and refreshed state | Backend tests exist; browser test pending |
| ADM-COURSE-PUBLISH-001 | Readiness then publish | Readiness and publish permission enforced; failure explained; state refreshed | Course readiness/publishing tests exist; browser test pending |
| ADM-COURSE-DELETE-001 | Soft-delete/restore course | Confirmation/reason, safe lifecycle and audit/revision trail | Backend validation tests exist; browser test pending |
| ADM-PRICING-APPLY-001 | Preview/apply pricing and rollback | Preview bound to selected batch/version; reason required; price/sale/currency invariants enforced | Backend pricing tests exist; browser test pending |
| ADM-TRIAL-GRANT-001 | Preview audience and grant free trial | Eligibility/exclusion count, permission, reason and idempotency revalidated; no misleading arbitrary recipient cap | Backend validation tests exist; browser test pending |
| ADM-BILLING-REFUND-001 | Process/reconcile refund | Valid transition, provider identifier, currency/balance and reason/audit are consistent | Backend payment tests exist; staging provider pending |
| ADM-COMMS-SEND-001 | Preview audience then send | Consent/suppression respected; reason audited; duplicate send guarded; channel outcomes reported | Backend communication tests exist; browser/staging pending |
| ADM-DELIVERY-RETRY-001 | Retry failed channel delivery | Only eligible channel retried; reason/permission enforced; attempts/backoff visible | Backend delivery tests exist; browser test pending |
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

## 8. Work queue

- [x] Create stable IDs for the first global shell, Explore, My Learning, course-details, player and admin-shell control groups.
- [x] Add browser tests for search/filter/clear, three My Learning status tabs, no per-course progress fan-out, lesson completion, review refresh, and admin command palette.
- [x] Confirm CI pass for the first control-level browser batch and fix initial selector/cache issues (run #40172529048).
- [x] Add My Learning save/unsave and unenroll cancel/confirm/undo tests; [ ] Share and API-failure rollback cases remain.
- [ ] Add course review submit/update, course purchase and payment failure browser tests.
- [ ] Add Player Prev/Next lesson navigation and practice-quiz API failure/retry tests now pass CI; quiz success/answer/score scenarios remain open. Timestamped note validation/persistence/delete/filter tests also pass CI.
- [ ] Add admin UI mutation tests for PII, publish, pricing/trials, refunds, communications and delivery retry; permission-filtered command palette test now passes CI.
- [ ] Capture focus/responsive/contrast evidence at 360, 390, 768, 1024 and 1440px.
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

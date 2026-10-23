# Course Pricing Studio — Implementation Plan

## Goal
Give administrators one place to filter courses, safely apply bulk pricing changes, define reusable pricing rules, and review explainable price recommendations without bypassing existing course/payment controls.

## Current architecture findings
- Courses already store `pricing.mode` (`free` / `paid`), `pricing.price`, `pricing.compareAtPrice`, `pricing.currency`, `pricing.saleEnabled`, and `pricing.salePrice`.
- Admin course APIs are mounted under `/api/admin` and already enforce administrator authentication and per-permission RBAC.
- Existing course updates create course revisions, invalidate course cache, and record audit events.
- The admin UI is React + TypeScript with `adminFetch`, shared Admin UI components, and a permission-filtered sidebar.
- The platform supports individual paid course purchases and subscriptions. Bulk pricing must never edit payment/order history or grant/revoke enrollment access.

## Phase 1 — Course Pricing Studio (this implementation)
### A. Course selector and filters
- Add a dedicated `/admin/pricing` page and `/api/admin/pricing` API.
- Search by title/category; filter by category, level, publication state, free/paid mode, and current-price minimum/maximum.
- Support paginated result selection and an explicit “all matching” preview so the admin can see the exact count before a bulk mutation.
- Return distinct category options from the course catalogue.

### B. Bulk pricing operations
- Fixed base price; percentage increase/decrease; fixed amount increase/decrease; free/paid mode; and optional compare-at-price adjustment.
- Explicitly choose whether active sale pricing is preserved, cleared, or adjusted. Never silently rewrite sale prices.
- Validate non-negative amounts, percentage bounds, min/max price constraints, and a reason (10–500 characters).
- Provide a dry-run preview with old/new base prices, mode, sale handling, and skipped-course reasons.
- Apply confirmed changes in bounded batches, one course at a time through Mongoose saves so CourseRevision hooks run; invalidate course cache and record batch-level audit metadata.
- Include optimistic protection: preview returns each selected course’s `updatedAt`; apply rejects stale selections rather than overwriting edits made after preview.

### C. Rule-based pricing
- Store reusable admin-created rules with name, priority, enabled state, filters (category, level, current price range, mode), and an action (fixed price or percentage adjustment).
- Evaluate rules deterministically; highest priority matching rule wins, with stable tie-breaking. Show the selected rule and explanation for each course.
- Support “recommend only” and explicit “apply” workflows. Rules do not run silently or change prices merely because they were saved.
- Preview and validate every affected course before application.

### D. Explainable smart recommendations
- Add a rule-based recommendation profile with category/level price bands and optional duration-based adjustment. Keep all parameters admin-configurable and bounded.
- Generate recommendations with a human-readable explanation and the profile inputs used. Do not claim market demand, competitor prices, or conversion optimization unless such data sources actually exist.
- Recommendations are preview-only by default; applying them uses the same audited bulk operation.

### E. Audit and history
- Persist a pricing batch record with actor, reason, strategy/rule, filter snapshot, affected/skipped counts, and per-course before/after pricing snapshots.
- Add a history endpoint and show recent batches in the admin page.
- Provide safe batch rollback only when current pricing still matches that batch’s “after” snapshot; skip courses changed subsequently and report why.

## Security and business rules
- Protect all write routes with `authMiddleware`, `adminMiddleware`, and `adminPermissionMiddleware("pricing.manage")`.
- Add `pricing.manage` to the permission catalogue and the platform-admin profile. Super-admin wildcard remains supported.
- Do not let request payloads specify arbitrary MongoDB filters or update operators; parse a strict allow-listed filter/action schema.
- Preserve currency (currently INR unless explicitly configured in the existing course record), paid/free invariants, and payment server-side pricing. No client-supplied price can affect checkout.
- Preserve active sale prices by default. A sale price must be lower than the base price and non-negative; invalid sale states must be rejected or explicitly cleared.
- Require a meaningful reason for each applied batch and record audit events.

## Routes
- `GET /api/admin/pricing/courses` — filtered, paginated course selection and category options.
- `POST /api/admin/pricing/preview` — dry-run a bulk operation or pricing strategy.
- `POST /api/admin/pricing/apply` — apply a previously previewed operation with stale-data protection.
- `GET /api/admin/pricing/rules`, `POST /api/admin/pricing/rules`, `PUT /api/admin/pricing/rules/:ruleId`, `DELETE /api/admin/pricing/rules/:ruleId`.
- `POST /api/admin/pricing/recommendations` — calculate explainable recommendations from the admin profile.
- `GET /api/admin/pricing/history`, `POST /api/admin/pricing/history/:batchId/rollback`.

## UI outline
- Overview metrics: total catalogue courses, paid/free split, and courses matching current filters.
- Filterable catalogue table with price/mode/status and selection controls.
- Bulk editor for fixed/percentage/amount changes, sale handling, minimum/maximum price, and required reason.
- Pricing rules builder and smart recommendation profile.
- Preview comparison table with explicit skipped reasons and final confirmation.
- Batch history with detail and guarded rollback.

## Verification plan
- Unit tests for filter parsing, rule precedence, pricing math, free/paid transitions, sale-price invariants, min/max constraints, and stale-preview rejection.
- Route tests for authorization and validation where existing test infrastructure permits.
- Run backend tests, frontend typecheck/build, and inspect the latest GitHub Actions run for the exact implementation commit.

## Deliberate limits for this first iteration
- The recommendation engine is deterministic and explainable, not machine-learning or market-price prediction.
- There is no automatic recurring repricing job. An admin must preview and apply changes. This avoids unexpected price changes and billing disputes.
- Bulk apply is intentionally conservative and audited; it does not alter completed payments, existing enrollments, or subscription entitlements.


## Confirmed implementation decisions (2026-10-22)
- Default smart-pricing behavior is recommendation-only; the administrator must review a preview and explicitly apply it.
- Default recommendation strategy uses category-specific bands when a category is selected, otherwise level bands. Admin-defined module and project adjustment percentages nudge the baseline while the recommendation remains clamped to each band's min/max.
- Optional automatic rules are explicitly opt-in per rule. They execute only when an administrator deliberately selects **Execute enabled automatic rules** and provides a reason; there is no background/scheduled repricing worker.
- Pricing Studio UI is at `/admin/pricing`; APIs are mounted under `/api/admin/pricing`.

# Public Platform Footer — Implementation Plan

## Goal
Upgrade the current public marketing footer into a complete, responsive BuddyForStudy platform footer while retaining the compact signed-in footer and existing page-layout exclusions.

## Current findings
- `src/components/Footer.tsx` already renders a full marketing footer for signed-out visitors and a compact footer for signed-in users.
- Existing canonical routes include `/explore`, `/pricing`, authentication routes, and `/legal` plus policy slugs.
- The app currently does not expose verified public company contact details or official social account URLs in the footer implementation. These must not be fabricated.
- `src/App.tsx` already hides the footer on admin and lesson/player experiences. Preserve that behavior.

## Phase 1 — Footer information architecture
Build a clear multi-column footer:
- **Platform:** About BuddyForStudy, Explore courses, Learning roadmaps, Free learning.
- **Plans:** Pricing, available plans, free options, sign in, get started.
- **Resources:** Help/FAQ, learning resources, contact/support.
- **Company:** About us, contact us, feedback, social profiles when official URLs are configured.
- **Legal:** Privacy, Terms, Refunds & Cancellation, Cookies, Community Guidelines, and the policy index.
- **Footer bottom bar:** copyright, concise mission statement, and a back-to-top affordance where appropriate.

## Phase 2 — Routes and destinations
- Reuse existing routes wherever possible, including `/explore`, `/pricing`, `/login`, `/register`, and published policy routes.
- Add focused public About and Contact pages only if no suitable existing destination is available.
- Do not link to non-existent routes. Where policy slugs are dynamically loaded, use only supported/published destinations or the policy index.
- Read contact/social URLs from explicit public configuration. Omit unavailable social links rather than inventing official accounts. A contact page must explain the available support path if no public support address is configured.

## Phase 3 — Design and responsive behavior
- Match BuddyForStudy's current design tokens, typography, colors, borders, and spacing.
- Use semantic footer/nav landmarks, descriptive accessible link labels, visible keyboard focus, and sufficient contrast.
- Use responsive columns on desktop and a readable stacked layout on small screens; avoid horizontal overflow.
- Keep the footer visually quieter than the page's primary content and avoid excessive decoration.
- Preserve the compact signed-in footer and do not show the marketing footer in admin, lesson-player, or focused learning-player routes.

## Phase 4 — Verification
- Check every internal destination against the route table.
- Verify responsive behavior, keyboard navigation, and accessible labels.
- Run frontend typecheck/build and relevant tests; inspect CI for the exact implementation commit.
- Ensure no invented company address, support email, or social profile is presented as real.

## Scope boundaries
- This task upgrades the footer and adds only the minimal public informational destinations required for valid navigation.
- It does not add unverified social accounts, claim unimplemented products/features, or change subscription/payment logic.
- Contact form delivery, newsletter subscriptions, and social account management require verified endpoints/configuration and are not simulated by dead-end UI.

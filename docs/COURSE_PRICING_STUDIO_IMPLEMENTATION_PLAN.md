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

# BUDDYFORSTUDY ADMIN PANEL: MASTER SPEC (Platform-Specific)

> **Audience:** any AI model or developer building the BuddyForStudy.V2 admin panel.
> **Companion file:** `ADMIN_PANEL_DESIGN_SYSTEM.md` (generic tokens, components, UX rules). **This file does not repeat those tokens.** It says *what* to build, *where*, and *with which rules* for this specific platform. If the two files conflict on platform behavior, this file wins; on visual tokens, the design-system file wins.
> **Source of facts:** the 4-part platform analysis of the repository (branch `test`). Anything marked **PROPOSED** does not exist yet. Anything marked **VERIFY** must be confirmed in code before building.

---

## 0. Ground rules for the AI

1. **Reuse before you build.** The repo already has `src/components/admin/AdminUI.tsx`, `src/styles/admin-design-system.css`, `src/pages/admin/AdminLayout.tsx` (sidebar, command palette, theme), `src/lib/adminApi.ts`, and server files `adminPro.controller.js`, `adminPro.routes.js`, `server/src/utils/adminRbac.js`. Extend these. Do not create a parallel system.
2. **The backend is the security boundary.** Every new mutation endpoint must have `authMiddleware`, `adminMiddleware`, `adminPermissionMiddleware('<permission>')`, input validation (Zod), and an audit event. Hiding a button is never access control.
3. **Never return or log secrets.** No API keys, JWT secrets, webhook secrets, SMTP passwords, OTP codes, push `p256dh`/`auth` keys, or full push endpoints in any admin API, table, export or audit payload. Redact before persisting audit `before`/`after`.
4. **Money and status are server-controlled.** No generic "edit payment" form. Payment, refund and subscription state changes only through validated workflows (Section 6.5).
5. **Every sensitive action = permission + reason + confirmation + audit.** Sensitive means: account disable, access grant/revoke, role change, refund decision, price change, announcement send, export of personal data, course delete, setting change.
6. **Paginate and bound everything.** Server-side filter/sort/search with limits (25/50/100). No loading whole collections. Exports are bounded (max rows) and audited.
7. **Currency is explicit.** Show `₹1,299.00` style with currency code in tooltips. Default currency in the data is `INR`; do not assume only INR.
8. **Stack:** React 18 + TypeScript, Vite, React Router 7, Tailwind 3 + CSS tokens, Lucide icons. Backend: Express 5 (ES modules), Mongoose 8, MongoDB. Follow existing code style.
9. **Output complete files**, with types, and tests for backend permission gates (Node test runner `node --test`).
10. If an owner decision is missing, use the **recommended default in Section 13**, state the assumption in one line, and continue.

---

## 1. Current-state snapshot

### 1.1 What already exists (do not rebuild, improve)

| Route | Component | Status |
|---|---|---|
| `/admin` | `AdminControlCenter` | Metrics, health, operational alerts + acknowledge |
| `/admin/analytics` | `AdminAnalytics` | Exists; **VERIFY** metric formulas |
| `/admin/users` | `AdminUsersPro` | Strong: search, filters, sort, pagination, drawer, status change with reason, course access grant/revoke, feature overrides, CSV export (audited), column chooser, density. **Gap:** saved views are browser-local |
| `/admin/courses` | `AdminCoursesPro` | Metadata, modules, lessons, resources, readiness check, publish/unpublish. **Gap:** no versions, drafts, soft delete |
| `/admin/plans` | `AdminPlans` | Plan CRUD |
| `/admin/billing` | `AdminBilling` | Payments, refunds, payment issues |
| `/admin/communications` | `AdminCommunications` | Templates, announcements. **Gap:** no scheduling, no delivery report |
| `/admin/coupons` | `AdminCoupons` | Coupon CRUD |
| `/admin/settings` | `AdminSettings` | Generic settings. **Gap:** sensitivity classification |
| `/admin/audit` | `AdminAudit` | Audit viewer |
| `/admin/roles` | `AdminRoles` | Admin profiles + invitations |
| `/admin/ai-content` | `AdminAIContent` | AI limits + discovery settings |
| `/admin/support` | `AdminSupport` | Payment/access cases |
| `/admin/design-system` | `AdminDesignSystem` | Component gallery |

### 1.2 Honest verdict
The panel is a **solid CRUD and governance foundation**. The next level is **not more CRUD screens**. It is: **(a) operational observability** (webhooks, worker, integrations, AI cost), **(b) content quality control** (versions, review, moderation), **(c) finance safety**, **(d) team-shared workflows** (server-side saved views, assignments, notes), **(e) privacy and retention**.

### 1.3 Gaps to close (ranked)

| # | Gap | Fix (section) |
|---|---|---|
| 1 | No system/ops page: worker health, webhook events, audit outbox, integration status | 5.12 |
| 2 | No AI observability: generation log, cost, latency, failure reasons | 5.8, 5.13 |
| 3 | No content versioning, drafts, soft delete, or review queue | 5.5, 8 |
| 4 | Reviews have no moderation; AI roadmaps/quizzes/insights have no admin inspection | 5.6, 5.7 |
| 5 | Announcements: only `draft`/`sent`; no schedule, cancel, delivery report | 5.11 |
| 6 | No subscription management page (only plans and payments) | 5.9 |
| 7 | Settings are generic `Mixed`; no typed schema or sensitivity levels | 5.15 |
| 8 | Saved views only in `localStorage`; no shared team views, notes or assignment | 5.2 |
| 9 | No retention/privacy console (deletion, export requests, retention matrix) | 5.16 |
| 10 | No admin MFA, no forced re-auth for sensitive actions, no session controls | 5.14 |
| 11 | Role-by-role end-to-end tests missing | 12 |

---

## 2. Information architecture (new sidebar)

Group by job, not by collection. Max 8 groups, max ~16 items. Items hidden when the admin lacks the read permission. **NEW** = to build.

```
OVERVIEW
  Dashboard                      /admin                 dashboard.read
  Analytics                      /admin/analytics       analytics.read

PEOPLE AND ACCESS
  Users                          /admin/users           users.read
  Enrollments (NEW)              /admin/enrollments     users.read
  Admin roles                    /admin/roles           admin_roles.manage

LEARNING AND CONTENT
  Courses                        /admin/courses         courses.read
  AI roadmaps (NEW)              /admin/roadmaps        ai.manage
  Content quality (NEW)          /admin/quality         resources.manage   (quizzes, insights, broken links)
  Reviews (NEW)                  /admin/reviews         courses.manage     (moderation)

REVENUE
  Plans                          /admin/plans           plans.read
  Subscriptions (NEW)            /admin/subscriptions   billing.read
  Payments and refunds           /admin/billing         billing.read
  Coupons                        /admin/coupons         coupons.read
  Support cases                  /admin/support         payment_issues.manage

COMMUNICATIONS
  Messages                       /admin/communications  communications.manage   (templates, announcements)
  Delivery log (NEW)             /admin/deliveries      notifications.read

AI AND INTEGRATIONS
  AI and discovery               /admin/ai-content      ai.manage
  AI usage and cost (NEW)        /admin/ai-usage        analytics.read

SYSTEM
  System health (NEW)            /admin/system          operations.read   (worker, webhooks, outbox, integrations)
  Audit log                      /admin/audit           audit.read
  Settings                       /admin/settings        settings.read
  Privacy and retention (NEW)    /admin/privacy         settings.manage
  Design system                  /admin/design-system   dashboard.read
```

Sidebar order inside each group follows daily-use frequency. Counts as neutral pills; **danger pills only** for items needing action (open payment issues, pending refunds, critical alerts, failed webhooks, pending reviews).

---

## 3. Roles and permissions

### 3.1 Existing profiles (keep, code-defined in `adminRbac.js`)
`super_admin`, `platform_admin`, `ai_content_manager`, `finance_manager`, `support_manager`, `analyst_auditor`.

### 3.2 Existing permission keys
`dashboard.read, users.read, users.manage, courses.read, courses.manage, courses.publish, ai.manage, resources.manage, analytics.read, plans.read, plans.manage, billing.read, refunds.manage, payment_issues.manage, communications.send, communications.manage, coupons.read, coupons.manage, settings.read, settings.manage, audit.read, operations.read, operations.manage, admin_roles.manage`

### 3.3 PROPOSED new permission keys

| Key | Purpose | Granted to |
|---|---|---|
| `enrollments.manage` | Grant/revoke course access outside the user drawer | super, platform, support |
| `reviews.moderate` | Hide/restore/delete reviews | super, platform, support |
| `roadmaps.read` | View learner AI roadmaps (privacy-sensitive) | super, platform, ai_content |
| `notifications.read` | Delivery log, failure diagnostics | super, platform, support, analyst |
| `notifications.retry` | Retry failed deliveries | super, platform |
| `webhooks.read` | Webhook event list | super, finance, platform, analyst |
| `webhooks.retry` | Replay eligible webhook events (only if validated replay exists) | super, finance |
| `subscriptions.manage` | Controlled subscription actions | super, finance |
| `content.revisions` | View/restore course revisions | super, platform, ai_content |
| `exports.pii` | Export files containing personal data | super, platform |
| `exports.finance` | Export payment/refund data | super, finance |
| `retention.manage` | Retention policy and deletion workflows | super |
| `system.integrations.read` | Integration status panel | super, platform, analyst |

Rules: unknown permission or profile **fails closed**. Never self-escalate. Protect the **last active super admin** (cannot disable, demote or delete). Permission overrides must show an effective-permission preview and an expiry option.

### 3.4 Role scope summary (who sees what by default)

| Area | super | platform | ai_content | finance | support | analyst |
|---|---|---|---|---|---|---|
| Users (read) | yes | yes | no | masked | yes | no |
| Users (manage) | yes | yes | no | no | limited | no |
| Courses | yes | yes | yes | no | read | no |
| Billing | yes | read | no | yes | read | read |
| Refund decision | yes | no | no | yes | no | no |
| Communications | yes | yes | no | no | send only | no |
| System health | yes | yes | read | read | read | read |
| Audit | yes | yes | no | no | no | read |
| Roles | yes | no | no | no | no | no |

**PII masking default:** support and finance see email as `a***@gmail.com` and phone masked until they click **Reveal** (logs an audit event `pii.reveal` with reason).

---

## 4. Shared admin components to add (on top of `AdminUI.tsx`)

Build once in `src/components/admin/`, reuse everywhere.

| Component | Purpose | Key props / rules |
|---|---|---|
| `DataTable<T>` | The one table | columns, server pagination, sort, row select, sticky header, density, skeleton/empty/error, row click opens drawer |
| `FilterBar` | Search + dropdowns + chips + Reset + saved views | State in URL query; debounce 300ms |
| `SavedViews` | **Server-side** per-admin and shared team views | Replaces `localStorage` views (see 8.5) |
| `DetailDrawer` | Right drawer 480/720px | deep-link `?id=`, prev/next, sticky footer |
| `TypedConfirmDialog` | Destructive confirm | requires reason, optional "type the name to confirm", states consequence and count |
| `ReasonField` | Required reason textarea (10-500 chars) | Used by every sensitive action |
| `StatusBadge` | Domain status to color | mapping in 4.1 |
| `MoneyCell` | Amount with currency, right aligned | `Intl.NumberFormat`, currency tooltip |
| `RelativeTime` | Relative time with exact tooltip | Asia/Kolkata display default, tooltip shows ISO |
| `PiiCell` | Masked value + Reveal | audit on reveal |
| `JsonDiff` | Before/after viewer for audit | redacted keys shown as `[redacted]` |
| `Timeline` | Activity feed | actor, action, time |
| `HealthTile` | Service status tile | status, last check, latency, detail link |
| `QueueGauge` | Pending count, oldest age, failures | used for worker/outbox/webhooks |
| `KpiCard` | Stat card with delta and link | click opens filtered list |
| `BulkBar` | Selection action bar | "Select all N results" support |
| `InlineEditCell` | Click-to-edit | Enter saves, Esc cancels, optimistic with rollback |
| `EmptyState`, `Skeleton*` | Already exist; ensure all pages use them | |

### 4.1 Status badge mapping (use everywhere, never improvise)

| Domain | Value | Color token |
|---|---|---|
| User | active / inactive | success / neutral |
| Course | published / draft / archived | success / warning / neutral |
| Enrollment | active / completed / cancelled | info / success / neutral |
| Enrollment source | self / admin | neutral / info |
| Payment | paid / created / pending / failed / refunded / partially_refunded / cancelled | success / neutral / warning / danger / info / info / neutral |
| Subscription | active / trialing / past_due / cancelled / expired | success / info / warning / neutral / neutral |
| Refund | pending / approved / rejected / processed | warning / info / danger / success |
| Payment issue | open / in_review / resolved / closed | danger / warning / success / neutral |
| Notification delivery | sent / pending / failed / skipped | success / warning / danger / neutral |
| Webhook | processed / processing / failed | success / info / danger |
| Alert severity | info / warning / critical | info / warning / danger |
| Alert status | open / acknowledged / resolved | danger / warning / success |
| Announcement | draft / scheduled / sending / sent / failed / cancelled | neutral / info / info / success / danger / neutral |
| Review | visible / hidden / reported | success / neutral / warning |

Badges always include the **text label**.

---

## 5. Page-by-page specifications

Each page: use `AdminPageHeader` (breadcrumbs, title, one primary action), `FilterBar` above `DataTable`, drawer for detail, all states per the design-system file Section 9.

### 5.1 Dashboard `/admin` (improve)

**Question it answers:** "What needs me right now, and is the platform healthy?"

Layout:
1. Header: "Dashboard" + date range (default last 7 days) + Export (analytics permission).
2. **KPI row (4):** New users, Active learners, Net revenue (INR, gross minus refunds), Open items (pending refunds + open payment issues + failed webhooks + critical alerts). Each card links to its filtered list.
3. **Needs attention (right, 4 cols):** pending refunds, open payment issues older than 24h, failed notifications, failed webhooks, unacknowledged critical alerts. Each row has a direct action button (Review, Retry, Acknowledge).
4. **Health strip:** HealthTiles for API, MongoDB, Worker heartbeat, Razorpay webhook (last event age), SMTP, Web Push, AI provider, YouTube quota. Status derived from the system endpoint (5.12). Never show secrets, only "Configured / Not configured / Degraded".
5. **Charts:** sign-ups and revenue trend (line), course completions (bar), top courses (table).
6. **Recent admin activity** (last 10 audit events, link to Audit).

Role variants: finance sees revenue, refunds, webhooks first; support sees issues and refunds queue; ai_content sees AI health and content quality; analyst sees KPIs only (read-only).

### 5.2 Users `/admin/users` (extend existing)

**Keep:** everything currently built.
**Add:**
- **Server-side saved views** (personal + shared with team), stored in a new collection (8.5). Migrate existing local views with a one-time "Import my local views" button.
- **Internal notes** per user (timeline, author, time) and **flags** (VIP, at-risk, needs follow-up).
- Drawer tabs: **Overview, Courses and access, Billing, Learning, Notifications, Activity**.
  - Overview: name, email (PiiCell), provider, verified, active, created, last active (VERIFY field), role.
  - Courses and access: enrollments (source, granted by, reason, revoked), grant/revoke with reason.
  - Billing: subscription, payments (MoneyCell), refunds, issues (links out).
  - Learning: progress per course, streaks, achievements, roadmaps count (read-only).
  - Notifications: preferences summary (read-only, never override consent), push subscription count and health (no keys), last 10 notifications with delivery status.
  - Activity: audit events where target is this user.
- Actions: Disable/Enable (typed email + reason, already built), Resend verification email, Revoke sessions (PROPOSED), Feature override (built), Export (built).
- Bulk: export, disable (max 50, typed confirmation "DISABLE 12 USERS"), add flag.
- **Never** show password hashes, OTP codes. No hard delete button. Deletion happens only via privacy workflow (5.16).

Columns: checkbox, user (avatar, name, masked email), plan, status, auth provider, enrollments count, last active, created, row menu.
Filters: status, role, provider, plan, verified, has active subscription, created range, flag.

### 5.3 Enrollments `/admin/enrollments` (NEW)

Purpose: answer "who has access to what, and why" across all users.
Columns: learner, course, status, access source (self/admin), granted by, reason, enrolled at, revoked at.
Filters: course, status, source, granted-by admin, date range.
Actions: Grant access (user picker + course + reason), Revoke (reason), bulk grant from CSV of emails (preview, validation report, max 200 rows).
Rules: admin-granted access shows an `info` badge and always stores reason. Revoking an admin-granted enrollment never deletes progress. Audit every change.

### 5.4 Admin roles `/admin/roles` (extend)

Add: effective-permission preview per admin; "who has access to X" search by permission; invitation list with state (pending, accepted, expired, revoked) and resend; last-super-admin protection banner; override expiry; role change requires reason and (recommended default) **second-admin approval** for super_admin grants (see Section 13).

### 5.5 Courses `/admin/courses` (extend)

List columns: thumbnail + title + slug, category, level, pricing (mode, price, sale), status, origin (`normal / ai / module / discovery`), enrollments count, rating, updated.
Filters: status, category, level, pricing mode, origin, featured, readiness (ready / issues).
Row menu: Edit, Preview as learner, Duplicate, Publish/Unpublish, Archive, **Revisions**, Delete (soft, disabled if enrollments exist, tooltip explains).

Editor (page, not modal), tabbed: **Details, Curriculum, Pricing and access, SEO and display, Quality, Revisions**.
- **Details:** title, slug (auto, editable, uniqueness check, warns about changing slug of published course), description, category, level, duration, thumbnail (URL validated, preview), learning outcomes (ordered list).
- **Curriculum:** drag-and-drop modules and lessons; lesson types tutorial/project/quiz; per-lesson resource list; video fields; reorder persists once via "Save order" action, not per drag; unsaved-change guard. Validate nested content before save (order integrity, URL schemes http/https only, quiz has exactly one correct option, no empty titles).
- **Pricing and access:** mode free/paid, price, compare-at, sale toggle + sale price (sale < price enforced), currency, enrollment enabled, certificate enabled. Changing price on a course with active sales requires reason and is audited.
- **Quality:** readiness checklist (has outcomes, has at least one lesson per module, all resource URLs reachable, all quizzes valid, thumbnail set). A course cannot be published while blocking checks fail (warnings allowed with override + reason).
- **Revisions (PROPOSED):** list of snapshots (who, when, note), compare (JsonDiff), restore (reason, creates a new revision, never destroys history).
- Publish flow: Draft, then Publish (now) or schedule (PROPOSED `publishAt`). Unpublish requires confirmation stating enrollment count.
- Course documents can get large: **save per section** (PATCH module/lesson), not the whole course each time, and show document size warning above ~2 MB (VERIFY approach).
- AI-origin courses show a banner "Generated by AI, review status: <state>" and require human review before first publish (default policy, Section 13).

### 5.6 Reviews `/admin/reviews` (NEW)

Purpose: moderation. Needs schema change: `status` (visible/hidden), `reportedCount` (8.2).
Columns: course, learner, rating, comment (truncated), status, created.
Filters: status, rating, course, reported, date.
Actions: Hide, Restore, Delete (soft), bulk hide. Reason required for hide/delete. Hidden reviews are excluded from public rating averages (server recomputes).

### 5.7 AI roadmaps `/admin/roadmaps` and Content quality `/admin/quality` (NEW)

**Roadmaps (read-mostly, privacy sensitive; requires `roadmaps.read`):**
Columns: learner (masked), query, canonical topic, level, status, lessons count, completion %, last accessed.
Filters: topic, level, status, date. Drawer: roadmap structure, skill graph summary, quiz attempts. Actions: **Flag for review**, **Regenerate** (queued, bounded, audited, counts against AI budget), **Delete roadmap** (soft). No editing of learner-owned content except via regenerate.

**Content quality** (tabs):
1. **Quizzes:** QuizBank by course/lesson, question list, mark question **invalid/disabled**, regenerate. Show attempts count and average score to detect bad questions (very low pass rate = flag).
2. **Lesson insights:** summary and key notes by course/lesson, content hash, model, generated at; actions: invalidate (forces regeneration), approve.
3. **Q&A cache:** `AIQuestionAnswer` by hit count; invalidate entry; flag wrong answers; show model.
4. **Broken resources:** scheduled link checker results for course videos/resources (PROPOSED job); list with course/lesson, URL, last status, **Mark fixed / Replace / Remove**.

### 5.8 AI and discovery `/admin/ai-content` and AI usage `/admin/ai-usage`

`/admin/ai-content` (existing): keep limits and discovery settings; add **feature switches** per AI feature (kill switch with confirmation, takes effect fail-safe with a clear learner-facing message), bounds validation (min < max, ranges), and "last changed by" line.

`/admin/ai-usage` (NEW): from `AIUsageCounter` and a new `AIGenerationLog` (8.3).
- KPIs: requests today/month by feature, cache hit rate (from `AIQuestionAnswer.hitCount`), failure rate, p50/p95 latency, estimated cost (if token counts logged; otherwise show "not tracked" explicitly).
- Table: top users by usage (masked), anomaly flag (usage over N times median).
- Actions: raise/lower a user's limit via existing feature override mechanism (with reason), alert thresholds.

### 5.9 Plans, subscriptions `/admin/plans`, `/admin/subscriptions`

**Plans (extend):** list with active/popular/sortOrder drag reorder, subscriber count, MRR contribution (definition in Section 11). Edit form: price, interval, trial days (0-365), features (select from the code-defined catalog `subscriptionFeatures.js`, no free text), limits (numeric map with known keys only), provider plan id (read-only after creation). **Price change on a plan with active subscribers:** show impact ("N subscribers, applies to new purchases only") and require reason. Deactivate instead of delete.

**Subscriptions (NEW, `billing.read`; actions need `subscriptions.manage`):**
Columns: user (masked), plan, status, provider, current period end, cancel at period end, provider subscription id.
Filters: status, plan, provider, expiring within 7/30 days, past_due.
Drawer: timeline of payments and provider events (event name, time, id), entitlement summary (what features the user effectively has and why: plan vs override).
Actions (all reason + audit): **Extend period** (manual provider only), **Cancel at period end**, **Resync from provider** (VERIFY existence), no arbitrary status edit.

### 5.10 Payments, refunds, support `/admin/billing`, `/admin/support`

**Payments tab:** columns: date, payer (masked), item (course/plan), amount (MoneyCell), status, provider, provider payment id (copy button), notification status.
Filters: status, provider, item type, amount range, date, has refund, has issue.
Drawer: provider references, linked enrollment/subscription, notification reconciliation state, refunds, issues, timeline. **No edit.** Allowed actions: **Create refund** (starts refund workflow), **Re-run reconciliation** (re-queue purchase notification/enrollment; idempotent), **Open support case**.

**Refunds tab (workflow):**
`pending` to `approved` or `rejected`; `approved` to `processed` after the provider refund succeeds.
- Decision panel shows: payment evidence, amount requested vs paid vs already refunded, learner reason, prior refunds/issues, course progress (to support policy decisions), provider ids.
- Approve requires admin note; Reject requires admin note (sent to learner).
- Amount cap: cannot exceed remaining refundable amount (server enforced).
- Large refund threshold (default Rs 5,000, configurable) needs second approver (Section 13).
- Partial refunds supported; payment status becomes `partially_refunded` or `refunded` by server logic only.
- Show **SLA age**: pending longer than 48h turns warning, 96h danger.

**Support cases `/admin/support`:** columns: type, payer, payment, status, age, assignee (PROPOSED field), updated. Filters: type, status, assignee, age. Actions: assign to me, change status, add internal note, resolve with note (shown to learner), link to refund. Canned responses (PROPOSED, via MessageTemplate channel `notification`).

**Coupons (extend):** show usage vs limit bar, expiry, scope, status; actions: create, duplicate, deactivate, **bulk-generate codes** (prefix + count, preview); validation: percentage 1-100, `maxDiscount` only for percentage, fixed < price warning; cannot delete used coupons (deactivate instead).

### 5.11 Communications `/admin/communications` and `/admin/deliveries`

**Templates tab:** key (slug, immutable after creation), channel, title/subject, body with placeholder picker and **live preview with sample data**, **Send test to me**, active toggle, version history (PROPOSED), used-by list (which events use it).

**Announcements tab (extend):**
- Compose: title, message, channels (in-app, email, push), audience (`all`, `active`, `subscribers`, selected users, filtered), link.
- **Audience preview** before send: count, sample (masked), count after consent filtering (email requires opt-in `emailAnnouncements`, push requires `pushEnabled`). Display "Will reach: in-app N, email M, push K".
- States: `draft, scheduled, sending, sent, failed, cancelled` (PROPOSED additions). Schedule with date/time and timezone; Cancel before start.
- Send requires `communications.send`, typed confirmation when audience > 500 ("SEND TO 1,204 USERS"), and is delivered by the **background worker in batches**, not in the request.
- After send: **delivery report** (sent/failed/skipped per channel, top errors).
- Transactional messages (billing, security) are separate from marketing announcements; announcements cannot masquerade as billing/security type.

**Delivery log `/admin/deliveries` (NEW, `notifications.read`):**
Columns: time, recipient (masked), type, event key, channel statuses (email/push/in-app), attempts, last error (truncated, safe).
Filters: status, channel, type, date, recipient, event key.
Actions: **Retry** (eligible failed items only, idempotent via `eventKey`/`pushIdempotencyKey`, needs `notifications.retry`).
Note: `sent` means provider accepted, not delivered or read. Label it that way in a tooltip.

### 5.12 System health `/admin/system` (NEW, highest priority)

Tabs:
1. **Overview:** HealthTiles for API, MongoDB, Worker, Razorpay, SMTP, Web Push (and OneSignal if active: **VERIFY which push path is active**), AI provider(s), YouTube quota, Redis (if enabled), Sentry. Each shows state (Healthy / Degraded / Down / Not configured), last check time, latency, and a safe reason.
2. **Worker and queues:** QueueGauge for email retry, push retry, purchase-receipt reconciliation, subscription notification, learning reminders, audit outbox. Show pending count, oldest age, failed count, last successful run, worker heartbeat (PROPOSED `JobHeartbeat` collection updated by `worker.js`). Warning if heartbeat older than 5 min; critical older than 15 min.
3. **Webhooks:** `WebhookEvent` list: time, event, status, provider event id, linked payment, claim age. Filters: status, event, date. Failed or stuck `processing` > 10 min highlighted. **Replay** only if a validated replay path exists (VERIFY); otherwise show "Investigate" with linked payment and instructions.
4. **Audit outbox:** pending, processing, attempts, oldest age, last error (redacted). Alert if oldest > 10 min.
5. **Alerts:** `OperationalAlert` list: severity, source, message, occurrences, first/last seen, status; Acknowledge, Resolve (note). Group repeats.
6. **Configuration status:** for each required environment setting: Configured / Missing (never the value). Shows build version, environment (Production/Staging) and commit hash.

Rules: read-only by default; `operations.manage` needed to acknowledge/resolve; no "run job now" until each job is idempotent and bounded.

### 5.13 Analytics `/admin/analytics`

Pages: **Learners** (sign-ups, activation, active users, retention cohorts if feasible), **Learning** (enrollments, completions, drop-off per module, top and bottom courses), **Revenue** (gross, refunds, net, by plan/course, MRR, churn), **AI** (see 5.8), **Communications** (volume, failure rate).
All use the definitions in Section 11. Date range + compare toggle + segment filters in URL. Export CSV (permission), aggregated only (no PII). Use bounded aggregations; precompute daily rollups (PROPOSED `DailyMetric` collection via worker) for heavy charts.

### 5.14 Audit and security `/admin/audit`

- Filters: actor, action, target type, target id, date, has reason. Columns: time, actor, action, target, reason, IP (masked partially), expandable `JsonDiff`.
- Saved filters: "Role changes", "Exports", "Refunds", "Setting changes", "PII reveals".
- Export audit (needs `audit.read` + `exports.pii`), audited itself.
- Audit rows are **immutable in UI** (no edit/delete).
- **Security panel (PROPOSED):** failed admin logins, permission denials (403) trend, new admin invitations, role changes in last 30 days, admins without MFA.
- **Admin account security (PROPOSED):** TOTP MFA required for all admin profiles (default policy), re-authentication (password or MFA) before: role change, refund processing, bulk export, settings change, announcement to > 500 users. Session list and revoke for own account; admin session timeout (default 8h idle 30 min).

### 5.15 Settings `/admin/settings` (typed)

Replace free-form `PlatformSetting` editing with a **typed registry** in code:

```ts
type SettingDef = {
  key: string;            // "ai.maxDailyRoadmaps"
  label: string; description: string;
  type: 'boolean'|'number'|'string'|'enum'|'duration'|'url';
  min?: number; max?: number; options?: string[];
  sensitivity: 'public'|'internal'|'sensitive';   // sensitive: super_admin only, value masked
  readPermission: string; writePermission: string;
  requiresReason: boolean; requiresReauth: boolean;
  takesEffect: 'immediate'|'next_request'|'restart';
};
```
UI groups: General, Learning, AI, Communications, Payments policy, Security, Maintenance. Each field shows current value, default, last changed by/when, and a **Reset to default**. Unknown keys cannot be created from the UI. **Maintenance mode** toggle (super_admin only, with message, optional auto-expiry, requires re-auth). Secrets never appear here.

### 5.16 Privacy and retention `/admin/privacy` (NEW, later phase)

- **Retention matrix** (read first, editable later): per collection retention period and action (archive/anonymize/delete), defaults in Section 13.
- **Data requests:** queue of user export/deletion requests (needs a new `DataRequest` model): status, due date, handler, outcome. Deletion = **anonymize** user (name, email, profile image, google id) while preserving payments, refunds, audit evidence. Never hard-delete financial or audit rows by default.
- **Consent view:** announcements email consent timestamps (aggregate).
- **Recycle bin:** soft-deleted courses, reviews, roadmaps with restore window (default 30 days).

---

## 6. Workflow rules (state machines)

### 6.1 Course
`draft -> in_review (optional) -> published -> archived`; `published -> draft` allowed (unpublish, confirmation + enrollment count); `archived -> draft` (restore). Delete = soft delete (`deletedAt`), blocked while active enrollments exist unless super_admin with reason. AI-origin courses: `needs_review` flag must be cleared by a human before first publish.

### 6.2 Refund
`pending -> approved -> processed`; `pending -> rejected`. No backwards transitions. Server-only transitions; each stores actor, time, note. One active refund per payment (existing `activePaymentKey`).

### 6.3 Payment issue
`open -> in_review -> resolved -> closed`; reopen only from `resolved` within 14 days.

### 6.4 Announcement
`draft -> scheduled -> sending -> sent`; `scheduled -> cancelled`; `sending -> failed` (partial results kept).

### 6.5 Money safety checklist
- No endpoint accepts a client-supplied payment `status`.
- Amount fields are validated against the original payment on the server.
- All provider ids are copy-only fields.
- Every financial export is audited and requires `exports.finance`.

---

## 7. Backend API additions (PROPOSED)

Prefix `/api/admin`. All require auth + admin + the listed permission. All mutations write an audit event.

| Method and path | Permission | Notes |
|---|---|---|
| `GET /system/overview` | `operations.read` | health tiles, build info, config status (booleans only) |
| `GET /system/queues` | `operations.read` | counts, oldest age, heartbeat |
| `GET /webhooks` | `webhooks.read` | filters: status, event, date; paginated |
| `POST /webhooks/:id/replay` | `webhooks.retry` | only if validated replay exists |
| `GET /deliveries` | `notifications.read` | paginated, safe fields only |
| `POST /deliveries/:id/retry` | `notifications.retry` | idempotent |
| `GET /enrollments` | `users.read` | filters; `POST` grant, `PATCH :id/revoke` need `enrollments.manage` |
| `GET /reviews`, `PATCH /reviews/:id` | `reviews.moderate` | hide, restore; soft delete |
| `GET /roadmaps`, `POST /roadmaps/:id/regenerate` | `roadmaps.read` / `ai.manage` | regenerate queued |
| `GET /quality/quizzes`, `PATCH /quality/quizzes/:id/questions/:qid` | `resources.manage` | disable/enable question |
| `POST /quality/insights/:id/invalidate` | `ai.manage` | |
| `GET /courses/:id/revisions`, `POST .../restore` | `content.revisions` | |
| `GET /subscriptions`, `POST /subscriptions/:id/extend` | `billing.read` / `subscriptions.manage` | |
| `GET /ai/usage`, `GET /ai/generations` | `analytics.read` | aggregates |
| `GET/POST/PATCH/DELETE /saved-views` | `dashboard.read` | owned by admin; `shared` flag |
| `GET/POST /users/:id/notes`, `PATCH /users/:id/flags` | `users.manage` | |
| `POST /pii/reveal` | role-based | logs `pii.reveal` with reason |
| `GET /audit/export` | `audit.read` + `exports.pii` | |
| `GET/PATCH /settings/:key` | per setting definition | typed validation |
| `POST /announcements/:id/schedule`, `/cancel` | `communications.send` | |
| `GET /announcements/:id/report` | `communications.manage` | delivery totals |

Standard list contract: `?page&limit&sort&order&q&<filters>` returning `{ items, total, page, limit }`. Limit capped at 100. Sort fields allowlisted. Errors return `{ code, message, fields? }`.

---

## 8. Data model additions (PROPOSED)

### 8.1 Soft delete (add to `Course`, `Review`, `LearningRoadmap`)
`deletedAt: Date|null`, `deletedBy: ObjectId|null`. Default queries exclude deleted. Index `{ deletedAt: 1 }`.

### 8.2 Course workflow and review
`Course.status: 'draft'|'published'|'archived'` (keep `isPublished` in sync during migration), `Course.needsReview: Boolean`, `Course.publishAt: Date|null`.
`Review.status: 'visible'|'hidden'` (default `visible`), `Review.reportedCount: Number`, `Review.moderatedBy`, `Review.moderatedAt`, `Review.moderationReason`.

### 8.3 New collections

```ts
CourseRevision   { course, version:int, snapshot:Mixed, note, createdBy, createdAt }   // index (course, version desc); cap snapshot size
AIGenerationLog  { user, feature, provider, model, status:'ok'|'error'|'timeout'|'blocked',
                   latencyMs, inputTokens?, outputTokens?, costEstimate?, errorCode?, course?, createdAt }  // TTL 90 days
JobHeartbeat     { job:String(unique), lastRunAt, lastSuccessAt, lastError, runCount, status }
SavedView        { owner, page, name, filters:Mixed, columns:[String], sort, density, shared:Boolean, createdAt }
UserNote         { user, author, body(<=2000), createdAt }          // plus User.flags:[String]
DailyMetric      { date, key, value, dims:Mixed }                    // worker-computed rollups
DataRequest      { user, type:'export'|'deletion', status, requestedAt, dueAt, handledBy, outcome }
```

### 8.4 Announcement
Extend `status` enum: `draft, scheduled, sending, sent, failed, cancelled`; add `scheduledAt`, `startedAt`, `stats: { total, sent, failed, skipped }`, `cancelledBy`.

### 8.5 Support and refund
`PaymentIssue.assignee`, `PaymentIssue.internalNotes[]`; `RefundRequest.secondApprover` (if policy enabled).

### 8.6 Indexing rules
Add indexes for every new filter+sort combination; verify against production. Add TTL where data is operational (AIGenerationLog). Keep audit and payment data without TTL unless a retention policy approves.

---

## 9. Page-level UX contracts (apply to every list page)

1. Filter state, sort, page, and open drawer id live in the URL.
2. Loading shows skeleton rows; refresh keeps old data with a thin progress bar.
3. Empty vs no-results are different messages.
4. Row click opens the drawer; the "..." menu holds secondary actions; destructive items last, in danger color.
5. Every sensitive action opens `TypedConfirmDialog` with `ReasonField`, states the consequence and count.
6. Success toast uses the same verb as the button. Reversible actions offer **Undo** (hide review, unpublish, archive).
7. Failed loads show a card-level error with **Retry**; one failing widget never blanks the page.
8. Keyboard: `Ctrl/Cmd+K`, `/` focus search, `G` then letter to navigate (U users, C courses, B billing, S system, A audit), `Esc` closes drawer.
9. Mobile: tables scroll horizontally with sticky first column; drawers become full-screen sheets; finance and support actions must work at 375px.
10. Timezone: display `Asia/Kolkata` by default with tooltip showing UTC; one date format app-wide.

---

## 10. Safety, privacy and audit rules (non-negotiable)

- **Audit event naming:** `<entity>.<verb>` e.g. `user.disable`, `enrollment.grant`, `refund.approve`, `plan.price_change`, `announcement.send`, `setting.update`, `pii.reveal`, `export.users`, `role.assign`.
- **Audit payload:** actor, action, targetType, targetId, reason, redacted before/after, ip, userAgent. Redaction list: password, tokens, secrets, otp, push keys, endpoints, card data, full emails in `before/after` (store masked).
- **Exports:** whitelist columns, escape formula-leading characters (`= + - @`), UTF-8 BOM, row cap (default 10,000), audited with filter snapshot.
- **Bulk operations:** max 50 items for state changes, 200 for CSV grants; preview, typed confirm, partial-failure report.
- **Impersonation:** not in scope. Do not build "login as user".
- **Self-protection:** an admin cannot disable, demote or delete themselves; last super admin protected.
- **Consent:** never override learner notification preferences from admin; show them read-only.
- **Secrets:** configuration status screen shows only configured / missing.

---

## 11. KPI definitions (use these until the owner changes them)

| KPI | Definition |
|---|---|
| Registered users | Count of `User` with `role: 'user'` |
| Verified users | Registered with `emailVerified: true` |
| Active learner (period) | User with at least one lesson completion or progress update in the period (VERIFY the event source) |
| Enrollment | `Enrollment.status` in `active, completed` |
| Course completion rate | `completed` enrollments / (`active` + `completed`) for enrollments created in the window |
| Gross revenue | Sum `Payment.amount` where `status` in `paid, partially_refunded, refunded` at `paidAt` |
| Refunds | Sum of processed `RefundRequest.amount` |
| Net revenue | Gross minus refunds (INR; other currencies reported separately) |
| MRR | Sum of monthly-normalized price of `active` and `trialing`-paid subscriptions |
| Churn (monthly) | Subscriptions `cancelled` or `expired` in month / active at month start |
| Paid conversion | Users with first paid purchase in window / users registered in window |
| AI success rate | `AIGenerationLog.status = ok` / all attempts |
| Cache hit rate | Q&A requests served from `AIQuestionAnswer` / total Q&A requests |
| Notification acceptance rate | Provider-accepted (`sent`) / attempted. **Label as acceptance, not delivery** |

---

## 12. Testing and acceptance

**Backend (node --test):** for every new route: 401 unauthenticated, 403 wrong permission, 200 allowed, validation errors, audit event written, no secret in response, pagination limit cap. Include the last-super-admin and self-escalation tests.
**Frontend:** role-by-role smoke test for all six profiles (direct URL access to forbidden pages shows an access message, not a blank shell), light and dark mode, widths 375 / 768 / 1280 / 1920.
**Load/bounds:** users list, audit list, payments list with 100k seeded docs under 500 ms p95 with indexes; CSV export streaming.
**Worker:** kill the worker, verify heartbeat alert triggers; restart, verify queues drain without duplicates.
**Webhook:** duplicate event, out-of-order event, failed processing, signature failure.

---

## 13. Owner decisions: recommended defaults (override any)

| Decision | Default |
|---|---|
| Instructor role | Not now. Admin-only content creation |
| AI-generated course publishing | **Human review required** before first publish |
| Roadmap editing | Admin can flag and regenerate, not hand-edit |
| Refund approval | Finance decides; amounts above Rs 5,000 need a second approver |
| Role grants to super_admin | Second super admin must approve |
| Admin MFA | Required (TOTP) for all admin profiles |
| Re-auth for sensitive actions | Yes (role change, refund, export, setting change, mass send) |
| Support PII | Masked by default, reveal logs an audit event |
| Announcement scheduling | Yes, with cancel and delivery report |
| Saved views | Personal by default, optional share with team |
| Retention: OTPs | Existing TTL (expiry) |
| Retention: notifications | 180 days (keep billing and security 2 years) |
| Retention: AIGenerationLog | 90 days |
| Retention: AI Q&A asks | 180 days |
| Retention: audit logs | 2 years minimum (no auto-delete) |
| Retention: payments/refunds | Keep (financial record), anonymize user link on deletion |
| Account deletion | Anonymize, do not hard-delete financial data |
| Push provider | Standard Web Push; **VERIFY** if OneSignal is actually active |
| Currency | INR primary; show currency on every amount |
| Stripe | Treat as future; do not build UI for it |
| Invoices/GST | Out of scope until the business confirms a legal requirement |
| Dashboard default range | Last 7 days |
| Mobile | Support and finance workflows must work at 375px; course editor can be desktop-first |

---

## 14. Build roadmap (phases with acceptance criteria)

**Phase 0: Foundation (1 week)**
Build shared components (Section 4), `StatusBadge` map, `DataTable`/`FilterBar` refactor with URL state, server-side `SavedView`. Migrate Users page to the shared table. *Accepted when:* Users page uses only shared components and local views can be imported.

**Phase 1: Operations and safety (highest value)**
System health page + `JobHeartbeat` + queue endpoints, webhook list, outbox view, alerts tab, integration config status; dashboard "Needs attention" and health strip; delivery log; typed settings registry; audit saved filters and `JsonDiff`. *Accepted when:* stopping the worker raises a visible alert within 15 minutes and failed webhooks are listed with linked payments.

**Phase 2: Finance and support**
Refund decision panel with evidence and SLA; payment drawer; subscriptions page; coupon bulk generation; support assignment and notes; money-safety tests. *Accepted when:* no endpoint can set payment status directly and every finance action appears in audit with a reason.

**Phase 3: Content quality**
Course status/draft/soft delete, `CourseRevision`, readiness-gated publish, AI-review flag, reviews moderation, quiz/insight/Q&A review, broken-link checker, roadmaps page. *Accepted when:* an AI-generated course cannot be published without human review and any course change can be rolled back.

**Phase 4: Communications**
Announcement scheduling/cancel/report, audience preview with consent counts, template preview/test send, batch sending in worker. *Accepted when:* a 5,000-user announcement sends in batches without blocking the API and produces a report.

**Phase 5: Security and privacy**
Admin MFA, re-auth gates, session controls, PII masking and reveal audit, privacy page, `DataRequest`, retention jobs, recycle bin.

**Phase 6: Analytics and polish**
`DailyMetric` rollups, KPI definitions implemented, cohort and funnel views, AI usage/cost page, shortcuts help dialog, full role-by-role smoke and load tests.

---

## 15. Admin control checklist (every small unit)

Legend: `[x]` exists, `[~]` partial, `[ ]` missing. Priority: **H** high, **M** medium, **L** low.

### Users and access
- [x] Search, filter, sort, paginate users (H)
- [x] Disable/enable with reason and typed confirmation (H)
- [x] Grant/revoke course access with reason (H)
- [x] Per-user feature override with reason and expiry (H)
- [x] Export selected users (audited) (H)
- [~] Saved views (browser-only) -> server-side shared (M)
- [ ] Internal notes and flags (M)
- [ ] Revoke all sessions / force logout (M)
- [ ] Resend verification email (M)
- [ ] Masked PII with reveal audit (H)
- [ ] Enrollments overview page and CSV bulk grant (M)
- [ ] User activity timeline tab (M)
- [ ] Account deletion/anonymization workflow (H)

### Admin governance
- [x] Admin profiles, invitations, role assignment (H)
- [~] Effective permission preview (H)
- [ ] Second-admin approval for super_admin grants (M)
- [ ] Last super admin protection verified by test (H)
- [ ] Admin MFA, re-auth for sensitive actions, session list (H)
- [ ] Security panel: failed logins, permission denials (M)

### Courses and content
- [x] Edit metadata, modules, lessons, resources, readiness, publish (H)
- [ ] Draft/archived status and soft delete (H)
- [ ] Revisions with compare and restore (H)
- [ ] Scheduled publish (M)
- [ ] Duplicate course (M)
- [ ] Drag-and-drop ordering with Save order (M)
- [ ] Nested content validation (quiz correctness, URL schemes, order) (H)
- [ ] Readiness gate on publish (H)
- [ ] AI-origin review flag and approval (H)
- [ ] Course preview as learner (M)
- [ ] Broken link/resource checker (M)
- [ ] Reviews moderation (hide/restore/delete) (M)
- [ ] Quiz question disable/regenerate (M)
- [ ] Lesson insight invalidate/regenerate (M)
- [ ] Q&A cache inspect/invalidate (L)
- [ ] AI roadmaps inspect/flag/regenerate (M)
- [ ] Category/taxonomy management (L)
- [ ] Featured/ordering on homepage (L)

### AI and discovery
- [x] Usage limits and discovery settings (H)
- [ ] Per-feature kill switch (H)
- [ ] Generation log: latency, failures, provider, model (H)
- [ ] Cost estimation and budget alerts (H)
- [ ] Cache hit rate view (M)
- [ ] YouTube quota diagnostics (M)
- [ ] Anomalous-usage detection (M)

### Revenue
- [x] Plan CRUD, coupon CRUD, payments list, refunds, payment issues (H)
- [~] Refund decision with evidence and SLA (H)
- [ ] Second approval above threshold (M)
- [ ] Subscriptions page with entitlement explanation (H)
- [ ] Plan price-change impact preview (M)
- [ ] Payment drawer with reconciliation re-run (H)
- [ ] Coupon usage bar, bulk generate, duplicate (M)
- [ ] Support case assignment, notes, SLA, canned replies (M)
- [ ] Financial export with `exports.finance` (M)
- [ ] Revenue reconciliation report (M)
- [ ] Invoices/GST (L, pending owner decision)

### Communications
- [x] Templates, announcements, in-app/email/push (H)
- [ ] Template preview, test send, placeholder validation (H)
- [ ] Audience preview with consent counts (H)
- [ ] Schedule, cancel, delivery report (H)
- [ ] Batch sending in worker (H)
- [ ] Delivery log with retry (H)
- [ ] Push subscription health (aggregate, no keys) (M)
- [ ] Template version history (L)

### System and operations
- [x] Overview metrics, alerts with acknowledge (H)
- [ ] Worker heartbeat and queue gauges (H)
- [ ] Webhook event list, stuck-event detection (H)
- [ ] Audit outbox backlog view (H)
- [ ] Integration configuration status (booleans only) (H)
- [ ] Build version/environment indicator (M)
- [ ] Maintenance mode with auto-expiry (M)
- [ ] Alert routing (who is notified) (M)
- [ ] Release verification result display (L)

### Settings, audit, privacy
- [~] Settings page (typed registry, sensitivity levels, reset to default) (H)
- [x] Audit viewer (H)
- [ ] Audit JsonDiff, saved filters, export (M)
- [ ] Retention matrix and enforcement jobs (H)
- [ ] Data requests queue (M)
- [ ] Recycle bin with restore (M)

### Admin experience
- [x] Command palette, sidebar, theme, density, column chooser (H)
- [ ] Shortcuts help dialog (`?`) (L)
- [ ] Per-role dashboard variants (M)
- [ ] Recently viewed and pinned items (L)
- [ ] Optimistic updates with Undo toast on reversible actions (M)

---

## 16. Prompts to give the building AI (copy and paste)

**Phase 0**
> Read ADMIN_PANEL_DESIGN_SYSTEM.md and BUDDYFORSTUDY_ADMIN_MASTER_SPEC.md fully. Implement Phase 0: build `DataTable`, `FilterBar`, `SavedViews` (server-side), `DetailDrawer`, `TypedConfirmDialog`, `StatusBadge` (mapping in spec 4.1), `MoneyCell`, `PiiCell` in `src/components/admin/`, reusing `AdminUI.tsx` and `admin-design-system.css`. Add the `SavedView` model and `/api/admin/saved-views` routes with permission checks and tests. Refactor `AdminUsersPro.tsx` to use them without losing any current behavior. Output complete files and list the Definition of Done items you verified.

**Phase 1**
> Read both spec files. Implement spec section 5.12 System health: `JobHeartbeat` model updated by `server/src/jobs/worker.js`, endpoints `/system/overview`, `/system/queues`, `/webhooks`, outbox view, alerts tab, and the `/admin/system` page with HealthTiles and QueueGauges. Config status must return booleans only. Add backend tests for 401/403/200 and secret-leak checks. Then update the dashboard with the "Needs attention" list and health strip (5.1).

**Phase 2**
> Read both spec files. Implement 5.10 refunds decision panel (evidence, SLA, amount cap, second-approver threshold from a typed setting), the payment drawer with reconciliation re-run, and 5.9 subscriptions page. No endpoint may accept a client-supplied payment status. Add audit events and tests for each action.

**Phase 3**
> Read both spec files. Implement course `status`, soft delete, `CourseRevision` with compare/restore, readiness-gated publish, and AI-origin review gate (5.5, 6.1, 8.2, 8.3). Provide a migration script mapping `isPublished` to `status` that is idempotent and reversible. Implement `/admin/reviews` moderation (5.6).

**Phase 4**
> Read both spec files. Extend `Announcement` with schedule/cancel/report states (8.4), add audience preview with consent counts, batch sending in the worker, `/admin/deliveries` with safe retry, and template preview/test send (5.11).

**Audit any page**
> Read both spec files. Audit `<file path>` against spec sections 0, 4, 9, 10 and the Definition of Done. Return a table: violation, location, rule, fix. Then output the corrected files.

---

## 17. Definition of Done (additions to the design-system checklist)

- [ ] Backend route has auth + admin + specific permission, Zod validation, and a test for 401/403/200
- [ ] Sensitive action requires reason, typed confirmation where specified, and writes a redacted audit event
- [ ] No secrets, OTPs, push keys or full push endpoints appear in any response, table, export or audit payload
- [ ] List endpoint is paginated (limit cap 100), server-sorted with allowlist, indexed for its filters
- [ ] Filters, sort, page and drawer id are in the URL
- [ ] All statuses use the `StatusBadge` mapping with a text label
- [ ] Money uses `MoneyCell` with currency; dates use `RelativeTime` with exact tooltip
- [ ] PII is masked for roles that should not see it, with reveal audit
- [ ] Loading, refreshing, empty, no-results, error, partial-failure and permission-denied states exist
- [ ] Works at 375, 768, 1280, 1920 in light and dark mode; keyboard-only operable
- [ ] No direct edit of payment/refund/subscription status; transitions are server-validated
- [ ] Migrations are idempotent, and new indexes are listed for deployment verification
- [ ] Reuses shared components; no new one-off table, modal or button styles

> **Final instruction to the AI:** When a request touches money, access, deletion or personal data, choose the safer behavior: server-enforced, reasoned, confirmed and audited. When in doubt, ask for no permission and follow this file.

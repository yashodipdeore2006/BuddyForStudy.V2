# Admin Roles & Permissions — Scope and Delivery Plan

- Repository: `yashodipdeore2006/BuddyForStudy.V2`
- Implementation branch: `test` only. Never commit these changes to `main`.
- Product constraint: retain one shared login flow and the existing Student (`user`) / Administrator (`admin`) top-level account roles.
- Architecture: six administrator role profiles are permission bundles assigned to administrator accounts. They are not six separate authentication systems.

## Outcomes

1. Enforce least-privilege authorization on the server for every admin API.
2. Keep the existing admin dashboard and route structure; show modules/actions only when the current profile permits them.
3. Make role assignment auditable and restricted to Super Admin.
4. Keep learner APIs, course progress, AI learning generation, and payment-provider behavior backward-compatible.
5. Add tests for role-permission policy, denied requests, and route coverage before enabling profile assignment in production.

## Role scope

### 1. Super Admin (`super_admin`)
**Purpose:** platform ownership, security, emergency recovery and governance.
- Full access to all admin modules.
- Manage administrator role profiles and per-admin permissions.
- Manage platform-wide security/integration settings and operational incidents.
- Review audit logs and sensitive finance/support activity.
- Approve high-impact changes such as role escalation and sensitive global configuration.
- Cannot be removed/demoted by another administrator; protect against removing the last active Super Admin.
**Explicit controls:** sensitive changes require audit events; never expose secrets in settings responses or logs; no self-escalation endpoint.

### 2. Platform Administrator (`platform_admin`)
**Purpose:** routine product operations.
- View overview, user directory and user details.
- Activate/deactivate accounts under policy; manage course metadata, curriculum and publication.
- Send approved platform communications and announcements.
- View operational health and basic analytics.
- No role assignment, security secrets, refund execution, or subscription pricing changes by default.

### 3. AI & Learning Content Manager (`ai_content_manager`)
**Purpose:** quality and governance of AI-assisted learning.
- Manage courses, curriculum, learning resources and course readiness.
- Manage AI prompts/configuration, AI-generated and curated learning paths, resource discovery rules, YouTube selection limits and quality controls.
- Review generation failures and resource quality metrics.
- Cannot change billing, issue refunds, manage administrator accounts or alter global security settings.
- AI usage limits and provider keys must be separated: may tune safe operational limits, but cannot read/write provider secrets.

### 4. Finance & Subscription Manager (`finance_manager`)
**Purpose:** subscription and payment operations.
- Read plans, pricing, coupons, payments and refund requests.
- Create/update subscription plans and coupons.
- Review reconciliation and payment reports; process/approve refunds only through the existing validated refund workflow.
- Investigate payment status and payment provider/webhook outcomes.
- Cannot edit course content, AI prompts, user security settings, or admin roles.
- Refund decisions and status transitions must be audited.

### 5. Support Manager (`support_manager`)
**Purpose:** resolve learner access and payment-benefit issues.
- Read limited user/account context needed for support.
- View payment issue reports and their status; add internal notes and transition reports through allowed support statuses.
- Investigate failed/stuck transactions and missing purchased course/plan benefits.
- May not execute refunds unless explicitly granted a separate refund permission.
- Must not see password hashes, authentication tokens, provider secrets, or unnecessary payment data.

### 6. Analyst & Auditor (`analyst_auditor`)
**Purpose:** read-only measurement and compliance.
- Read approved aggregate analytics, operational reports, and audit logs.
- Inspect audit metadata needed to investigate changes.
- No create/update/delete actions, role changes, course publication, communications sending, or refund execution.
- Reports should minimize personal data and avoid secrets.

## Permission catalogue

- `dashboard.read`
- `users.read`, `users.manage`
- `courses.read`, `courses.manage`, `courses.publish`
- `ai.manage`, `resources.manage`
- `analytics.read`
- `plans.read`, `plans.manage`
- `billing.read`, `refunds.manage`
- `payment_issues.manage`
- `communications.send`, `communications.manage`
- `coupons.read`, `coupons.manage`
- `settings.read`, `settings.manage`
- `audit.read`
- `operations.read`, `operations.manage`
- `admin_roles.manage`

A permission is checked on the backend for every protected endpoint. Frontend visibility is convenience only and never the security boundary. Unknown permissions and unknown admin profiles fail closed.

## Endpoint-to-permission mapping

| Existing admin capability | Required permission |
| --- | --- |
| Overview | `dashboard.read` |
| Users list/details/course access | `users.read`; grants/revokes/status changes require `users.manage` |
| Courses list/details/readiness | `courses.read` |
| Course edit/modules/lessons/resources | `courses.manage` |
| Publish/unpublish course | `courses.publish` |
| Plans list | `plans.read` |
| Create/update plans | `plans.manage` |
| Payments/refunds list | `billing.read` |
| Refund status/decision updates | `refunds.manage` |
| Payment issue queue/updates | `payment_issues.manage` |
| Notification delivery queue/retry | `operations.read` / `operations.manage` |
| Send email/notifications/announcements | `communications.send` |
| Message templates | `communications.manage` |
| Coupons list/create/update | `coupons.read` / `coupons.manage` |
| Settings read/update/delete | `settings.read` / `settings.manage` |
| Audit logs | `audit.read` |
| Analytics | `analytics.read` |
| Health/operational alerts | `operations.read` / `operations.manage` |

## Delivery phases

### Phase A — Policy and server enforcement (started)
- Add named role profiles and permission bundles.
- Add an explicit admin role profile to the User model, preserving `role: user|admin`.
- Attach the stored profile to authenticated requests.
- Enforce a permission check on every existing admin route, including the legacy router.
- Add pure policy tests and retain the current admin middleware regression tests.
- Legacy admins default to `platform_admin`; bootstrap the initial owner explicitly with `ADMIN_ROLE=super_admin`.
- To assign the first Super Admin to an existing admin without resetting its password, set `ADMIN_EMAIL` and `ADMIN_ROLE=super_admin` in the server environment and run `npm run set-admin-role` from `server/`. The script refuses unknown profiles and protects the last active Super Admin. Never commit real environment values.

### Phase B — Admin identity and role assignment
- Add a Super Admin-only administrator directory and role assignment endpoints.
- Prevent role changes for non-admin accounts through this endpoint, self-escalation, self-demotion where it would remove the last Super Admin, and demotion/deactivation of the last active Super Admin.
- Record actor, target, previous role and new role in audit logs.
- Add admin invite/activation workflow rather than letting normal users self-select an admin profile.

### Phase C — Permission-aware UI
- Fetch the current administrator profile and effective permissions from the backend.
- Filter navigation links and action controls based on permissions.
- Add an Access Denied state for direct navigation and preserve the shared login.
- Never trust frontend permission checks without the server middleware.

### Phase D — Domain-specific consoles
- AI & Learning Content: prompt/version management, resource discovery limits, curriculum QA and generation failures.
- Finance: plan/coupon management, payment reconciliation and audited refund actions.
- Support: payment issue queue, internal notes, missing-benefit investigations and escalation.
- Analyst: aggregate reports, audit search and export with personal-data minimization.

### Phase E — Security hardening and release
- Expand tests across all route groups and role profiles.
- Test direct API calls with every role, not just navigation visibility.
- Audit every high-impact mutation; redact secrets and tokens.
- Verify last-Super-Admin safeguards, inactive admin denial, and unknown role denial.
- Run backend tests, server syntax checks, frontend typecheck and production build; then perform deployed-browser smoke tests.

## Rollout and acceptance criteria

- Existing users remain `user`; existing admin login remains the same.
- No user can choose an admin role at signup/login.
- Every admin route has a declared permission and unknown/missing permissions are denied.
- Platform/AI/Finance/Support/Analyst profiles cannot cross their boundaries by calling APIs directly.
- Super Admin is the only profile allowed to assign administrator profiles.
- Role assignment and sensitive actions are auditable.
- All CI jobs pass on the final `test` branch head; `main` remains untouched.


## Implementation status — 2026-10-18

### Implemented on `test`
- Six administrator role profiles and the permission catalogue, with backend checks on both admin routers.
- Super Admin role-profile assignment for existing administrator accounts, audit events, self-role-change protection and last-active-Super-Admin protection.
- Permission-aware admin navigation and dashboard sections, including role-scoped overview data.
- Finance UI action gates for plan and coupon mutations; billing/refund console is limited to refund-capable administrators.
- Dedicated AI & Learning Content console for AI generation limits and YouTube discovery settings. The discovery service now consumes the configured module cap, per-query result count, global duration bounds, Shorts policy and embedding policy.
- Dedicated Support Cases console for payment/access issue investigation and status updates. The note field is explicitly a learner-visible update, not an internal-only note.
- Read-only platform settings views no longer return setting values to administrators without `settings.manage`.
- Regression tests cover role profiles and permission boundaries.

### Still outstanding before calling the admin system production-complete
- Admin invitation/provisioning UI and an approved account activation/password setup workflow. Current role assignment changes profiles for accounts that are already administrators.
- Automated integration tests that exercise every admin endpoint with all six profiles against a test database.
- Browser smoke tests for each role, including mobile navigation and direct URL access.
- Review the existing generic platform-setting catalogue for any additional values that should be hidden even from read-only metadata viewers.
- Verify AI setting values against production usage/cost limits and confirm YouTube API quota behavior before enabling high search-result caps.
- Final deployed environment smoke test and security review.

### Current verification
- Backend unit tests and JavaScript syntax checks pass on the recent CI run for this implementation.
- Frontend typecheck and build are being re-run after the latest permission-aware UI changes; do not mark the final branch head fully verified until that workflow finishes successfully.

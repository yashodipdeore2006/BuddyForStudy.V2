# Free Trial Campaigns & Subscription Conversion — Implementation Plan

## Goal
Allow eligible new or selected learners to receive a time-limited premium trial, optionally converting to a paid recurring subscription only after the learner explicitly authorizes recurring payments with the payment provider.

## Product decisions
1. **Two trial paths**
   - **Self-serve trial:** a public/admin-configured offer can be shown to eligible new users. The user reviews the trial duration, renewal price/interval, and cancellation terms.
   - **Admin-granted trial:** an authorized administrator selects an audience using filters and previews the exact eligible learners before granting a trial.
2. **No silent autopay.** Admins may configure a trial to offer conversion, but cannot enroll a user in recurring billing without that user's affirmative consent and provider-hosted authorization/mandate flow. A trial without a valid mandate expires to the free/default plan; it must not charge.
3. **One active subscription/trial per user.** Prevent duplicate grants and duplicate provider subscriptions. Trial history prevents repeat abuse according to campaign eligibility.
4. **Auditable, reversible operations.** Preview → confirm, actor/reason audit events, idempotency keys, and immutable grant records.
5. **Plan snapshot.** Trial stores the target paid plan and price/currency/interval snapshot so later plan edits do not silently change the disclosed offer.
6. **Explicit disclosure.** Before any provider checkout, show trial end date, exact renewal amount and interval, when the first charge is expected, how to cancel, and that the user may decline autopay.
7. **Provider is source of truth for payments.** Razorpay webhooks/provider reconciliation activate paid subscriptions. Never mark a subscription as paid merely because a trial was granted.

## Admin audience filters
- Account creation date range / account age
- Email verified, active account
- Role (ordinary users only by default; never admins)
- Auth provider (local / Google)
- Existing subscription status (none, expired, cancelled; exclude active/trialing/past_due by default)
- Prior trial history (never had a trial by default)
- Optional explicit user IDs for support exceptions
- Limit batch size; preview count and sample recipients before execution.

## Campaign configuration
- Name, internal reason, enabled state
- Audience filters
- Trial duration (1–30 days by default; configurable cap)
- Entitlement plan (trial feature plan) and optional paid conversion plan
- Conversion mode: no autopay or consent required
- Campaign start/end, maximum grants, per-user eligibility, and grant limits
- Admin-facing preview with eligible/skipped reasons; apply requires confirmation.

## Learner experience
- Trial status and remaining time in Billing/Profile
- Clear “Trial ends on …” notice and paid renewal terms
- If conversion is configured, explicit “Continue with paid plan” action that opens provider checkout/mandate authorization
- Cancellation/decline is available before the end date; cancellation prevents renewal
- Notifications before expiry (recommended 3 days and 1 day), at expiry, and after successful/failed renewal
- Trial expires deterministically; no mandate means no charge and default/free entitlement resumes.

## Data model
- TrialCampaign: configuration, filters, status, grant cap, conversion plan, audit actor and timestamps.
- TrialGrant: user, campaign, trial plan snapshot, start/end, status, conversion consent state, provider subscription ID, actor/reason, idempotency key. Unique grant per campaign/user and index on status/end date.
- Reuse UserSubscription for effective entitlements where safe, extending it with trial/campaign references and conversion-consent metadata only if needed.
- Never store card details, UPI PINs, mandate secrets, or payment credentials.

## API / authorization
- Admin endpoints guarded by authMiddleware, adminMiddleware, and dedicated permission trials.manage (read/preview/apply separated where possible):
  - list campaigns and recent grants
  - create/update/disable campaign
  - preview audience
  - apply preview with idempotency + reason
  - inspect grant/audit state
- Learner endpoints require auth:
  - get current trial and eligibility
  - accept/decline a trial offer
  - initiate provider subscription authorization only after user consent
  - cancel trial conversion before renewal
- Webhook and reconciliation transitions remain idempotent and provider-verified.

## Rollout phases
1. **Plan & inventory:** map current subscription plan, entitlement, admin permissions, billing and provider flows.
2. **Campaign core:** schema, filter validation, audience preview, grant/apply endpoint, audit events, duplicate prevention.
3. **Admin UI:** trial campaign list/create, audience filters, preview/skipped reasons, confirmation and grant history.
4. **Learner trial visibility:** billing status, trial countdown and expiry behavior.
5. **Consent-based conversion:** provider subscription authorization, clear renewal disclosures, webhook reconciliation, cancel/decline.
6. **Hardening:** tests for role isolation, invalid filters, duplicate/idempotent grants, expired previews, active subscription exclusion, missing mandate, provider failures and audit logging.

## Acceptance criteria
- An admin cannot grant trials without the relevant permission.
- Preview is non-mutating and displays exact match/skip counts.
- Apply cannot exceed configured campaign cap or grant duplicate trials.
- Admins cannot target admin accounts through ordinary audience filters.
- A trial grant never triggers a charge by itself.
- No recurring charge is possible without an explicit learner-approved provider mandate.
- A user with no mandate is not auto-converted or charged at trial expiry.
- Trial expiry and entitlement behavior are consistent on API reads, not only UI.
- Billing status comes from verified provider events/reconciliation.
- Every grant is traceable to campaign, actor, reason, and timestamps.

## Current implementation boundary
Existing code already has SubscriptionPlan.trialDays, UserSubscription.status = trialing, a Razorpay subscription flow, and an admin subscriptions ledger. These are not sufficient for safe audience campaigns or consented trial-to-paid conversion by themselves. Do not treat trialDays as proof of a working end-to-end trial/autopay flow.

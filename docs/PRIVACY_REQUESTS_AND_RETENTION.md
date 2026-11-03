# Account Data Requests, Deletion & Retention — Proposed Operational Policy

**Status (2026-11-03): PARTIAL IMPLEMENTATION, CI-VERIFIED.** Authenticated JSON export, authenticated correction/deletion request intake, learner-owned request history, and permission-gated administrator review are implemented as APIs. This document does not claim that account deletion/anonymization, an approved retention schedule, backup expiry, or a retention scheduler exists.


## Implemented API surface (partial)

- `GET /api/me/data-export` returns a versioned JSON export for the authenticated account. It uses requester-scoped database queries and excludes passwords, authentication tokens, OTPs, provider credentials, private delivery internals, push endpoints/keys, and internal administrator notes.
- `POST /api/me/privacy-requests` accepts an authenticated correction or deletion request. Duplicate active requests of the same type are returned rather than duplicated.
- `GET /api/me/privacy-requests` returns only the authenticated learner's request history.
- `GET /api/admin/privacy-requests` and `PUT /api/admin/privacy-requests/:requestId` provide a paginated review queue and audited status updates. These are restricted to the `privacy.requests.manage` permission, granted by default only to Super Admin and Platform Administrator roles.
- Denial releases the active-request uniqueness slot so a learner may submit a new request. An appeal must reacquire the slot and conflicts safely with any other active request of the same type. Failed audit persistence restores the prior status/slot state.

The export identifies itself as partial repository coverage. It does not include lesson notes held only in browser local storage, provider-side records, infrastructure logs or backups. It is not yet certified as an exhaustive legal export.

**Critical safety boundary:** The request API does not delete or anonymize accounts or records. Administrators cannot mark a request fulfilled through this endpoint. A deletion request can be reviewed, placed on legal hold, approved, or moved into manual progress, but no irreversible data mutation is performed. Do not represent a request as fulfilled until the category-level retention/legal decisions, execution controls, backup expiry, retries and independent verification have been implemented and approved.

## Verification evidence

The requester-scoped export, owner-only request history, duplicate-intake guard, identity-verification gate, permission boundary, audit persistence, denied-request resubmission and route integration are covered by the MongoDB-backed backend tests and the full CI run for commit `9ab25628` ([CI 41599233495](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/41599233495)). This evidence validates the implemented API scope only; it does not certify legal completeness or prove account deletion.

## Purpose

Define a reviewable process for access/correction/export/deletion requests and prevent irreversible deletion of records that must be retained for security, financial reconciliation, audits, or legal obligations.

## Intake and identity verification

1. Accept requests through the published Contact/support channel until a dedicated authenticated request workflow is implemented.
2. Create a restricted support case with a request ID, received timestamp, requester account ID when verified, request scope, status, assigned owner, and due date. Do not place the user's password, access token, full payment credential, or OTP in the case.
3. Verify control of the account with an authenticated session or a documented alternative verification procedure. Do not send account data to an unverified email address just because it appears in the message.
4. Acknowledge receipt, explain the scope and estimated next update, and record all access to exported data.
5. Escalate legal, disputed ownership, safety, fraud, or legal-hold cases to the designated privacy/legal owner before any destructive operation.

## Scope to inventory before fulfilling

The implementation owner must identify and classify: account/profile fields, OAuth identity links, consent events, course enrolments, quiz/progress/achievement records, reviews, saved courses, learning roadmaps, notification preferences/subscriptions, support/communication records, payment/subscription/refund/ledger records, security/audit events, uploaded/generated content, and backups/logs. The current system does not document a single atomic “delete user and all associated data” routine.

## Export and correction

- Generate an authenticated export only after verifying the requester and authorizing the requester to access every included record.
- Use a documented machine-readable format and state the included categories and date generated.
- Exclude credentials, password hashes, tokens, one-time codes, provider secrets, other users' data, and internal security details.
- Route correction requests to the owning service; retain an audit trail of the change without duplicating unnecessary personal content.

## Deletion, anonymization, and legal holds

1. Do not hard-delete a user directly from MongoDB as a support shortcut.
2. Decide and document per data category whether it can be deleted, must be retained for a defined period, or must be anonymized/pseudonymized. Payment and refund records, consent evidence, audit/security events, course records, and legal holds may have different requirements.
3. Before execution, determine whether account access should be disabled immediately and invalidate active sessions. Preserve minimum records needed for payment/refund reconciliation, security investigations, disputes, and any applicable legal hold.
4. Execute a reviewed, idempotent deletion/anonymization job with dry-run mode, count preview, audit event, failure/retry handling, and an explicit list of completed/skipped categories.
5. Remove or rotate derived data, OAuth links, notification subscriptions, saved state, profile details and provider-side data where applicable; verify backups and logs follow a documented expiry/restore policy rather than promising immediate physical erasure from every backup.
6. Independently verify post-operation state and provide the requester a completion summary that does not disclose restricted retained data.

## Required product/operational decisions before launch

- Name a privacy/data-request owner and backup, plus approval authority for legal holds.
- Define request SLA, escalation, and proof-of-identity standard.
- Approve per-category retention periods and legal basis with qualified counsel.
- Implement a request tracker with statuses: received, identity pending, in review, legal hold, approved, in progress, partially fulfilled, fulfilled, denied, and appealed.
- Build and test authenticated export, correction, deletion/anonymization orchestration, audit evidence, recovery/retry, and backup expiry.
- Publish truthful policy text that matches the actual workflow and approved retention periods.
- Test ownership isolation, admin permissions, duplicate/replayed requests, concurrent payment/refund events, partial failures, and data restored from backup.

## Release gate

**Not release-complete:** Until the runtime request workflow, retention schedule, approval/ownership, and failure/retry verification exist, treat account export/deletion/retention as an open privacy risk. Do not claim automated deletion or a fixed retention period solely because a generic contact route or policy paragraph exists.

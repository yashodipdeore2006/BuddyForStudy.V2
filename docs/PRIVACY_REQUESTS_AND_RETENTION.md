# Account Data Requests, Deletion & Retention — Proposed Operational Policy

**Status:** Proposed procedure only; the repository currently does not implement an end-to-end user export/deletion request workflow. This document does not claim that self-service deletion, automated export, or a retention scheduler exists.

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

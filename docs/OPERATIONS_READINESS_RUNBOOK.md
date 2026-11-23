# Operations Readiness Runbook — V2.2

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Execution branch:** `buddy-for-study-v2.2`  
**Scope:** pre-release environment verification, evidence capture, incident readiness and rollback  
**Rule:** this document does not authorize a deployment, provider change, secret rotation, paid hosting change, DNS change, or branch-protection change.

## 1. Release posture and evidence rules

A green repository CI run proves that the checked code and automated tests passed for that commit. It does **not** prove DNS ownership, TLS configuration, provider connectivity, live email delivery, API quota, worker execution on the host, backups, a successful restore, or a rollback rehearsal.

Record evidence against the exact candidate SHA and a named environment. Do not copy secret values, JWTs, webhook signatures, database connection strings, private keys, or personal learner data into workflow logs, screenshots, issues, or this runbook.

Use these result labels:

- **PASS** — current evidence exists for the exact SHA and the named environment.
- **FAIL** — a check was attempted and did not meet its acceptance condition.
- **BLOCKED** — an external dependency, decision, access grant, or rehearsal is still missing.
- **UNVERIFIED** — no current evidence was available; do not infer success from configuration files or an old run.
- **N/A (approved)** — an explicitly approved product/environment decision makes the check unnecessary; record who approved it and why.

A repository file containing an environment-variable name is not evidence that a provider value is configured. A health response saying MongoDB is connected is not evidence that backups exist or can be restored.

## 2. Current repository-known deployment posture

These are facts read from the V2.2 candidate configuration and project documentation. They are **not** live-provider verification:

| Area | Repository evidence | Release interpretation |
|---|---|---|
| API hosting | `render.yaml` declares `buddyforstudy-api` as a Render Free web service in Singapore | Free instances can sleep; not an always-on production baseline |
| Frontend hosting | `render.yaml` declares `buddyforstudy-web` as a static site | Build and SPA routing are configured; custom-domain DNS/TLS still need live verification |
| Worker | API uses `BACKGROUND_WORKER_MODE=inline`; no standalone worker is declared in the blueprint | Inline jobs are best-effort and share the API process lifecycle |
| Payments | Blueprint has `PAYMENTS_ENABLED=false` | New paid checkout remains disabled; do not change this without explicit release approval |
| MongoDB | Runtime variable is externally supplied | TLS, replica-set capabilities, backup schedule and restore are not proven by source |
| Email | SMTP values are externally supplied | Provider reachability and delivery have not been proven; host plan restrictions matter |
| AI / YouTube | Gemini and YouTube keys are externally supplied; feature flags default off | API availability, quota, project restrictions and result quality require staging checks |
| Privacy | Export and request-review APIs are partial; deletion/anonymization and approved retention automation are absent | Open release blocker; do not tell learners deletion has been completed automatically |
| Recovery | No verified backup-restore or rollback rehearsal evidence is recorded here | Open release blocker |

Render Free web services spin down after inactivity and may take time to wake. Render documents its Free web services as unsuitable for production workloads and blocks outbound SMTP on ports 25, 465 and 587. Do not treat the current Free API configuration as a production-grade always-on deployment. Confirm current provider restrictions before selecting an email transport or hosting plan.

## 3. Read-only staging smoke workflow

The manual workflow is `.github/workflows/staging-verification.yml`. It is designed for **GET-only checks** against independently deployed staging services. It does not deploy, write to MongoDB, create a Razorpay order, send a test email, mutate provider settings, or change application data.

### 3.1 Configure the GitHub staging environment

Before dispatching the workflow, create/configure the GitHub repository environment named `staging`. Do not assume a referenced but unconfigured environment has protection rules, reviewers, variables, or secrets. Configure any environment-level branch restrictions/review requirements that are available and appropriate for the repository.

Set these **environment variables**:

| Name | Required | Value |
|---|---:|---|
| `STAGING_API_URL` | Yes | Actual staging API HTTPS origin, with no path, query or trailing slash |
| `STAGING_FRONTEND_URL` | Yes | Actual staging frontend HTTPS origin, with no path, query or trailing slash |
| `STAGING_BACKGROUND_WORKER_MODE` | Yes | Exact configured mode: `inline`, `standalone`, or `disabled` |
| `STAGING_GOOGLE_CLIENT_ID` | Conditional | Expected staging OAuth Web Client ID when Google Sign-In is enabled and part of staging acceptance |

Set this **environment secret**:

| Name | Required | Handling |
|---|---:|---|
| `STAGING_OPERATIONS_ADMIN_TOKEN` | Yes | Short-lived staging administrator JWT. Provide it through the environment secret store only; never put it in YAML, repository files, command output, screenshots or this document. |

The token must authenticate an active staging user whose database role is `admin` and whose JWT has `accessType: "admin"`. Use a staging account, not a production administrator. Issue/obtain it through the approved secure operator process, give it the minimum useful lifetime, and revoke/expire it after the check. The workflow does not create, refresh, or revoke tokens.

If Google Sign-In is intentionally out of scope in staging, leave `STAGING_GOOGLE_CLIENT_ID` unset and separately record the approved N/A decision. If supplied, the verifier requires the API endpoint to report Google Sign-In enabled with exactly that client ID.

### 3.2 Dispatch

1. Open GitHub Actions → **Staging operations verification**.
2. Select **Run workflow** and choose `buddy-for-study-v2.2`.
3. Confirm the environment variables point to staging—not production—and the temporary admin token is present in the `staging` environment secret.
4. Dispatch the workflow.
5. Review the run result and its exact `head_sha`. A successful run checks API liveness/readiness, CORS, billing-plan and Google-config endpoint shape, authenticated worker/lease health, and frontend SPA routes.
6. Remove or rotate the temporary staging token after the run and record only redacted evidence.

The verifier performs GET requests only. It retries bounded transient network/408/425/5xx failures. It does not treat a successful API response as proof of email, AI, YouTube, payment-provider or backup functionality.

### 3.3 Local invocation

For a fully authenticated operational check, run from `server/` with the same values held in a secure shell/session:

```bash
npm ci
DEPLOYMENT_URL="https://<staging-api-origin>" \
FRONTEND_DEPLOYMENT_URL="https://<staging-frontend-origin>" \
EXPECTED_BACKGROUND_WORKER_MODE="inline" \
OPERATIONS_ADMIN_TOKEN="<temporary-staging-admin-jwt>" \
REQUIRE_OPERATIONS_HEALTH="true" \
node src/scripts/verifyDeployment.js
```

Do not paste real tokens into shell history or shared terminals. Prefer the GitHub environment-backed workflow.

## 4. Environment, DNS, TLS, CORS and OAuth

For every environment, verify and record:

- API and frontend hostnames resolve to the intended provider targets. Confirm apex and `www` behavior if both are published.
- Provider domain verification is complete; HTTPS certificate is valid, hostname-matched, not expired, and HTTP redirects to HTTPS.
- Frontend build variable `VITE_API_URL` equals the public API origin. `VITE_PUBLIC_SITE_URL` equals the canonical frontend origin. These values are public and embedded at build time; a change requires a frontend rebuild.
- Backend `CLIENT_URL` is the exact frontend origin used for production/staging CORS and redirects; `API_URL` is the API origin.
- Browser preflight from the real frontend origin succeeds for required API headers/methods. Do not use wildcard CORS as a shortcut.
- For Google Sign-In, `VITE_GOOGLE_CLIENT_ID` matches API `GOOGLE_CLIENT_ID`; the Google OAuth Web Client has the exact frontend JavaScript origin. Redirect URIs, if used by any configured flow, must match the provider registration.
- If OAuth is intentionally disabled, record it as an explicit staging/launch scope decision rather than marking OAuth verification as passed.

The smoke verifier checks the readiness response's `Access-Control-Allow-Origin` and can assert the expected Google client ID. Provider-console DNS/OAuth settings remain manual checks.

## 5. MongoDB and persistence

Verify using a least-privilege staging database identity:

- `MONGO_URI` targets the intended database and requires TLS; never reveal the URI in evidence.
- The target MongoDB deployment supports the multi-document transactions used for trial campaign claims and lifecycle transitions (replica set or sharded cluster).
- Required indexes have been created successfully after deployment. Review index-build logs and duplicate-key errors.
- API readiness returns connected, and application logs do not contain sustained connection/authentication/time-out failures.
- Automated backups/snapshots and point-in-time recovery (where purchased/configured) have a documented schedule, retention window, encryption/access boundary, and named owner.
- Restore a recent backup into an **isolated non-production database**. Verify collections/indexes, record counts or approved integrity checks, application connectivity, and a documented recovery point/time. Do not test restore over the live database.
- Record backup age, restore point, duration, operator and evidence location without exposing records or credentials.

`/api/health/ready` proves only that the application currently sees a connected MongoDB connection. It does not check transaction support, backup freshness, or restore integrity.

## 6. Email, notifications and Web Push

Check production/staging settings with the actual hosting plan in mind:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` are complete and scoped to the intended environment.
- Confirm the selected provider's documented TLS/STARTTLS port is reachable from the hosting plan. Render Free blocks outbound SMTP on ports 25, 465 and 587. Do not assume an alternate port works; confirm it with the provider and an actual deployed OTP/delivery test. If no compatible route exists, choose an explicitly approved paid host or implement/verify an HTTPS email-provider adapter. An HTTP adapter is not currently part of this code path.
- Confirm sender-domain authorization and SPF/DKIM/DMARC alignment, bounce handling and provider suppression behavior.
- Send a controlled staging email and verify receipt, OTP validation, password reset and relevant billing/trial notifications. A successful SMTP handshake alone is not a delivery test.
- If Web Push is enabled, confirm all VAPID values are present as a matching set, test subscription delivery and revocation, and keep the private key server-only.
- Verify notification outbox retry, dead-letter/failed state visibility, and alert ownership.

Do not use real learner addresses for staging without authorization. Keep email content free of secrets or sensitive data.

## 7. Gemini, YouTube and Build With AI

Using staging-only provider projects/keys:

- Confirm `GEMINI_API_KEY` and model availability for the configured `GEMINI_MODEL`; check provider quota, rate limits and billing controls.
- Confirm `YOUTUBE_API_KEY` is restricted to the intended project/API and the YouTube Data API is enabled.
- Compare `YT_DAILY_QUOTA_BUDGET` and soft/search limits with the provider's actual daily quota. Use a deliberately small staging budget.
- Exercise representative Build With AI skills, language selection, course duration/level constraints, fallback selection, timeout/quota handling, and account-level rate limits.
- Confirm the application fallback path is clear when a provider is unavailable or quota is exhausted; no test should accidentally consume production quota.
- Keep rollout flags opt-in until the relevant flow is verified, including `USE_CURATION_ENGINE_FOR_AI`, `INTENT_V2`, `ASYNC_ROADMAP`, `YT_COMBINED_SEARCH`, and compliance/trusted-channel flags.

CI's selector comparison uses deterministic mock fixtures. It is not a live Gemini or YouTube test.

## 8. Background worker and scheduler

The configured mode must match the runtime topology:

- `inline`: bounded scheduler work runs inside the API process. With a sleeping/free API host, scheduled work pauses during sleep/restart and must be treated as best-effort.
- `standalone`: a separately supervised `npm run worker` process must be deployed and monitored. Do not run standalone and inline schedulers concurrently against the same database.
- `disabled`: background work is intentionally paused. This is not automatically acceptable for a release that depends on reminders, trial expiry, maintenance, outbox processing or curation.

Check `GET /api/health/operations` through the authenticated staging workflow or Admin → Operations. Confirm:

- Worker heartbeat is recent and has the expected execution mode.
- Heartbeat status is healthy (or the intentionally approved disabled state).
- Consecutive maintenance failures are zero or have an investigated/approved explanation.
- Expected job leases are not expired.
- Scheduler logs identify the expected process/instance, and the process is supervised/restarts safely.
- Trial expiry, email/notification outbox and other required jobs complete in staging within their documented cadence.

The admin operations endpoint is protected by authentication and administrator-role middleware. The public readiness endpoint intentionally does not expose worker details.

## 9. Security, privacy and data rights

- Confirm production secrets exist only in provider secret storage; use different JWT, database, email, AI, OAuth and payment credentials for each environment.
- Confirm production `JWT_SECRET` has suitable entropy and the reverse-proxy hop count matches the actual topology.
- Confirm payment webhook endpoint/secret only if payments are enabled. With `PAYMENTS_ENABLED=false`, new checkout should remain blocked; do not remove the signature validation/reconciliation path for previously created transactions.
- Review account export scope and exclusions. Current export is explicitly partial and does not include all browser-local, provider-side, infrastructure-log or backup data.
- **Open release blocker:** account deletion/anonymization orchestration, approved category-level retention schedule, backup expiry behavior, retry/recovery and independent verification are not implemented. The privacy request API must not report a deletion request fulfilled while these controls are absent.
- Obtain qualified approval for retention/legal-hold decisions, requester identity requirements, SLAs and privacy disclosures. Record responsible privacy/data-request owner and backup.
- Review admin permissions, audit events, security alerts and access logs for any staging/production admin operations.

## 10. Monitoring, incident ownership and rollback

Before production release, name a primary and backup owner for API, frontend, database, email, AI/quota, security/privacy and release decisions.

Verify and record:

- Sentry or another error-monitoring destination is configured, events arrive from the correct environment, sensitive fields are scrubbed, and someone is on the alert route.
- Operational alerts are visible and actionable; thresholds and escalation route are documented.
- Availability, latency, 5xx rate, MongoDB errors, worker heartbeat, queue/outbox backlog, failed provider calls and quota exhaustion have dashboards or an agreed review process.
- A known-good exact release SHA and matching frontend/API deployment pair are identified.
- Rollback permissions and steps are documented, including whether a rollback also requires a frontend rollback or database compatibility action.
- A rollback rehearsal is performed in staging, followed by smoke verification and a check for data/schema compatibility.
- A post-rollback monitoring window and decision owner are assigned.

Do not assume a provider's rollback UI alone is a complete recovery plan. Retain application/database migration compatibility and independently verified backups.

## 11. Evidence register

Create one row per check. Use a restricted evidence system for screenshots/log excerpts; link to that location rather than embedding sensitive data here.

| Date/time (UTC) | Environment | Branch + exact SHA | Check | Result | Owner | Redacted evidence / ticket | Follow-up / accepted risk |
|---|---|---|---|---|---|---|---|
| 2026-11-23 | Repository CI | `buddy-for-study-v2.2` / see linked Actions run | Backend/frontend automated tests and repository release gate | PASS for recorded CI SHA | Release operator | GitHub Actions run 45159094313 | Repository verification only; not staging verification |
| Pending | Staging | Pending | Read-only deployment verifier | UNVERIFIED | Unassigned | Pending workflow run | Configure `staging` environment and staging service variables/secrets |
| Pending | Staging | Pending | DNS/TLS/CORS/OAuth + email + AI/YouTube provider checks | UNVERIFIED | Unassigned | Pending | Real provider-console and end-to-end evidence required |
| Pending | Staging | Pending | MongoDB transaction/index/backup/restore | BLOCKED | Unassigned | Pending | Configure backup policy and complete isolated restore rehearsal |
| Pending | Production | Pending | Hosting plan, worker supervision, monitoring and rollback rehearsal | BLOCKED | Unassigned | Pending | Production hosting and operating owners require approval |
| Pending | Production | Pending | Privacy retention/deletion readiness | BLOCKED | Unassigned | Pending | Implement and approve deletion/anonymization and retention workflows |

Replace pending rows only with new dated evidence. Do not mark a live check PASS based on a config file, a green unit test, or a prior candidate SHA.

## 12. Production release blockers

Production remains blocked until all relevant items have current, attributable evidence:

1. Appropriate always-on API hosting and a worker execution model that meets the product's scheduling guarantees.
2. DNS, TLS, CORS and OAuth verified on the real staging hostname.
3. MongoDB production topology, transaction/index readiness, backup policy and a successful isolated restore.
4. Real email delivery from the selected host plan, plus required AI/YouTube staging tests.
5. Worker heartbeat/leases, monitoring and external alert routing verified.
6. Approved privacy retention policy and implemented/tested deletion/anonymization workflow.
7. Branch/release governance, rollback owners, and a rehearsed recovery procedure.
8. Exact-commit CI and staging verification passed, with all accepted risks and approvals documented.

Task 29 is not complete merely because this runbook and workflow exist. Task 30 is not complete merely because the GitHub CI release gate is green. Both require the external staging and release evidence listed above.


## 13. Task 30 — final exact-SHA release approval gate

The manual workflow is `.github/workflows/final-release-gate.yml`. It is restricted to manual dispatch on `buddy-for-study-v2.2` and has read-only repository permissions.

Before dispatch:

1. Confirm the intended release candidate is the current `buddy-for-study-v2.2` branch HEAD. No other branch is accepted by this workflow.
2. Confirm the automatic **BuddyForStudy CI** workflow has a completed successful run for that exact SHA. The gate independently looks up the latest matching run and verifies that `backend`, `frontend`, and `Production release gate` are each completed successfully.
3. Configure the GitHub repository environment named `production-release` before relying on it. Add the designated release reviewer(s) as required reviewers, restrict permitted branches to the V2.2 execution branch where supported, and document the approval owner. Do not assume an environment created automatically by workflow use has protection rules.
4. Confirm the `staging` environment is configured as described in Section 3, and that the staging candidate has already been deployed by the separately approved deployment process.

Dispatch **Final release approval gate** from `buddy-for-study-v2.2`:

- The first job verifies backend/frontend/release-gate CI for the exact dispatched SHA; it fails if no successful matching run exists or a required job is not successful.
- The second job checks out that exact SHA and runs the strict, read-only staging verifier using the staging environment variables and temporary admin token.
- The final job waits for the configured `production-release` environment review. When the protected environment requirements are satisfied, the workflow records the candidate SHA, CI run link, staging result and human approval in the Actions summary.

**No deployment occurs in this workflow.** It does not change Render/Vercel settings, DNS, secrets, database contents, branch protection, or service state. A separately approved deployment procedure is required after the release decision. If the `production-release` environment has no required reviewer protection configured, a green workflow is not evidence of independent human approval.

Task 30 remains open until this workflow completes for the exact candidate, the reviewer decision is recorded, the evidence register is updated, and all unresolved blockers/accepted risks have named owners and explicit approval.
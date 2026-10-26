# BuddyForStudy.V2 — Secret Rotation and Revocation Runbook

**Applies to:** staging and production credentials used by the frontend deployment, API, background worker, database, and external providers.

## Rules before rotating

1. Assign an operator and a second reviewer. Use the provider's secret manager, never a committed `.env`, ticket, chat, screenshot, or CI echo.
2. Identify every service that consumes the value (API, worker, scheduled job, frontend build variables, webhook settings). Do not assume a shared name means the same secret is used everywhere.
3. Prefer overlap rotation when the provider supports two active credentials: issue new credential, update staging, run the smoke tests, update production, verify, then revoke old credential.
4. If no overlap is supported, schedule a controlled maintenance window, prepare the rollback value in the secret manager, and monitor failures during cutover.
5. Record the secret name/identifier, owner, rotation date, consumer services and verification result—never the value itself. Check logs and traces for accidental exposure.

## Provider-specific procedures

| Secret/configuration | Rotation and verification | Revocation / side effects |
|---|---|---|
| `JWT_SECRET` | Generate a high-entropy random value of at least 32 characters in the secret manager. Deploy to staging and verify login, authenticated API calls and logout; run `npm run validate:production-config`. | Changing the active signing secret generally invalidates existing JWTs. Plan a sign-in/session-reset window unless key overlap/rotation is explicitly implemented and tested. |
| `MONGO_URI` database credentials | Create or rotate a least-privilege application DB user with the provider's credential rotation mechanism. Update API and worker together, check TLS and the configured DB name, then run readiness and database-backed smoke tests. | Revoke the old DB user/password after all consumers use the new one. Never put URI credentials into logs or diagnostics. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Create/activate the intended live key in Razorpay; update backend secret manager only; run a controlled low-risk order/payment verification and reconcile webhook state. | Revoke the prior key after verifying orders and webhook processing. Never use `rzp_test_` in production or expose the secret to `VITE_*`. |
| `RAZORPAY_WEBHOOK_SECRET` | Update the configured endpoint secret and backend secret manager in a coordinated window; send/verify a provider test webhook and confirm signature rejection for an invalid signature. | Ensure only the intended webhook secret remains active; recheck replay and duplicate-event handling after the switch. |
| Google OAuth `GOOGLE_CLIENT_ID` | Create/configure the intended OAuth web client; update backend and frontend values together; verify authorised JavaScript origins and redirect URIs for the exact staging/production domains. | Revoke/disable obsolete clients only after sign-in and account-linking tests pass. Client IDs are public identifiers, but client secrets (if any) are not. |
| `GEMINI_API_KEY` | Issue a replacement key in the provider console; store it server-side, confirm model availability, quota/billing and one controlled generation request, then revoke the old key. | Do not log request headers or include keys in frontend bundles or prompts. |
| `YOUTUBE_API_KEY` | Create a replacement key with API and application restrictions; confirm YouTube Data API access and quota budget in staging, then update API/worker and revoke old key. | Re-check Google Cloud API restrictions and the app's own `YT_DAILY_QUOTA_BUDGET` after rotation. |
| `SMTP_PASS` / SMTP credentials | Create a replacement provider credential; verify TLS mode, sender, SPF/DKIM/DMARC and successful test email in staging; update both API and worker settings. | Revoke old credential and watch delivery failure/bounce alerts. Do not put message bodies or credentials in telemetry. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` + public key | Generate a fresh pair; deploy the matching pair on the server, confirm the public key delivered to the client, and test a browser push subscription/delivery. | Treat this as a key-pair rotation: browser subscriptions may need to be recreated if the VAPID public key changes. Keep the private key server-side only. |
| `REDIS_URL` | Rotate Redis user/password or certificate in the provider; validate TLS/auth and cache/worker health in staging; coordinate API and worker changes. | Revoke prior credential after consumers migrate. Confirm cache degradation is observable if Redis becomes unavailable. |
| `SENTRY_DSN` | If exposed or mis-scoped, create/rotate the project DSN and set appropriate environment/project restrictions; verify one test event with sanitization enabled. | Disable the old DSN and review access/retention policies. Treat DSN as operational config even though it is not equivalent to a write-capable API secret. |

## Incident-driven revocation

If a secret may have leaked: restrict the affected account/key immediately, rotate/revoke at the provider, update every consuming service, verify the exposed key no longer works, review provider/audit logs for suspicious use, inspect Git history and CI logs, and remove cached artifacts where feasible. Do not merely delete the value from the latest commit—assume any committed secret is compromised. Follow the incident-response owner's escalation process.

## Required evidence before closing a rotation

- A secret identifier or fingerprint (never the secret value), owner and rotation timestamp.
- Staging smoke-test evidence and production post-cutover health evidence.
- Confirmation old credentials were revoked, or a documented reason they remain temporarily active.
- Logs/traces checked for exposure; any incident or billing spike escalated.
- For `JWT_SECRET`, document expected session invalidation. For VAPID, document subscription migration. For payment/webhook credentials, document payment and webhook verification.

## Current release caveat

This runbook describes the safe process; it does not prove any live credentials have been rotated or verified. `main` branch protection remains disabled and provider settings have not been checked against a staging deployment. Keep the release marked NOT READY until those independent gates are closed.

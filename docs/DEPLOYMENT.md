# Production deployment — Vercel + Render

This repository includes deployment configuration for a Vite SPA on Vercel and a Node.js API plus continuously running worker on Render.

- Vercel configuration: `vercel.json`
- Render Blueprint: `render.yaml`
- Backend production preflight: `cd server && npm run validate:production-config`
- Deployed smoke test: `cd server && npm run verify:deployment`

The Blueprint targets the `main` branch and sets Render's `autoDeployTrigger: checksPass`. Render will deploy a Git-backed service only after the linked commit's checks pass. This is a deployment gate, not a substitute for GitHub branch protection or a release approval process.

## 1. Vercel frontend

Import the repository into Vercel and set the project root to `client/`. The frontend package manifest, lockfile, and `vercel.json` are all inside that directory; the repository root intentionally has no npm package manifest.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Production branch | `main` |
| Install command | `npm ci` (runs in `client/`) |
| Build command | `npm run build` (runs in `client/`) |
| Output directory | `dist` |

Set these Vercel environment variables for Production (and separately for Preview/Staging):

| Variable | Value |
|---|---|
| `VITE_API_URL` | The public HTTPS origin of the Render API, without a trailing slash |
| `VITE_PUBLIC_SITE_URL` | The canonical frontend HTTPS origin, such as `https://buddyforstudy.in` after its Vercel domain is attached |
| `VITE_GOOGLE_CLIENT_ID` | The same Google OAuth Web Client ID configured on the API |
| `VITE_PUBLIC_SUPPORT_EMAIL` | Verified support mailbox (optional) |
| `VITE_PUBLIC_SOCIAL_*` | Public social profile URLs (optional) |
| `VITE_INTENT_V2` | Keep unset or `false` until the server-side `INTENT_V2` rollout is staged |
| `VITE_ASYNC_ROADMAP` | Keep unset or `false` until the server-side `ASYNC_ROADMAP` endpoints are deployed and smoke-tested |

The checked-in `vercel.json` configures the Vite SPA fallback so direct requests to client routes (for example, `/login`, `/learn/:courseId`, and `/admin`) serve `index.html`. It also applies long-lived immutable caching only to Vite's hashed `/assets/` output.

Attach the production domain to the Vercel project. A domain being verified at the registrar is not sufficient: it must be assigned to this project and show a valid deployment. Verify both the root domain and `www` behavior in Vercel.

## 2. Render API and worker

Use Render **New → Blueprint** and connect this repository. Render reads the root `render.yaml` and defines two separate long-running services:

| Service | Root directory | Build command | Start command | Purpose |
|---|---|---|---|---|
| `buddyforstudy-api` | `server` | `npm ci` | `npm run start` | HTTP API |
| `buddyforstudy-worker` | `server` | `npm ci` | `npm run worker` | Background retries, reminders, reconciliation, expiry and curation maintenance |

Both use Node.js 24 (the server package engine), the Singapore region, and `main`. The Singapore region is an initial default, not a verified optimal choice: before the first Blueprint sync, compare it with the MongoDB Atlas cluster region and select the closest supported region with acceptable database latency. Render service region changes after creation require a new service and migration plan. Confirm `TRUST_PROXY_HOPS=1` matches the actual Render proxy topology before launch. The API health check uses `/api/health/ready`, which returns success only when MongoDB is connected. The worker is configured with a 300-second shutdown window so it can drain in-flight maintenance before exiting.

The worker is mandatory for scheduled reminders, delivery retries, billing reconciliation, subscription/trial expiry maintenance and the worker heartbeat used by operations monitoring. Do not deploy only the HTTP API.

### Required production variables

Render's Blueprint deliberately does not commit credentials. Complete every `sync: false` field on the API service in the Render Dashboard. The worker references the corresponding API environment variables, including the generated JWT secret, so both processes use the same database and runtime credentials.

| Variable | Requirement |
|---|---|
| `MONGO_URI` | MongoDB Atlas URI with a database name, authenticated database user and TLS. Use `mongodb+srv://` or explicit TLS. URL-encode special characters in credentials. |
| `JWT_SECRET` | Render generates a random value for the API service. Keep it stable across API restarts and shared with the worker. Never rotate it casually: existing sessions may be invalidated. |
| `CLIENT_URL` | Exact public frontend origin, including HTTPS and no path. |
| `API_URL` | Exact public API origin, including HTTPS and no path. |
| `TRUST_PROXY_HOPS` | Blueprint sets `1` for the Render proxy topology. Confirm the actual trusted proxy chain before changing it; do not use blanket trust. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Required for production email-based authentication and transactional messages. Verify the sender/domain and TLS mode with the chosen mail provider. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Required live-mode credentials. `RAZORPAY_KEY_ID` must be a live key. Never use test credentials in the production environment. |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client ID. Add the exact frontend origin to Authorized JavaScript origins in Google Cloud Console. |
| `GEMINI_API_KEY` | Required for live Gemini-backed generation; keep it server-side. |
| `YOUTUBE_API_KEY` | Required for live YouTube search/curation; restrict it to the YouTube Data API and monitor quota. |
| `REDIS_URL` | Optional. If configured, use an authenticated `rediss://` URL. Leave it blank if using the Mongo-backed stores. |
| `SENTRY_DSN` | Optional error monitoring DSN. |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Optional, but configure all three together. The private key is server-side only. Generate with `cd server && npm run generate:web-push-keys`. |

After the first Render Blueprint sync, add or review all environment values in the Render Dashboard. The Blueprint's `sync: false` values are initial prompts; adding new secrets to an existing Blueprint requires adding them to the deployed service's environment manually. Never copy production credentials into this repository, Vercel, browser-exposed variables, CI fixtures, or chat messages.

The following flags are explicitly off in the Blueprint: `USE_CURATION_ENGINE_FOR_AI`, `INTENT_V2`, `ASYNC_ROADMAP`, `YT_COMBINED_SEARCH`, `ENABLE_TRUSTED_CHANNELS`, `ENABLE_CURATION_COMPLIANCE_WORKERS`, and `AI_PRIVATE_COURSES_SKIP_REVIEW`. Keep them off for the first production deployment. Follow [Build with AI v2 rollout](BUILD_WITH_AI_V2_ROLLOUT.md) to stage each capability separately. Do not enable `AI_PRIVATE_COURSES_SKIP_REVIEW` as a routine rollout switch.

## 3. Provider callbacks and access configuration

After the API has a stable HTTPS hostname:

1. Set Vercel `VITE_API_URL` to that API origin and redeploy the frontend.
2. Set Render `CLIENT_URL` to the final Vercel custom-domain origin and `API_URL` to the Render API origin.
3. In Google Cloud Console, allow the exact frontend origin for the Web OAuth client; use the same client ID on frontend and API.
4. In Razorpay, configure the webhook URL as `https://<api-host>/api/webhooks/razorpay`, subscribe to the payment/subscription/refund events implemented by the server, and store the webhook secret only in Render.
5. Verify SMTP delivery with the provider's test message and the application's email OTP flow.
6. Configure VAPID only when browser push is part of the launch scope. Keep the VAPID private key exclusively in Render.
7. If Redis is enabled, use TLS and authentication. The production validator rejects non-TLS or unauthenticated Redis URLs.

## 4. Pre-deploy verification

Run from a clean checkout of the exact release commit:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build

cd server
npm ci
npm run lint
npm run validate:production-config
npm test
npm run verify:deployment
```

For `validate:production-config`, run with the intended production environment variables available to the process. Do not copy live secrets into logs. For the deployed smoke test, set `DEPLOYMENT_URL` and `FRONTEND_DEPLOYMENT_URL` to the two public HTTPS origins; it checks API liveness/readiness, CORS, billing-plan and Google-config endpoints, and frontend deep-link responses.

After deploy, verify:

- `GET /health` returns healthy and `GET /api/health/ready` confirms MongoDB connected.
- Admin → Operations shows a recent worker heartbeat and no stale maintenance failure.
- Signup, email OTP, login, Google OAuth, password reset and expired-session behavior work.
- Public catalog, learner course enrollment, lesson completion, saved courses, notifications and admin permission boundaries work.
- Razorpay sandbox/live-mode checkout and webhook signatures reconcile exactly once; test refunds only in the appropriate provider environment.
- Email and (if enabled) browser push deliver successfully; worker retries and notification outbox reconciliation are visible.
- Build with AI and YouTube quota behavior are checked with an intentionally conservative test budget before enabling any rollout flags.

Use separate MongoDB databases, JWT/payment/SMTP/OAuth credentials and provider projects for staging and production. Never reuse staging credentials for production. Keep a known-good previous deployment available for rollback.

## 5. Release blockers that this configuration does not waive

This configuration is not proof of a deployed environment. A production release is still blocked until all of the following have evidence:

- GitHub branch protection/ruleset requires the frontend and backend CI checks and disallows bypass by default.
- A staging environment has been deployed and exercised against real provider sandboxes.
- Render API and worker are running with healthy database connections and a current worker heartbeat.
- Data export/deletion/retention requirements have an approved policy and implemented, tested workflow.
- Subscription upgrade/downgrade, grace-period and plan-change rules have an approved product/payment contract and matching integration tests.
- Rollback owners, alert thresholds, and an actual rollback rehearsal are recorded.

See the [Production Readiness Master Checklist](PRODUCTION_READINESS_MASTER_CHECKLIST.md). Do not mark a task complete without evidence for the exact commit and environment.
 
## References

- [Render Blueprint YAML reference](https://render.com/docs/blueprint-spec)
- [Render health checks](https://render.com/docs/health-checks)
- [Vercel Vite SPA deployment and deep linking](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)

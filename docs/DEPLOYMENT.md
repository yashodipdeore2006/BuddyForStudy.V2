## 1. Render static frontend (recommended low-cost deployment)

The V2.2 Blueprint includes a free Render Static Site so the frontend can deploy without relying on the current Vercel build quota. Render static sites are served through a global CDN and do not require a continuously running Node process.

| Setting | Value |
|---|---|
| Service | `buddyforstudy-web` |
| Branch | `buddy-for-study-v2.2` |
| Root directory | `client` |
| Runtime | Static |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

Set these build-time variables on the static site in Render:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Required public HTTPS origin of the Render API, without a trailing slash |
| `VITE_PUBLIC_SITE_URL` | Required canonical frontend HTTPS origin |
| `VITE_GOOGLE_CLIENT_ID` | The matching Google OAuth Web Client ID |
| `VITE_INTENT_V2` | `false` for the initial release |
| `VITE_ASYNC_ROADMAP` | `false` for the initial release |

Vite embeds `VITE_*` values into the static bundle at build time. These values are public; never put secrets in them. Changing an API URL or public client ID requires a new frontend build. The Blueprint includes the SPA rewrite to `/index.html` and immutable caching for hashed assets. Attach the custom domain to this Render Static Site and verify its DNS/TLS status before switching production traffic.

Render documents static sites as free to deploy, subject to workspace bandwidth and pipeline usage. The API remains a separate web service; a free API instance can spin down after inactivity and is not a production-grade always-on service. Treat this combined free deployment as staging/preview or a constrained launch only when the API's sleep and background-job limitations are acceptable. For reliable production service, use an always-on API plan and verify the selected MongoDB region, backups, alerts, and rollback process.

# Production deployment — Vercel + Render

This repository includes deployment configuration for a Vite SPA on Render Static Sites (with Vercel as an optional alternative) and a Node.js API on Render. The V2.2 Blueprint deploys the frontend as a Render Static Site and the API with bounded inline background execution; a dedicated standalone worker is an optional upgrade.

- Vercel configuration: `vercel.json`
- Render Blueprint: `render.yaml` (one API service; `BACKGROUND_WORKER_MODE=inline`)
- Backend production preflight: `cd server && npm run validate:production-config`
- Deployed smoke test: `cd server && npm run verify:deployment`

The V2.2 release Blueprint targets the `buddy-for-study-v2.2` branch and sets Render's `autoDeployTrigger: checksPass`. Render will deploy a Git-backed service only after the linked commit's checks pass. This is a deployment gate, not a substitute for GitHub branch protection or a release approval process.

## 2. Vercel frontend (optional alternative)

Import the repository into Vercel and set the project root to `client/`. For this V2.2 release, set Vercel's Production Branch to `buddy-for-study-v2.2` in Project Settings → Git; the repository's `vercel.json` controls build and routing, not the Git deployment branch. The frontend package manifest, lockfile, and `vercel.json` are all inside that directory; the repository root intentionally has no npm package manifest.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Production branch | `buddy-for-study-v2.2` |
| Install command | `npm ci` (runs in `client/`) |
| Build command | `npm run build` (runs in `client/`) |
| Output directory | `dist` |

Set these Vercel environment variables for Production (and separately for Preview/Staging):

| Variable | Value |
|---|---|
| `VITE_API_URL` | **Required.** The actual public HTTPS origin of the deployed Render API, without a trailing slash. Do not use `localhost` or the CI placeholder `https://api.buddyforstudy.example`; production builds fail if the value is missing. |
| `VITE_PUBLIC_SITE_URL` | The canonical frontend HTTPS origin, such as `https://buddyforstudy.in` after its Vercel domain is attached |
| `VITE_GOOGLE_CLIENT_ID` | The same Google OAuth Web Client ID configured on the API |
| `VITE_PUBLIC_SUPPORT_EMAIL` | Verified support mailbox (optional) |
| `VITE_PUBLIC_SOCIAL_*` | Public social profile URLs (optional) |
| `VITE_INTENT_V2` | Keep unset or `false` until the server-side `INTENT_V2` rollout is staged |
| `VITE_ASYNC_ROADMAP` | Keep unset or `false` until the server-side `ASYNC_ROADMAP` endpoints are deployed and smoke-tested |

The checked-in `vercel.json` configures the Vite SPA fallback so direct requests to client routes (for example, `/login`, `/learn/:courseId`, and `/admin`) serve `index.html`. It also applies long-lived immutable caching only to Vite's hashed `/assets/` output.

Attach the production domain to the Vercel project. A domain being verified at the registrar is not sufficient: it must be assigned to this project and show a valid deployment. Verify both the root domain and `www` behavior in Vercel.

## 3. Render API and background execution

Use Render **New → Blueprint** and connect this repository. The default root `render.yaml` defines one long-running API service:

| Service | Root directory | Build command | Start command | Purpose |
|---|---|---|---|---|
| `buddyforstudy-api` | `server` | `npm ci` | `npm run start` | HTTP API plus bounded inline maintenance |

The API Blueprint uses Node.js 24, the Singapore region, and `buddy-for-study-v2.2`; the static frontend is served globally. The Singapore region is an initial default, not a verified optimal choice: compare it with the MongoDB Atlas cluster region and select the closest supported region with acceptable database latency. Confirm `TRUST_PROXY_HOPS=1` matches the actual Render proxy topology before launch. The API health check uses `/api/health/ready`, which returns success only when MongoDB is connected.

### Background execution modes

The Blueprint explicitly sets `BACKGROUND_WORKER_MODE=inline`. This is the recommended initial configuration when a separate worker service is not affordable.

| Mode | Deployment | Behavior and limitations |
|---|---|---|
| `inline` | API service only | Runs bounded maintenance and announcement batches inside the API process. Uses MongoDB leases to avoid duplicate execution across API replicas. Jobs pause while the host sleeps, restarts, or is unavailable. |
| `standalone` | API plus a separate worker service | API does not schedule jobs; the worker runs the full maintenance workload, including learning-reminder scans, subscription-expiry reminders, and nightly YouTube curation refreshes. |
| `disabled` | API service only | Intentionally pauses scheduled background processing. Use only for maintenance or controlled testing. |

Inline mode covers the bounded work documented in [the hybrid background-work architecture](BACKGROUND_WORK_HYBRID_ARCHITECTURE.md): expiry updates, audit outbox recovery, bounded email/push delivery, purchase/subscription notification reconciliation, and scheduled-announcement batches. It deliberately does **not** run learning-reminder scans, subscription-expiry reminder scans, or nightly YouTube stale-video/resource-prior refreshes. It is best-effort, not a guarantee of exact scheduled delivery. Payment verification, entitlement checks, authentication, enrollment, and progress writes remain authoritative in API request/webhook paths and must not depend on the scheduler.

### When a standalone worker is justified

Add a separate Render worker only when the omitted scheduled work or its delivery guarantees justify the additional service cost:

1. Set `BACKGROUND_WORKER_MODE=standalone` on the API service.
2. Create a Render Worker service with root directory `server`, build command `npm ci`, and start command `npm run worker`.
3. Set the same `BACKGROUND_WORKER_MODE=standalone` on the worker and share the API's MongoDB URI, JWT secret, provider credentials, and other required runtime variables.
4. Confirm the API and worker report the same configured mode and a current heartbeat in Admin → Operations.

Do not run API-inline and standalone scheduling against the same environment. Change modes through a controlled maintenance window: stop the previous scheduler, let it drain and release/expire its leases, confirm health, then start the new mode. The standalone worker is not part of the default Blueprint and is not required for the initial inline deployment.

### Required production variables

Render's Blueprint deliberately does not commit credentials. Complete every `sync: false` field on the API service in the Render Dashboard. Never copy production credentials into this repository, Vercel, browser-exposed variables, CI fixtures, or chat messages.

| Variable | Requirement |
|---|---|
| `BACKGROUND_WORKER_MODE` | Required explicitly in production. The Blueprint sets `inline`; use `standalone` only when adding the dedicated worker service, or `disabled` only for a controlled pause. |
| `MONGO_URI` | MongoDB Atlas URI with a database name, authenticated database user and TLS. Use `mongodb+srv://` or explicit TLS. URL-encode special characters in credentials. |
| `JWT_SECRET` | Render generates a random value for the API service. Keep it stable across API restarts. If you later add a worker, share the same value with it. Never rotate it casually: existing sessions may be invalidated. |
| `CLIENT_URL` | Exact public frontend origin, including HTTPS and no path. |
| `API_URL` | Exact public API origin, including HTTPS and no path. |
| `TRUST_PROXY_HOPS` | Blueprint sets `1` for the Render proxy topology. Confirm the actual trusted proxy chain before changing it; do not use blanket trust. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Required for production email-based authentication and transactional messages. Verify the sender/domain and TLS mode with the chosen mail provider. |
| `PAYMENTS_ENABLED` | Keep `false` until payment-provider onboarding and payment flows are ready. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Add these API environment variables only when `PAYMENTS_ENABLED=true`. Use live-mode credentials in production; never use test credentials in the production environment. |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client ID. Add the exact frontend origin to Authorized JavaScript origins in Google Cloud Console. |
| `GEMINI_API_KEY` | Required for live Gemini-backed generation; keep it server-side. |
| `YOUTUBE_API_KEY` | Required for live YouTube search/curation; restrict it to the YouTube Data API and monitor quota. |
| `REDIS_URL` | Optional. If configured, use an authenticated `rediss://` URL. Leave it blank if using the Mongo-backed stores. |
| `SENTRY_DSN` | Optional error monitoring DSN. |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Optional, but configure all three together. The private key is server-side only. Generate with `cd server && npm run generate:web-push-keys`. |

After the first Render Blueprint sync, add or review all environment values in the Render Dashboard. The Blueprint's `sync: false` values are initial prompts; adding new secrets to an existing Blueprint requires adding them to the deployed service's environment manually. Never expose server secrets through `VITE_*` variables or frontend build output.

The following flags are explicitly off in the Blueprint: `USE_CURATION_ENGINE_FOR_AI`, `INTENT_V2`, `ASYNC_ROADMAP`, `YT_COMBINED_SEARCH`, `ENABLE_TRUSTED_CHANNELS`, `ENABLE_CURATION_COMPLIANCE_WORKERS`, and `AI_PRIVATE_COURSES_SKIP_REVIEW`. Keep them off for the first production deployment. Follow [Build with AI v2 rollout](BUILD_WITH_AI_V2_ROLLOUT.md) to stage each capability separately. Do not enable `AI_PRIVATE_COURSES_SKIP_REVIEW` as a routine rollout switch.

## 4. Provider callbacks and access configuration

After the API has a stable HTTPS hostname:

1. Set Vercel `VITE_API_URL` to that API origin and redeploy the frontend.
2. Set Render `CLIENT_URL` to the final Vercel custom-domain origin and `API_URL` to the Render API origin.
3. In Google Cloud Console, allow the exact frontend origin for the Web OAuth client; use the same client ID on frontend and API.
4. When payments are enabled, configure the Razorpay webhook URL as `https://<api-host>/api/webhooks/razorpay`, subscribe to the payment/subscription/refund events implemented by the server, and store the webhook secret only in Render.
5. Verify SMTP delivery with the provider's test message and the application's email OTP flow.
6. Configure VAPID only when browser push is part of the launch scope. Keep the VAPID private key exclusively in Render.
7. If Redis is enabled, use TLS and authentication. The production validator rejects non-TLS or unauthenticated Redis URLs.

## 5. Pre-deploy verification

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
- When `PAYMENTS_ENABLED=true`, verify Razorpay sandbox/live-mode checkout and webhook signatures reconcile exactly once; test refunds only in the appropriate provider environment.
- Email and (if enabled) browser push deliver successfully; scheduled retries and notification outbox reconciliation are visible.
- Build with AI and YouTube quota behavior are checked with an intentionally conservative test budget before enabling any rollout flags.

Use separate MongoDB databases, JWT/payment/SMTP/OAuth credentials and provider projects for staging and production. Never reuse staging credentials for production. Keep a known-good previous deployment available for rollback.

## 6. Release blockers that this configuration does not waive

This configuration is not proof of a deployed environment. A production release is still blocked until all of the following have evidence:

- GitHub branch protection/ruleset requires the frontend and backend CI checks and disallows bypass by default.
- A staging environment has been deployed and exercised against real provider sandboxes.
- The Render API is running with a healthy database connection and a current heartbeat for the configured `BACKGROUND_WORKER_MODE`; when `standalone` mode is selected, the separate worker must also be healthy.
- Data export/deletion/retention requirements have an approved policy and implemented, tested workflow.
- Subscription upgrade/downgrade, grace-period and plan-change rules have an approved product/payment contract and matching integration tests.
- Rollback owners, alert thresholds, and an actual rollback rehearsal are recorded.

See the [Production Readiness Master Checklist](PRODUCTION_READINESS_MASTER_CHECKLIST.md). Do not mark a task complete without evidence for the exact commit and environment.
 
## References

- [Render Static Sites](https://render.com/docs/static-sites)
- [Render free services](https://render.com/docs/free)

- [Render Blueprint YAML reference](https://render.com/docs/blueprint-spec)
- [Render health checks](https://render.com/docs/health-checks)
- [Vercel Vite SPA deployment and deep linking](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)


**Production API URL guard:** the frontend build intentionally refuses to compile in production when `VITE_API_URL` is absent. The CI build uses `https://api.buddyforstudy.example` only as a non-routable configuration fixture to validate the build; it is not a deployed hostname. Replace it in the Vercel Production environment with the real Render service URL (for example, the URL Render assigns to `buddyforstudy-api`). Redeploy the frontend after changing the variable because Vite embeds public environment variables at build time.
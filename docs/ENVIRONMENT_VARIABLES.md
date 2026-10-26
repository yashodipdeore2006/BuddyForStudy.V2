# BuddyForStudy.V2 — Environment Variable Inventory

**Scope:** current `main` configuration, `.env.example`, server `env.js`, production validator, admin bootstrap scripts, and deployment smoke verifier.

## Rules for all environments

- Never commit `.env` or real credentials. The committed `.env.example` files contain local/test placeholders only.
- Every `VITE_*` value is public at build time and can be read by browser users. Never place database, JWT, payment, SMTP, LLM, or Web Push private keys in a `VITE_*` variable.
- Store production secrets in the deployment provider's secret manager. Use different credentials for development, staging, and production.
- `server/src/config/env.js` requires `MONGO_URI` and `JWT_SECRET` at startup in every environment. The production validator additionally requires a non-placeholder JWT secret of at least 32 characters, an HTTPS `CLIENT_URL`, and all three Razorpay production values.
- The validator does **not** prove external provider connectivity or that all provider settings are correct; staging smoke tests are still required.

## Frontend variables

| Variable | Requirement | Public? | Purpose / validation |
|---|---|---|---|
| `VITE_API_URL` | Required for deployed frontend | Yes | Public API origin; defaults to local development in the example. Must point to the deployed backend in production. |
| `VITE_PUBLIC_SITE_URL` | Required to emit canonical tags on public routes | Yes | Verified HTTPS production site origin; code ignores invalid, localhost, or non-HTTPS values. Set this in the frontend build environment. Authenticated/admin/player routes deliberately do not emit canonical tags. |
| `VITE_GOOGLE_CLIENT_ID` | Optional for deployments without Google Sign-In; needed when using it | Yes | Google Identity Services web client ID. Must match server `GOOGLE_CLIENT_ID` and the authorised JavaScript origins. |
| `VITE_INTENT_V2` | Optional; default `false` in `.env.example` | Yes | Frontend feature flag for the intent-driven Build with AI question flow. Must be coordinated with server `INTENT_V2`; changing it requires a frontend rebuild. |
| `VITE_ASYNC_ROADMAP` | Optional; default `false` in `.env.example` | Yes | Frontend feature flag for async roadmap draft/poll/events. Keep off until the server `ASYNC_ROADMAP` routes and auth flow are deployed and smoke-tested. |
| `VITE_PUBLIC_SUPPORT_EMAIL` | Optional | Yes | Public support contact for footer/help surfaces. |
| `VITE_PUBLIC_SOCIAL_INSTAGRAM` | Optional | Yes | Public Instagram URL; use the official HTTPS profile. |
| `VITE_PUBLIC_SOCIAL_LINKEDIN` | Optional | Yes | Public LinkedIn URL; use the official HTTPS profile. |
| `VITE_PUBLIC_SOCIAL_YOUTUBE` | Optional | Yes | Public YouTube URL; use the official HTTPS channel. |
| `VITE_PUBLIC_SOCIAL_X` | Optional | Yes | Public X URL; use the official HTTPS profile. |
| `VITE_PUBLIC_SOCIAL_FACEBOOK` | Optional | Yes | Public Facebook URL; use the official HTTPS page. |
| `VITE_PUBLIC_SOCIAL_GITHUB` | Optional | Yes | Public GitHub URL; use the official HTTPS profile or repository. |

## Backend runtime and security

| Variable | Requirement | Secret? | Purpose / validation |
|---|---|---|---|
| `NODE_ENV` | Set to `production` in production | No | Enables fail-closed production configuration validation. |
| `PORT` | Platform-dependent; defaults to `5000` | No | HTTP listener port. Let the hosting platform supply it where required. |
| `TRUST_PROXY_HOPS` | **Explicitly required in production** | No | Integer from `0` to `10` that matches the exact trusted reverse-proxy hop count in the deployment. `0` means no trusted proxy. Set based on verified provider/network topology; do not guess or use blanket trust. Used by Express so per-IP rate limiting sees the correct client address. |
| `MONGO_URI` | Required | **Yes** | Production validator requires a non-loopback MongoDB URI, an explicit database name, username/password credentials, and TLS (`mongodb+srv` defaults to TLS; `mongodb://` must specify `tls=true` or `ssl=true`). Use least-privilege credentials. |
| `JWT_SECRET` | Required | **Yes** | Signs application JWTs. Production must use a unique, high-entropy, non-placeholder value with at least 32 characters. Rotate deliberately and account for session invalidation. |
| `JWT_EXPIRES_IN` | Optional; defaults to `7d` | No | JWT lifetime accepted by the token library. Review against session policy. |
| `CLIENT_URL` | Required in production | No | Single public frontend origin for production CORS and redirects; validator requires HTTPS and rejects loopback. |
| `API_URL` | **Required in production** | No | Public backend origin used by email unsubscribe links. Validator requires a valid HTTPS non-loopback URL; it must be the deployed API origin rather than the frontend origin. |
| `GOOGLE_CLIENT_ID` | Required for Google Sign-In | No (client identifier) | Google OAuth web client ID. Match the frontend value and authorised origins. |

## AI and YouTube integrations

| Variable | Requirement | Secret? | Purpose / safe default |
|---|---|---|---|
| `GEMINI_API_KEY` | Required to use Gemini-backed generation; not required to boot the API | **Yes** | Gemini API credential; keep server-side. |
| `GEMINI_MODEL` | Optional; defaults to `gemini-3.8-flash` | No | Model identifier used by server AI services. Verify availability and quota in staging before release. |
| `YOUTUBE_API_KEY` | Required for YouTube discovery features; not required to boot the API | **Yes** | YouTube Data API credential. Apply API restrictions and quotas in Google Cloud. |
| `YT_COMBINED_SEARCH` | Optional; default `false` | No | Enables combined YouTube video/playlist search behavior. Roll out only after quota and result-quality checks. |
| `YT_DAILY_QUOTA_BUDGET` | Optional; defaults to `9000` and clamped to at least `1` | No | Application-side YouTube quota budget guard. Ensure it matches the Cloud project quota. |
| `YT_SOFT_LIMIT_PCT` | Optional; defaults to `80`, clamped to `1–100` | No | Quota soft-limit percentage. |
| `USE_CURATION_ENGINE_FOR_AI` | Optional; default `false` | No | Opt-in curation-engine flag for AI course flow. |
| `INTENT_V2` | Optional; default `false` | No | Opt-in intent parsing V2. |
| `ASYNC_ROADMAP` | Optional; default `false` | No | Opt-in asynchronous roadmap build flow. |
| `ENABLE_TRUSTED_CHANNELS` | Optional; default `false` | No | Enables trusted-channel policy. Validate configured data and behavior before enabling. |
| `ENABLE_CURATION_COMPLIANCE_WORKERS` | Optional; default `false` | No | Starts/enables curation compliance worker behavior. Ensure the worker deployment and monitoring are ready. |
| `AI_PRIVATE_COURSES_SKIP_REVIEW` | Optional; default `false` | No | Skips review for private AI courses. Treat as a risk-sensitive rollout flag; enable only with explicit approval. |
| `NODE_CACHE_TTL_DAYS` | Optional; defaults to `14`, clamped to `1–25` | No | Roadmap/node cache lifetime. |
| `NODE_CONCURRENCY` | Optional; defaults to `3`, clamped to at least `1` | No | Limits node-level concurrency for roadmap resolution. Set based on provider quotas and capacity. |
| `BUILD_WITH_AI_SELECTOR_MOCK` | Test harness only; do not set `true` in production | No | When true, changes dotenv-loading behavior so the selector comparison can run in mock mode. |

## Payments

| Variable | Requirement | Secret? | Purpose / validation |
|---|---|---|---|
| `RAZORPAY_KEY_ID` | **Required in production** | Treat as sensitive | Must have the `rzp_live_` prefix and must not be a placeholder. Use production credentials only in the production environment. |
| `RAZORPAY_KEY_SECRET` | **Required in production** | **Yes** | Must be non-placeholder and at least 16 characters. Razorpay API secret; server-side only. |
| `RAZORPAY_WEBHOOK_SECRET` | **Required in production** | **Yes** | Must be non-placeholder and at least 32 characters; must match the configured Razorpay webhook endpoint. |

## Email, Web Push, cache, and observability

| Variable | Requirement | Secret? | Purpose / validation |
|---|---|---|---|
| `SMTP_HOST` | **Required in production** | No | Remote SMTP hostname. Production validator rejects blank/loopback hostnames; SMTP transport requires TLS. |
| `SMTP_PORT` | **Required/validated in production; defaults to `587`** | No | Integer port 1–65535. Typically 587 with STARTTLS or 465 with implicit TLS; verify provider settings. |
| `SMTP_SECURE` | Optional; defaults to false | No | Must be the string `true` or `false`. Production transports require TLS, including STARTTLS when `false`. |
| `SMTP_USER` | **Required in production** | Treat as sensitive | SMTP login; must be set. Used as sender fallback if `MAIL_FROM` is omitted, and therefore must be a valid address in that case. |
| `SMTP_PASS` | **Required in production** | **Yes** | Non-placeholder provider password/token of at least 8 characters. |
| `MAIL_FROM` | Required unless `SMTP_USER` is a valid sender address | Treat as sender identity | Valid sender email address used for messages; confirm provider authorisation and SPF/DKIM/DMARC. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Optional; all three Web Push settings become required together when any one is supplied | No | Public VAPID key returned to the browser. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Optional; all three Web Push settings become required together when any one is supplied | **Yes** | VAPID private key; server-side only. Keep paired with the public key. |
| `WEB_PUSH_SUBJECT` | Optional; required with both VAPID keys if Web Push is configured | No | `mailto:` address or HTTPS contact URL. |
| `REDIS_URL` | Optional; cache/queue-dependent features may degrade without it | **Yes if credentials are embedded** | If set in production, must use `rediss://`, remote host and credentials. Never log the full URI. |
| `SENTRY_DSN` | Optional | Treat as sensitive operational config | Enables Sentry reporting. Confirm environment/project separation and event scrubbing. |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional; defaults to `0.1` | No | Trace sample rate; validate range before adjusting for production traffic. |

## Bootstrap-only and verification-script variables

| Variable | Used by | Requirement / handling |
|---|---|---|
| `ADMIN_EMAIL` | `create-admin`, `set-admin-role` | Required for the corresponding bootstrap command. Not a general runtime credential. |
| `ADMIN_PASSWORD` | `create-admin` | Required only for initial/approved admin bootstrap. Script can overwrite an existing admin password, so restrict operator access and unset after use. Never commit a real value. |
| `ADMIN_NAME` | `create-admin` | Optional display name; defaults to `BuddyForStudy Admin`. |
| `ADMIN_ROLE` | `create-admin`, `set-admin-role` | Optional for creation; required for role assignment. Accepts supported admin profiles only. Reserve `super_admin` for the explicitly designated platform owner. |
| `DEPLOYMENT_URL` | `npm run verify:deployment` | Required for the smoke verifier; use the deployed backend origin. |
| `FRONTEND_DEPLOYMENT_URL` | `npm run verify:deployment` | Optional for API-only smoke tests, but provide it for a full deployment check. |

## Follow-up validation gaps

- Confirm the selected deployment providers actually use Node.js `24.x`; package engines and `.nvmrc` declare the contract but do not override every host's dashboard/runtime setting.
- Verify secret presence/rotation and HTTPS/TLS in staging without printing values into logs or checklist evidence.
- Exercise OAuth, Razorpay webhooks, email, Web Push, Redis, Sentry and YouTube quota behavior with isolated staging credentials.
- Confirm production config validation and `npm run verify:deployment` pass against the actual deployed staging URLs.

Source files checked: `server/src/config/env.js`, `server/src/config/productionConfigValidation.js`, `server/src/scripts/createAdmin.js`, `server/src/scripts/setAdminRole.js`, `server/src/scripts/verifyDeployment.js`, `server/src/config/cache.js`, and both committed `.env.example` files.

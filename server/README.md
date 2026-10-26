# BuddyForStudy API

Node.js + Express + MongoDB/Mongoose backend for BuddyForStudy.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `MONGO_URI` and a strong `JWT_SECRET`.
3. Install dependencies:

```bash
cd server
npm install
```

3. Set `API_URL` to the public backend origin (for example, `https://api.example.com`) in production. Promotional-email unsubscribe links use this origin. `CLIENT_URL` remains the frontend origin.

4. Start development server:

```bash
npm run dev
```

Health check:

```
GET http://localhost:5000/health
```

## Authentication

Local authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Google authentication:

- `POST /api/auth/google`

The Google endpoint accepts the credential returned by Google Identity Services and verifies it server-side before issuing the BuddyForStudy JWT.

Required environment variable:

```
GOOGLE_CLIENT_ID=
```

## Core API groups

- `/api/courses`
- `/api/enrollments`
- `/api/progress`
- `/api/admin`
- `/api/ai`

## AI course generation

`POST /api/ai/course` is admin-only.

Required:

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
YOUTUBE_API_KEY=
```

The AI services use the configured Gemini model for structured course and quiz generation, and search YouTube for candidate learning videos. Use the configuration names and defaults in `src/config/env.js` and `.env.example`. Generated source URLs are returned with the course plan.

Never commit real API keys or MongoDB credentials.


## Production readiness

When `NODE_ENV=production`, startup fails closed unless all of these are configured:

- `MONGO_URI`
- `JWT_SECRET` with at least 32 characters and no known placeholder value
- `CLIENT_URL` set to the deployed HTTPS frontend origin
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Do not use CI/test secrets in production. Keep provider secrets server-side and configure the Razorpay webhook endpoint as `/api/webhooks/razorpay`.

After deployment, run the smoke checks from the server directory:

```bash
DEPLOYMENT_URL=https://your-api.example.com \
FRONTEND_DEPLOYMENT_URL=https://your-frontend.example.com \
npm run verify:deployment
```

The verifier checks API liveness, database readiness, public billing plans, Google-auth configuration, and (when provided) that the frontend responds with HTML. The frontend URL is optional for API-only smoke checks, but should be supplied for a complete deployment check.

## Environment variable inventory

See [Environment Variable Inventory](../docs/ENVIRONMENT_VARIABLES.md) for frontend/public values, backend secrets, production requirements, feature flags, bootstrap-only variables, and deployment smoke-test inputs.

## Regression and CI checks

The GitHub Actions workflow runs frontend lint, TypeScript type-checking, unit tests, production build, and Playwright navigation/admin smoke tests as blocking checks. Backend CI uses lockfile-based `npm ci`, runs backend ESLint, the Node test suite against MongoDB, selector comparison in mock mode, and server JavaScript syntax checks. The backend install uses `server/.npmrc` to keep npm peer-resolution consistent with the committed lockfile. Both packages declare Node.js `24.x`, matching CI. Backend unused-symbol lint findings are currently reported as warnings while undefined variables and other correctness lint errors remain blocking; this warning backlog must be reduced before declaring lint fully clean. The suite includes admin route permission coverage, audit redaction bounds, subscription entitlement boundaries, refund/payment validation, and webhook transition regressions.

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

## AI learning features

The current backend AI integrations use Google's Gemini API through the `@google/genai` SDK. Roadmap generation, course/lesson quiz generation, and advanced AI learning assistance read their provider configuration from the shared server environment.

Required environment variables for these features:

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
YOUTUBE_API_KEY=
```

- `GEMINI_API_KEY` authenticates server-side Gemini requests.
- `GEMINI_MODEL` selects the configured Gemini model; the code default is `gemini-3.8-flash`.
- `YOUTUBE_API_KEY` is used by learning-resource discovery where YouTube search is enabled.

The backend validates and handles generated AI content before it is used by learning workflows. Keep provider keys on the server; never expose them through `VITE_*` variables or commit them to the repository.

For lesson quiz generation, see the quiz-generation service and its tests in `server/src/services/` and `server/test/`.

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

## Regression and CI checks

The GitHub Actions workflow runs frontend lint as an advisory check (the existing frontend currently has lint debt), then requires TypeScript type-checking, frontend unit tests, a production build, and browser navigation smoke tests. Backend CI currently uses `npm install`, runs the full Node test suite against MongoDB, and syntax-checks server JavaScript. The backend lockfile should be regenerated and verified before changing CI to `npm ci`. The suite includes admin route permission coverage, audit redaction bounds, subscription entitlement boundaries, refund/payment validation, and webhook transition regressions.

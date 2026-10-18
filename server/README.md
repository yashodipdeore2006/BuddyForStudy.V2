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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-luna
YOUTUBE_API_KEY=
```

The AI service searches YouTube for candidate learning videos, then uses the OpenAI Responses API to construct a structured BuddyForStudy course plan. Generated source URLs are returned with the course plan.

Never commit real API keys or MongoDB credentials.

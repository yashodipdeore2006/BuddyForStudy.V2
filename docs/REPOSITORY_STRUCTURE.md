# Repository structure

```text
.
├── client/       # React, TypeScript, Vite frontend and browser tests
├── server/       # Node.js, Express, MongoDB API and worker
├── docs/         # All project documentation and architecture records
├── scripts/      # Repository-level maintenance and comparison scripts
└── .github/      # CI and repository automation
```

## Frontend
Run commands from `client/`:
- `npm ci`
- `npm run dev`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`

## Backend
Run commands from `server/`:
- `npm ci`
- `npm run dev`
- `npm test`
- `npm run worker`

Copy `client/.env.example` and `server/.env.example` to their respective local `.env` files and configure values locally. Never commit secrets.

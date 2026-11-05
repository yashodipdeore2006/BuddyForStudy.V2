# Repository structure

BuddyForStudy is maintained as a client/server monorepo.

```text
.
├── client/                 # React + TypeScript + Vite frontend
│   ├── public/             # Static assets
│   ├── src/                # Frontend application source
│   ├── tests/              # Frontend unit and browser tests
│   ├── package.json
│   └── vite.config.ts
├── server/                 # Node.js + Express backend
│   ├── src/
│   ├── test/
│   ├── tests/
│   └── package.json
├── docs/                   # Project, product, design, and operational docs
├── .github/workflows/      # CI workflows
└── .gitignore
```

## Frontend

Run frontend commands from `client/`:

- `npm ci`
- `npm run dev`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`

Configure the frontend environment using `client/.env.example`.

## Backend

Run backend commands from `server/`:

- `npm install`
- `npm run dev`
- `npm test`
- `npm start`

Configure backend secrets using `server/.env.example`. Never commit real environment files or secrets.

## Deployment configuration

For Vercel, set the project Root Directory to `client`, use `npm ci` as the install command and `npm run build` as the build command. The output directory is `dist`.

Deploy the API separately from the `server` directory. Keep all provider secrets on the backend.

# BuddyForStudy.V2 — Production & Deployment Readiness Master Checklist

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Release branch:** `main`  
**Version:** 1.0 · **Total tasks:** 239

> **Status policy:** Code existing or a test file existing does not make a task complete. Mark `DONE` only after executing the check on the current candidate and recording evidence. Use `FAIL` for a reproduced defect, `BLOCKED` when environment/access prevents checking, and `N/A` only with a written reason.

## Progress dashboard

| Metric | Current |
|---|---:|
| Total tasks | 239 |
| Verified done | 79 / 239 |
| Failed tasks | 4 / 239 |
| Blocked | 13 / 239 |
| Not checked | 143 / 239 |
| Open findings | 4 (REL-001 P1 release controls; REL-002 P2 lint-warning backlog; REL-004 P1 staging/provider verification; DATA-001 P1 account data rights/retention workflow) |
| Release decision | **NOT READY — branch protection, account data rights/retention workflow, and staging/operations gates remain open** |

After every task or batch, report `N completed out of 239`, plus failed, blocked and remaining counts. Update this file with date, candidate SHA, evidence/CI URL, finding ID, fix commit and retest result. A code fix is not closed until the original check passes again.

## Workflow for every task

1. Inspect current `main` source, relevant docs and tests before changing code.
2. Execute the smallest meaningful check and preserve its exact result.
3. Mark `DONE`, `FAIL`, `BLOCKED` or justified `N/A`; attach evidence and candidate SHA.
4. For `FAIL`, record severity (`P0`–`P3`), reproduction, root cause, fix, regression test and owner.
5. Make focused fixes on `main` only; do not merge `test` wholesale.
6. Run targeted regression tests, then relevant broader checks; repeat the original check.
7. Recompute progress after each task. Reopen a task if later changes invalidate its evidence.
8. Do not release with open P0/P1 defects or failing required gates without explicit authorized risk acceptance.

## Release-blocking gates

- No open P0/P1 findings.
- Required CI is green on the exact release candidate; lint must block on errors.
- Typecheck, unit/integration tests, production build, backend syntax/deployment checks and browser smoke tests pass.
- Auth, authorization, payment, webhook, entitlement and refund invariants are verified.
- Staging/provider tests, backup/restore and rollback have evidence.
- Every residual risk has an owner and explicit acceptance.

## Task register

### A. Release controls and CI

- [x] **PR-001** record candidate main SHA and release-tag decision.  
  Status: `DONE` · Evidence: current reviewed candidate [`1ada53c`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/1ada53cafc7a4bdf26542bf1c8bbc3f9cb81aef5); production tag intentionally deferred because release status is NOT READY · Finding/fix: —
- [ ] **PR-002** confirm clean working tree.  
  Status: `BLOCKED` · Evidence: GitHub connector can inspect committed `main` but cannot inspect uncommitted files on the developer's local workstation · Next action: run `git status --short` in the release workspace before tagging/deploying.
- [x] **PR-003** review commits since last green CI.  
  Status: `DONE` · Evidence: [latest previously green run on `6c0967f`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539); only checklist documentation followed that candidate at time of review · Finding/fix: —
- [ ] **PR-004** confirm main branch protection.  
  Status: `FAIL` · Evidence: GitHub API reports `main.protected = false` · Finding: `REL-001` — configure branch protection/ruleset; connector does not expose a write operation for this setting.
- [x] **PR-005** confirm CI runs on push and pull request.  
  Status: `DONE` · Evidence: [`.github/workflows/ci.yml`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.github/workflows/ci.yml) defines push for `main`/`test` and pull requests targeting `main` · Finding/fix: —
- [x] **PR-006** make frontend lint blocking.  
  Status: `DONE` · Evidence: [`.github/workflows/ci.yml`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.github/workflows/ci.yml) runs `npm run lint` without `continue-on-error`; the frontend job passed in [run 40278571539](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539) · Finding/fix: —
- [x] **PR-007** verify frontend typecheck blocks.  
  Status: `DONE` · Evidence: [successful typecheck in run 40278571539](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539) · Finding/fix: —
- [x] **PR-008** verify frontend unit tests block.  
  Status: `DONE` · Evidence: [successful frontend unit tests in run 40278571539](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539) · Finding/fix: —
- [x] **PR-009** verify production build blocks.  
  Status: `DONE` · Evidence: [successful production build in run 40278571539](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539) · Finding/fix: —
- [x] **PR-010** verify backend tests block.  
  Status: `DONE` · Evidence: [successful backend tests in run 40278571539](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40278571539) · Finding/fix: —
- [x] **PR-011** enforce backend lint and syntax checks.  
  Status: `DONE WITH WARNINGS` · Evidence: [green CI run 40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017) passed backend lint, tests, mock selector comparison, and JavaScript syntax checks · Finding: `REL-002` remains OPEN as P2 because legacy unused-symbol diagnostics are warnings; `no-undef`/correctness errors still fail the gate.
- [x] **PR-012** make browser smoke tests block.  
  Status: `DONE` · Evidence: Playwright navigation/admin smoke tests passed in [CI run 40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017); the workflow has no `continue-on-error` on the smoke-test step.
- [x] **PR-013** align CI and declared deployment Node versions.  
  Status: `DONE` · Evidence: `.nvmrc`, root/server `engines.node`, both lockfile root entries, and CI all specify Node `24.x`/`24`; CI uses `actions/checkout@v5` and `actions/setup-node@v5`. Production host settings still require post-deploy verification.
- [x] **PR-014** use lockfile-based clean installs.  
  Status: `DONE` · Evidence: frontend and backend `npm ci` both passed on exact candidate `e8da7c08` in [CI run 40286388546](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40286388546); the formerly stale backend lockfile was regenerated in [commit 8e5484a](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/8e5484a), and backend `npm ci` passed again in the lockfile repair job. `server/.npmrc` preserves the intentional optional-peer resolution mode.
- [x] **PR-015** review workflow permissions and fork secret exposure.  
  Status: `DONE` · Evidence: [CI workflow](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.github/workflows/ci.yml) explicitly grants only `contents: read`, uses `pull_request` (not `pull_request_target`), has no deployment secrets in steps, and sets checkout `persist-credentials: false`.
- [x] **PR-016** scan for committed env files and secrets.  
  Status: `DONE — current tree scan` · Evidence: recursive Git tree scan (518 entries) found only `.env.example` and `server/.env.example` among env/key-like paths; repository code searches returned no matches for common API-key prefixes such as `AIza`, `sk-proj`, `sk-live`, `rzp_live`, `ghp_`, or `mongodb+srv`. Limitation: this is a current-tree pattern scan, not a full historical Git-secret scan.
- [x] **PR-017** record release notes and known risks.  
  Status: `DONE` · Evidence: [`docs/RELEASE_NOTES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/RELEASE_NOTES.md) records verified changes, CI evidence, known risks, and explicit NOT READY status.
- [ ] **PR-018** assign rollback and release decision owners.  
  Status: `BLOCKED` · Evidence: owner identities and formal approval authority are not defined in repository sources, and they cannot be inferred safely. Project owner must record named primary/backup release and rollback owners plus risk-acceptance authority.
- [x] **PR-019** capture CI for exact candidate SHA.  
  Status: `DONE` · Evidence: exact candidate `6afca87678f4fb181ad5d10e3c1a8226214edfd2` is green in [CI run 40312089329](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329). Backend tests/lint/config preflight and frontend lint/typecheck/unit tests/production build/browser tests passed, including admin deletion confirmation, direct-route permissions, catalogue sort/pagination, loading, and offline retry. Checklist documentation changes follow the tested code candidate.
- [ ] **PR-020** block release while required checks are red or pending.  
  Status: `FAIL` · Evidence: branch protection is disabled and no separate release/deployment workflow enforces a candidate-CI gate; see `REL-001`. Manual go/no-go notes exist, but they do not prevent an unprotected merge/release.

### B. Configuration and secrets

- [x] **PR-021** inventory frontend and backend environment variables.  
  Status: `DONE` · Evidence: the current [`.env.example`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.env.example), [`src/vite-env.d.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/src/vite-env.d.ts), [`src/lib/socialLinks.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/src/lib/socialLinks.ts), and [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md) agree on public URL flags, Build with AI frontend flags, and Facebook/GitHub social URLs; frontend typecheck passed in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746). Limitation: historical Git-secret scanning is separate and not claimed complete.
- [x] **PR-022** run production config validation.  
  Status: `DONE` · Evidence: [CI run 40282290084](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40282290084) passed the `Validate production config preflight with synthetic values` step; [validator regression tests](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/productionConfigValidation.test.js) pass in the same run. This validates config rules, not live provider connectivity or real secret values.
- [ ] **PR-023** verify strong unique non-placeholder JWT secret.  
  Status: `BLOCKED` · Evidence: production validator requires a non-placeholder JWT secret of at least 32 characters; [`productionConfigValidation.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/productionConfigValidation.test.js) covers rejection. Blocker: cannot inspect deployed secret-manager metadata or validate uniqueness/reuse across environments from this session; check without exposing the value.
- [ ] **PR-024** verify production HTTPS client URL.  
  Status: `BLOCKED` · Evidence: validator rejects non-HTTPS and loopback `CLIENT_URL`, with regression coverage. Blocker: the actual staging/production `CLIENT_URL` setting is not available in repository sources; validate it in deployment settings.
- [x] **PR-025** verify Razorpay secrets are backend-only.  
  Status: `DONE` · Evidence: server credentials are read by `server/src/config/env.js` and `server/src/services/razorpay.service.js`; root [`.env.example`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.env.example) contains only public `VITE_*` variables, while [`server/.env.example`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/.env.example) keeps Razorpay variables server-side. No live secret values were inspected or recorded.
- [ ] **PR-026** verify Mongo URI credentials TLS and database.  
  Status: `BLOCKED` · Evidence: the production validator requires a non-loopback MongoDB URI, database path, username/password and TLS; regression tests cover invalid cases. Blocker: the deployed database URI and connection cannot be inspected from this repository session.
- [ ] **PR-027** verify Google OAuth origins and callbacks.  
  Status: `BLOCKED` · Evidence: frontend/backend examples document matching `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`; actual authorised JavaScript origins and redirect settings are managed in Google Cloud Console. Blocker: console access and a successful staging sign-in are required.
- [ ] **PR-028** verify LLM keys and model configuration.  
  Status: `BLOCKED` · Evidence: the source config uses `GEMINI_API_KEY` and `GEMINI_MODEL`, documented in [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md). Blocker: deployed key presence, project quota/billing and live generation response require authorised staging/provider access.
- [ ] **PR-029** verify YouTube API restrictions and quota.  
  Status: `BLOCKED` · Evidence: `YOUTUBE_API_KEY`, `YT_DAILY_QUOTA_BUDGET` and quota guard settings are documented in [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md). Blocker: Google Cloud API restrictions, configured daily quota and live YouTube response need provider-console access and staging verification.
- [ ] **PR-030** verify SMTP host TLS sender and credentials.  
  Status: `BLOCKED — live SMTP not verifiable here` · Evidence: production config validation now checks remote SMTP host, valid port/secure flag, login, non-placeholder password and sender; OTP and notification transports set `requireTLS: true`. Backend lint, synthetic production-config preflight and tests passed in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746). Blocker: deployment SMTP credentials, verified sender/domain and live OTP delivery/reception need staging provider access; do not paste secrets into evidence.
- [ ] **PR-031** verify Web Push VAPID keys and subject.  
  Status: `BLOCKED — optional live integration not verified` · Evidence: validator rejects partial VAPID configuration; regression tests passed in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746); `.env.example` keeps all three values blank by default. Blocker: if Web Push is enabled in a deployment, verify the real VAPID public/private pair and contact subject, then test subscription and delivery in staging.
- [ ] **PR-032** verify Redis authentication and TLS.  
  Status: `BLOCKED — deployment Redis config unavailable` · Evidence: validator rejects non-TLS `redis://`, loopback hosts and missing Redis passwords when `REDIS_URL` is set; regression tests passed in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746). Blocker: inspect the actual hosted Redis setting without displaying its value, confirm TLS/auth, and test cache/queue behavior in staging.
- [x] **PR-033** verify error reporting without unnecessary PII.  
  Status: `DONE` · Evidence: [`sanitizeSentryEvent`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/src/utils/sentryEventSanitizer.js) removes user identity, request bodies, query strings, credential headers, event extras, and raw exception/breadcrumb messages; production error logs omit raw exception messages. The Sentry sanitizer regression tests passed in [CI run 40283103902](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40283103902). Live Sentry project settings still require a staging check.
- [x] **PR-034** audit VITE variables for exposed secrets.  
  Status: `DONE WITH LIMITATION` · Evidence: all currently consumed `VITE_*` values are public-only configuration (API/site origin, rollout booleans, Google client ID, public support and social URLs); payment, database, JWT, SMTP, LLM and Web Push private keys are backend-only in the checked source/examples. Current-tree secret-pattern scan found no common credential prefixes. Limitation: this is not a full historical Git-object/secret scan; treat any later-discovered committed credential as compromised and rotate it.
- [x] **PR-035** document feature flags and safe defaults.  
  Status: `DONE` · Evidence: root and server `.env.example` plus [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md) document feature flags, defaults and production handling; [`docs/BUILD_WITH_AI_V2_ROLLOUT.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/BUILD_WITH_AI_V2_ROLLOUT.md) provides rollout guidance. Feature flags remain off by default pending staged rollout.
- [x] **PR-036** coordinate Build with AI frontend/server flags.  
  Status: `DONE` · Evidence: [`src/pages/Courses.tsx`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/src/pages/Courses.tsx) reads `VITE_INTENT_V2` and `VITE_ASYNC_ROADMAP`; backend configuration exposes corresponding `INTENT_V2` and `ASYNC_ROADMAP` switches. The inventory calls out their coordinated rollout and frontend rebuild requirement; defaults are false. Keep production rollout disabled until the end-to-end async flow has passed staging.
- [ ] **PR-037** verify timezone currency locale and canonical URLs.  
  Status: `BLOCKED — public production host needed` · Evidence: canonical URL manager and public/private route tests passed in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746); it emits tags only for known public routes and ignores invalid/non-HTTPS/loopback origins. Currency defaults are INR and notification timezone default is `Asia/Kolkata`. Blocker: set `VITE_PUBLIC_SITE_URL` to the verified deployed public hostname and inspect the deployed HTML; no production domain is recorded in repository sources, so none was guessed.
- [ ] **PR-038** separate staging and production credentials.  
  Status: `BLOCKED — secret-manager values inaccessible` · Evidence: [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md) requires separate development/staging/production credentials and lists all provider secrets. Blocker: deployment/provider secret-manager configuration is not available through the repository connector; verify environment separation without disclosing values.
- [x] **PR-039** document secret rotation and revocation.  
  Status: `DONE` · Evidence: [`docs/SECRETS_ROTATION_AND_REVOCATION.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/SECRETS_ROTATION_AND_REVOCATION.md) documents rotation, validation, revocation and incident response for JWT, MongoDB, Razorpay, OAuth, Gemini, YouTube, SMTP, Web Push, Redis and Sentry. This is a runbook, not evidence that any live credential has been rotated.

### C. Authentication

- [x] **PR-040** test registration validation and boundaries.  
  Status: `DONE` · Evidence: registration validation and boundary tests in [authRegistrationValidation.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authRegistrationValidation.test.js) and [authSchemas.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authSchemas.test.js) passed in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-041** test duplicate registration race.  
  Status: `DONE` · Evidence: duplicate registration race returns a safe 409 in [authRegistrationRace.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authRegistrationRace.test.js); backend suite passed in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-042** verify password hashing and policy.  
  Status: `DONE` · Evidence: bcrypt hash/compare, serialized password exclusion and 72-byte UTF-8 policy are covered in [userPassword.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/userPassword.test.js) and [authSchemas.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authSchemas.test.js); backend suite passed in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-043** test login success and safe failure responses.  
  Status: `DONE` · Evidence: [authLogin.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authLogin.test.js) covers successful login challenge, safe credential failures, inactive accounts and unverified local users; [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104) passed.
- [x] **PR-044** test email verification expiry replay and resend.  
  Status: `DONE` · Evidence: [otpSecurity.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/otpSecurity.test.js) covers email OTP one-time use/expiry; [otpResendFlow.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/otpResendFlow.test.js) covers cooldown and email dispatch. Full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-045** test login OTP expiry retries and cooldown.  
  Status: `DONE` · Evidence: [otpSecurity.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/otpSecurity.test.js) covers login OTP expiry, attempts, lockout and replay; cooldown/resend tests pass in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-046** test forgot-password enumeration resistance.  
  Status: `DONE` · Evidence: [forgotPasswordEnumeration.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/forgotPasswordEnumeration.test.js) checks matching public responses for unknown accounts and processing failures. Fix: [5ede19d](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/5ede19d). Full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-047** test reset OTP expiry and reuse prevention.  
  Status: `DONE` · Evidence: [otpSecurity.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/otpSecurity.test.js) covers password-reset OTP purpose, expiry and replay rejection; full backend suite passed in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-048** test Google sign-in success.  
  Status: `DONE` · Evidence: [googleLogin.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/googleLogin.test.js) covers Google user creation, verified local-account linking, unverified-email rejection and inactive accounts; full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-049** test Google prompt dismissal and token failure.  
  Status: `DONE` · Evidence: [google-auth.e2e.spec.ts](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/google-auth.e2e.spec.ts) runs in the blocking Playwright step in [ci.yml](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.github/workflows/ci.yml); browser smoke tests passed in [CI 40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-050** verify OAuth issuer audience and account linking.  
  Status: `DONE WITH LIMITATION` · Evidence: [googleLogin.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/googleLogin.test.js) verifies configured audience is passed to Google `verifyIdToken` and tests linking/unverified-email rejection. Google Identity library performs signed-token/issuer checks; real provider credential checks remain under `REL-004` staging verification. Full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-051** test logout state cleanup.  
  Status: `DONE` · Evidence: [navigation.e2e.spec.ts](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies client credentials clear if logout API fails; [authTokenRevocation.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authTokenRevocation.test.js) verifies server-side revocation across devices. Full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-052** test malformed expired and revoked tokens.  
  Status: `DONE` · Evidence: [authTokenRevocation.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authTokenRevocation.test.js) covers malformed, expired, legacy and revoked tokens; required and optional middleware both check token version. Full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-053** test session expiry and concurrent sessions.  
  Status: `DONE` · Evidence: [authTokenRevocation.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authTokenRevocation.test.js) verifies multi-device logout revocation, password-change token rotation and expired-token rejection; full CI passed in [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104).
- [x] **PR-054** test admin invitation accept expire and revoke.  
  Status: `DONE` · Evidence: [`adminInvitationsController.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminInvitationsController.test.js) covers invalid/expired/revoked/used invitations, atomic acceptance claims, role assignment, and revocation/audit behavior; [`adminInvitationMongo.integration.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminInvitationMongo.integration.test.js) checks concurrent acceptance/revocation. Full backend suite passed in [CI 40290327188](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40290327188).
- [x] **PR-055** test suspended accounts across existing sessions.  
  Status: `DONE` · Evidence: [`authTokenRevocation.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authTokenRevocation.test.js) verifies inactive users are rejected by required and optional auth middleware even with a correctly signed token; exact candidate [CI 40290327188](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40290327188) passed.
- [ ] **PR-056** review account deletion and retention.  
  Status: `FAIL` · Evidence: [`docs/CONSENT_AND_PERMISSIONS_AUDIT_PLAN.md` C16](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/CONSENT_AND_PERMISSIONS_AUDIT_PLAN.md) explicitly says a full export/deletion rights workflow was not found; source route audit found no account export/delete request endpoint or orchestrator. [Proposed operating procedure](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/PRIVACY_REQUESTS_AND_RETENTION.md) is documentation only and does not implement the workflow. Finding: `DATA-001` P1 — identity verification, data-category inventory, retention/legal-hold rules, auditable request tracking, deletion/anonymization orchestration, backup expiry, retries and completion evidence are not implemented.
- [x] **PR-057** review CSRF for state-changing requests.  
  Status: `DONE WITH LIMITATION` · Evidence: authenticated frontend requests use an explicit `Authorization: Bearer` header from localStorage in [`src/lib/api.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/src/lib/api.ts); the backend has no cookie-session authentication in the reviewed auth routes and configures CORS with `credentials: false` in [`server.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/src/server.js). A cookie-based CSRF token is not applicable to this flow. CORS alone is not the CSRF control; XSS/storage compromise remains a separate risk and must be reviewed.
- [x] **PR-058** test CORS allowlist and arbitrary-origin rejection.  
  Status: `DONE` · Evidence: [`corsPolicy.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/corsPolicy.test.js) verifies production accepts only the configured origin, rejects arbitrary/deceptive origins and localhost origins, while development accepts known loopback ports. The full backend suite passed in [CI 40290327188](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40290327188).
- [x] **PR-059** test auth rate limits and accessible states.  
  Status: `DONE` · Evidence: [`authRateLimit.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authRateLimit.test.js) exercises the configured 30 requests per 15-minute auth limit and verifies a safe 429 response; [`auth-accessibility.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/auth-accessibility.e2e.spec.ts) verifies associated labels, password visibility state, assertive login errors, and no session stored after rejection. Both tests are in blocking CI run [40290839107](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40290839107), green on code candidate `695850e4307a6f7abab58e7513e56b44d4b58c39`.

### D. Authorization and privacy

- [x] **PR-060** enumerate roles and fail closed for unknown roles.  
  Status: `DONE` · Evidence: [`adminRbac.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRbac.test.js) and [`adminAuthMiddleware.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminAuthMiddleware.test.js) cover declared role profiles and fail-closed behavior for unknown roles, permissions, and permission overrides. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-061** verify every admin API permission middleware.  
  Status: `DONE` · Evidence: [`adminRoutePermissionCoverage.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRoutePermissionCoverage.test.js), [`adminRouteAuthorization.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRouteAuthorization.test.js), and [`adminLegacyRouteAuthorization.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminLegacyRouteAuthorization.test.js) enumerate protected route permission gates, verify role access, and reject forged principals. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-062** verify frontend guards are not security boundaries.  
  Status: `DONE` · Evidence: [`adminRouteAuthorization.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRouteAuthorization.test.js) verifies registered admin routes do not rely on frontend navigation for security; backend middleware enforces role/permission checks. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-063** test unauthenticated protected API access.  
  Status: `DONE` · Evidence: [`adminAuthMiddleware.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminAuthMiddleware.test.js) tests missing bearer and invalid tokens; [`adminMiddleware.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminMiddleware.test.js) rejects unauthenticated/non-admin principals. Protected admin, progress and saved-course routes are mounted behind authentication. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-064** test cross-user profile notes progress and saved items.  
  Status: `DONE` · Evidence: [`userDataOwnership.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/userDataOwnership.test.js) verifies progress and saved-course reads/writes use the authenticated user, profile/consent mutations derive identity from the authenticated principal, and timestamped lesson notes are namespaced by user/course. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-065** test learner denial for admin APIs.  
  Status: `DONE` · Evidence: [`adminRouteAuthorization.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRouteAuthorization.test.js) verifies a learner role, mismatched access type, or forged permission metadata cannot pass admin permission gates. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-066** test admin role allowed and denied actions.  
  Status: `DONE` · Evidence: [`adminRbac.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRbac.test.js), [`adminMiddleware.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminMiddleware.test.js), and route-authorization tests cover finance, publishing, support, and administrator-governance role boundaries. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-067** test export permissions fields and limits.  
  Status: `DONE` · Evidence: [`adminProUserExportValidation.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminProUserExportValidation.test.js) verifies selected IDs, malformed/oversized selection and reason rejection, allowlisted fields, sort bounds, row limit, and audit event. [`admin-access.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/admin-access.e2e.spec.ts) requires a reason and exact `EXPORT 1 USERS` confirmation. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-068** test PII reveal reason permission and audit.  
  Status: `DONE` · Evidence: [`adminPiiReveal.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminPiiReveal.test.js) covers reason validation, redacted audit before revealing PII, fail-closed behavior if both audit stores fail, and masked lists. [`admin-access.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/admin-access.e2e.spec.ts) tests the permission/reason UI. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-069** mask PII in lists logs notifications and errors.  
  Status: `DONE` · Evidence: [`adminPiiReveal.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminPiiReveal.test.js) verifies masked lists; [`adminSensitiveOutput.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminSensitiveOutput.test.js) verifies delivery-log email/URL redaction; [`safeRequestLog.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/safeRequestLog.test.js), [`auditSanitizer.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/auditSanitizer.test.js), and [`sentryEventSanitizer.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/sentryEventSanitizer.test.js) cover secrets in logs, audit snapshots and telemetry. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-070** test admin status-change reason and audit.  
  Status: `DONE` · Evidence: [`adminUserStatusAudit.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminUserStatusAudit.test.js) and [`adminProUserStatusReason.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminProUserStatusReason.test.js) verify reason bounds, before/after audit evidence and administrator-account restrictions; [`admin-access.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/admin-access.e2e.spec.ts) verifies disable/reactivate confirmation and retry behavior. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-071** test role-change authorization and audit.  
  Status: `DONE` · Evidence: [`adminRolesController.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRolesController.test.js) verifies role-change audit/queue behavior, last-active Super Admin protection, governance lock and reason validation; route authorization tests verify the `admin_roles.manage` permission boundary. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-072** test destructive-action confirmation and server validation.  
  Status: `DONE` · Evidence: [`adminCourseContentDeletion.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminCourseContentDeletion.test.js) verifies module/lesson/resource deletes reject missing, short, oversized reasons and malformed identifiers before database access. [`admin-access.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/admin-access.e2e.spec.ts) verifies deletion requires the exact typed phrase and a reason, and sends that reason to the API. Full CI passed on [candidate 6afca876](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329).
- [x] **PR-073** test consent capture withdrawal and timestamps.  
  Status: `DONE` · Evidence: [`consentPersistence.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/consentPersistence.test.js) verifies Terms/Privacy versions/timestamps, marketing opt-in synchronization, withdrawal timestamps, and immutable consent events; [`consentValidation.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/consentValidation.test.js) covers input/event validation. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-074** separate marketing and transactional consent.  
  Status: `DONE WITH LIMITATION` · Evidence: [`consentPersistence.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/consentPersistence.test.js) and [`consentValidation.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/consentValidation.test.js) verify marketing opt-in/withdrawal syncs only the announcements preference and records separate consent; authentication OTP email is handled by the separate transactional [`otp.service.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/src/services/otp.service.js). Real provider delivery remains a staging gate under REL-004. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-075** test fail-closed behavior when audit persistence fails.  
  Status: `DONE` · Evidence: [`adminPiiReveal.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminPiiReveal.test.js) verifies PII is not returned when both primary audit persistence and outbox fallback fail; [`auditOutbox.service.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/auditOutbox.service.test.js) covers dual-store failure. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-076** test audit outbox retry dedupe and dual-store failure.  
  Status: `DONE` · Evidence: [`auditOutbox.service.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/auditOutbox.service.test.js) tests retry queueing, idempotent replay/dedupe, bounded exponential backoff, and failure when both stores are unavailable. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [x] **PR-077** redact passwords tokens OTPs and payment secrets.  
  Status: `DONE` · Evidence: [`auditSanitizer.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/auditSanitizer.test.js), [`safeDeliveryError.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/safeDeliveryError.test.js), [`safeRequestLog.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/safeRequestLog.test.js), and [`sentryEventSanitizer.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/sentryEventSanitizer.test.js) cover secret-like keys, URL/query leakage, credential headers, provider errors and bounded diagnostics. Passed in [CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679).
- [ ] **PR-078** review privacy retention export and deletion obligations.  
  Status: `FAIL` · Evidence: [`docs/CONSENT_AND_PERMISSIONS_AUDIT_PLAN.md` C16](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/CONSENT_AND_PERMISSIONS_AUDIT_PLAN.md) identifies export/deletion/correction and retention as unimplemented; [`docs/PRIVACY_REQUESTS_AND_RETENTION.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/PRIVACY_REQUESTS_AND_RETENTION.md) is a proposed procedure, not runtime functionality. Shares P1 finding `DATA-001`: there is no complete authenticated data export/deletion workflow, approved category-level retention schedule, legal-hold workflow, backup-expiry policy, or verified deletion outcome.
- [x] **PR-079** compare admin route permissions with page and data access.  
  Status: `DONE` · Evidence: [`adminPagePermissionCoverage.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminPagePermissionCoverage.test.js) inventories all App `/admin` routes and requires an explicit page permission; [`adminRoutePermissionCoverage.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRoutePermissionCoverage.test.js) and [`adminRouteAuthorization.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/adminRouteAuthorization.test.js) cover backend endpoint gates. Browser regression directly visits `/admin/design-system` under a restricted role. Full CI passed on [candidate 6afca876](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329).

### E. Catalogue and pricing

- [x] **PR-080** test catalogue search filters sort and pagination.  
  Status: `DONE` · Evidence: [`navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies query/level/category filters sync with the request in `[EXP-SEARCH-001]` and verifies Title A–Z sorting, 12-item pagination, and next/previous page navigation in `[EXP-CATALOG-SORT-PAGE-001]`. Explore now offers Recent, Popular, and Title A–Z options and resets pagination when filters or sorting change. Full CI passed on [candidate 6afca876](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329).
- [x] **PR-081** test catalogue empty loading error offline retry states.  
  Status: `DONE` · Evidence: [`navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) tests delayed catalogue loading skeletons in `[EXP-CATALOG-LOADING-001]` and disconnect/retry recovery in `[EXP-CATALOG-RETRY-001]`. UI renders a shared retryable error for failed catalogue requests, keeps empty results distinct from loading, and retries without a full page reload. Full CI passed on [candidate 6afca876](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329).
- [x] **PR-082** test course details missing fields and long titles.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) adds `[EXP-COURSE-DETAILS-ROBUST-001]` for a course payload missing optional display fields, zero lessons, and a very long title; it checks the page and curriculum empty state render without runtime errors. Passed in [CI 40468810696](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40468810696) on candidate `4156cf62716fba9a11ff48e14ff42e870d92f0bf`.
- [x] **PR-083** test card navigation and independent action buttons.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) covers course title/CTA navigation, and `[EXP-COURSE-CARD-ACTION-001]` verifies Save acts independently without triggering card navigation or enrollment. The stacked-link defect was fixed by setting `.bfs-course-card__body` above the stretched card link in [`learner-components.css`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/src/styles/learner-components.css). Passed in [CI 40469653330](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40469653330) on candidate `8d70ccc9dc726afb17a948e1807735f1950676a8`.
- [x] **PR-084** test zero-review display accuracy.  
  Status: `DONE` · Evidence: `[EXP-COURSE-CARD-REVIEWS-001]` in [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies a course with zero ratings is labeled `No ratings yet` on the card, opens the separate reviews route, and shows `No published reviews yet` without a false `0.0` rating or enrollment mutation. Passed in [CI 40469653330](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40469653330) on candidate `8d70ccc9dc726afb17a948e1807735f1950676a8`.
- [x] **PR-085** compare prices and currencies across user surfaces.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies a fractional INR course price is formatted consistently on Explore card, course details, and subscription-plan surfaces. Passed in [CI 40313595957](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40313595957) on candidate `a48495c8ed`.
- [x] **PR-086** test admin price edits propagate correctly.  
  Status: `DONE` · Evidence: [`tests/admin-access.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/admin-access.e2e.spec.ts) now simulates pricing preview, a failed apply, a successful retry, and an updated course catalogue response; it asserts the refreshed catalogue row displays `₹499` after the apply. Passed in [CI 40469962130](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40469962130) on candidate `5342d4ffc9d78e13ba6d523d43f8141785a1ae07` (including test change from commit [`3c86387`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/3c86387de5a99fd9360cd4a8e3116c9522e7c3f3)).
- [x] **PR-087** test free-course setting through enrollment and access.  
  Status: `DONE` · Evidence: `[DETAIL-FREE-ENROLLMENT-ACCESS-001]` in [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies an authenticated learner can enroll in a free course, see the learning hub, and does not trigger payment checkout. Passed in [CI 40470211985](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40470211985) on candidate `40fda6f99bb36c0154c85794ff6340be110c0418`.
- [x] **PR-088** test invalid negative and non-finite prices fail closed.  
  Status: `DONE` · Evidence: [`server/test/coursePricing.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/coursePricing.test.js) now tests negative, zero, NaN, positive/negative infinity, string, missing base prices and invalid sale prices; assertions require fail-closed pricing and validation errors. Passed in [CI 40470486555](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40470486555) on candidate `b4b3402417bcc31d73a9a4ed0d6bac23935751a7`.
- [x] **PR-089** test currency formatting and minor-unit conversions.  
  Status: `DONE` · Evidence: [`razorpayAmounts.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/razorpayAmounts.test.js) covers INR/USD major↔minor conversion, zero-decimal JPY, Razorpay's supported 3-decimal currencies (BHD/KWD/OMR), unsupported precision and invalid inputs; [`refundBalance.service.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/refundBalance.service.test.js) verifies refund comparisons use currency-specific minor-unit precision. Hard-coded x100 provider-refund comparisons were replaced with `refundAmountsMatch`, and exhausted negative balances now resolve to `refunded`. The full blocking CI run [40473426742](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40473426742) passed on candidate `9645427b0a2e399913f151fef159459c2da21768`.
- [x] **PR-090** verify configured plan order across currencies.  
  Status: `DONE` · Evidence: [`subscriptionPlanOrder.test.js`](https://github.com/yashodipdeore/BuddyForStudy.V2/blob/main/server/test/subscriptionPlanOrder.test.js) verifies the public billing endpoint applies `{ sortOrder: 1, createdAt: 1 }` and returns the configured order for INR/USD/JPY plans with different billing intervals; [`navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies Pricing renders the same sequence without re-sorting mixed currencies or periods. Full frontend/backend CI passed in [run 40473833432](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40473833432) on candidate `03ca5f59c18819d7a35a5de90d2cd03237ba604a`.
- [ ] **PR-091** match plan period features price and CTA to backend.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-092** test preview does not expose paid content.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-093** test draft published archived deleted visibility.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-094** test publishing readiness error guidance.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-095** test module lesson CRUD reorder persistence.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-096** validate video and resource URLs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-097** test review validation duplicates and moderation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-098** test course restore and revision rollback.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-099** ensure course edits do not expose drafts or revoke valid access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### F. Learning progress and quizzes

- [ ] **PR-100** test player deep links and invalid lesson IDs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-101** test previous/next lesson navigation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [x] **PR-102** verify completion UI updates without refresh.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) now verifies the primary completion action and sidebar state both update without a page reload, and the progress GET is not repeated after the completion POST. Passed in [CI 40305609446](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40305609446) on candidate `94fa470c08ccf9a0c37d3030baf0ea85bc022b57`.
- [x] **PR-103** verify uncompletion UI and backend state.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies DELETE completion updates the sidebar and main action back to incomplete without a page refresh. Backend `uncompleteItem` also updates progress and enrollment status. Passed in [CI 40306445526](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40306445526) on candidate `f0e4784d7f703801f8a84d464f5d49bca8def7e9`.
- [x] **PR-104** test repeated completion idempotency.  
  Status: `DONE` · Evidence: [`server/test/progressServiceIdempotency.test.js`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/progressServiceIdempotency.test.js) calls `completeItem` twice for the same lesson and verifies one completion record, unchanged count/percentage, and learning activity persisted once. The browser test also verifies the main completion action is disabled after completion. Passed in [CI 40306445526](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40306445526).
- [x] **PR-105** verify first quiz submission completes lesson regardless of score.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) verifies the first course-module quiz submission completes the lesson even when the score is `0%`; quiz grade and completion POST each happen once, and the sidebar reflects the completed state. Passed in [CI 40305609446](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40305609446).
- [x] **PR-106** preserve graded result if progress save fails.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) forces the first lesson-progress save to return `503` and verifies the graded `0%` quiz result remains visible with an accessible alert instead of being replaced by a page-level error. Passed in [CI 40305609446](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40305609446).
- [x] **PR-107** retry progress save without regrading quiz.  
  Status: `DONE` · Evidence: [`tests/navigation.e2e.spec.ts`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/tests/navigation.e2e.spec.ts) retries lesson completion through the sidebar after a transient save failure and verifies the quiz-grade endpoint remains at one request while progress POST is retried exactly once. Passed in [CI 40305609446](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40305609446).
- [ ] **PR-108** test missing answers malformed payloads and duplicate submits.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-109** separate quiz pass state from lesson completion.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-110** prevent premature answer-key disclosure.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-111** test cross-user/course/lesson quiz access denial.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-112** test practice quiz loading pending empty and error states.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-113** prevent pending-review AI questions being treated as approved.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-114** test notes CRUD timestamp bounds and isolation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-115** test feedback submission duplicate protection and retry.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-116** verify progress denominator count and percentage.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-117** compare progress after mutation and reload.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-118** test saved roadmap continue complete quiz and delete.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-119** test roadmap async recovery duplicate request and quota failure.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### G. Payments and refunds

- [ ] **PR-120** test eligible paid-course checkout.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-121** test concurrent checkout idempotency.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-122** reuse pending order only if order price currency match.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-123** test stale order conflict and recovery guidance.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-124** match pending subscription plan and conversion intent.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-125** test concurrent subscription checkout eligibility.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-126** test provider order failure cleanup.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-127** prevent client price currency plan course or user override.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-128** test payment signature valid invalid and replay.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-129** verify provider order captured status amount currency.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-130** test successful verification and idempotent access restore.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-131** prevent failure webhook overwriting paid/refunded state.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-132** prevent capture webhook rewriting terminal states.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-133** verify provider-required raw webhook signature.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-134** test webhook claims concurrency duplicates and retries.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-135** alert mismatched webhook without granting access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-136** validate subscription charge relationship and actual amount.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-137** test renewal upgrade downgrade cancellation expiry grace.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-138** test refund eligibility amount bounds and duplicate request.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-139** test partial/full refund balance reconciliation and access revocation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### H. Notifications and workers

- [ ] **PR-140** test notification list unread count and mark-read actions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-141** enforce notification preferences by category/channel.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-142** verify notification links are valid and authorized.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-143** test partial and total delivery failures.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-144** deduplicate payment and completion notifications.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-145** test email templates for critical transactional messages.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-146** test SMTP failure retry and suppression.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-147** test push denied unsupported expired and cleanup cases.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-148** restrict push test-send and protect subscription secrets.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-149** test outbox persistence retry backoff and dead-letter.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-150** test scheduled notifications timezone and duplicate runs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-151** test audience filter correctness and category separation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-152** compare campaign preview and eligible audience.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-153** enforce consent unsubscribe batching and provider limits.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-154** test campaign dry-run send confirmation and delivery report.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-155** bound manual retries and audit them.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-156** test worker heartbeat stale-job recovery and shutdown.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-157** verify worker deployment and supervision.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-158** alert on backlog and repeated failures.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-159** test trial grants atomicity idempotency and audit.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### I. Build with AI and providers

- [ ] **PR-160** test intent parser valid ambiguous and malformed input.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-161** test prompt plan size and adversarial input.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-162** verify intent endpoint feature flag auth and rate limit.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-163** test AI timeout outage malformed JSON and schema validation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-164** bound provider retries with backoff.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-165** test quota counters concurrency and reset boundary.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-166** verify exhausted quota fallback UX.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-167** verify cached resource validity and attribution.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-168** filter invalid private and deleted curation videos.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-169** test YouTube forbidden/quota errors and cache fallback.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-170** enforce roadmap concurrency and user rate limits.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-171** test async roadmap owner/admin isolation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-172** test polling event cleanup timeout resume cancellation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-173** keep generation failures retryable and incomplete.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-174** test AI content moderation and review policy.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-175** test prompt injection from user/resource content.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-176** allowlist tools and validate server-side arguments.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-177** prevent arbitrary URL fetch code execution and data access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-178** exclude sensitive prompts from telemetry.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-179** test feature-flag rollback without data loss.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### J. UX and accessibility

- [ ] **PR-180** audit route loading empty success error denied offline states.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-181** verify every button action and duplicate guard.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-182** verify link destinations and accessible names.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-183** verify form labels required fields and server errors.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-184** test modal focus trap Escape and focus restoration.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-185** test drawer/menu keyboard navigation and focus.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-186** verify keyboard reachability and visible focus.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-187** verify heading hierarchy landmarks and semantics.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-188** check text status and focus contrast against WCAG AA.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-189** verify useful alt text and decorative images.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-190** verify reduced-motion support.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-191** test mobile tablet laptop and wide layouts.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-192** test tables dialogs cards for clipping and overflow.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-193** test long titles names URLs prices and errors.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-194** test player video and quiz on touch screens.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-195** verify toast and inline feedback accessibility.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-196** verify destructive confirmation and recovery.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-197** test browser back forward refresh and deep links.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-198** validate footer social About Contact FAQ Pricing legal links.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-199** run Playwright on production build and add P0/P1 regressions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### K. Backend and operations

- [ ] **PR-200** review Express security headers and body limits.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-201** validate and bound API inputs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-202** scope database queries to owner and prevent mass assignment.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-203** review Mongo indexes uniqueness and performance.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-204** test duplicate-key races and controlled errors.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-205** review transactions and compensating actions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-206** test database outage slow query and recovery.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-207** verify backup access and network restrictions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-208** restore backup in isolation and document RPO/RTO.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-209** test Redis outage cache invalidation and lock behavior.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-210** verify checkout lock expiry ownership and release.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-211** verify distributed rate limiting across instances.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-212** test graceful shutdown and cleanup.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-213** verify liveness/readiness dependency semantics.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-214** run deployment verification script.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-215** correlate API webhook and worker logs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-216** verify log retention and PII redaction.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-217** alert on 5xx payments webhooks backlog and quota.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-218** run dependency secret and vulnerability scans.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-219** test injection SSRF redirects unsafe HTML and traversal.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### L. Staging and launch

- [ ] **PR-220** create isolated production-like staging.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-221** verify frontend deployment and SPA deep links.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-222** verify backend start runtime port and health path.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-223** verify worker deployment and supervision.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-224** verify migrations/indexes repeatability and order.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-225** verify deployed API URLs CORS and callbacks.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-226** verify TLS HTTPS redirects secure cookies HSTS.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-227** verify cache cannot expose private or stale pricing data.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-228** verify asset upload limits and content types.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-229** run end-to-end tests against deployed staging.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-230** run sandbox OAuth payment webhook SMTP and push tests.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-231** run AI/YouTube smoke tests with strict quota.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-232** create visitor learner paid expired and admin test accounts.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-233** link evidence for every launch gate.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-234** define alert thresholds escalation and on-call.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-235** define rollback triggers for auth payments 5xx and progress.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-236** practice rollback to previous release.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-237** verify feature-flag rollback where supported.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-238** run post-deploy registration login browse learn checkout admin smoke.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-239** record final release decision accepted risks owner and review date.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

## Findings and remediation log

| Finding ID | Severity | Task ID(s) | Reproduction/evidence | Root cause | Fix commit | Regression test | Retest |
|---|---|---|---|---|---|---|---|
| REL-001 | P1 | PR-004, PR-020 | GitHub API: `main.protected=false`; no release workflow enforces candidate checks | Branch protection/ruleset is not enabled, so failing/pending checks do not prevent merges/releases | Manual repository settings required | Enable PR reviews and require frontend/backend jobs; verify red/pending jobs block merge | OPEN — settings write access unavailable through connector |
| REL-002 | P2 | PR-011 | Initial strict backend lint surfaced 65 errors; discovery course code used undefined `level`; green CI now runs backend lint and syntax checks | Legacy unused symbols and intentionally empty catches caused lint failures; one actual undefined identifier was corrected; remaining unused-symbol findings are warnings | `ef7aacf` (lint policy), `0ca81cb` (undefined level), `fd6fe03` (escape cleanup) | Backend lint + tests + syntax checks | CI PASS in [40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017); warning cleanup remains OPEN |
| REL-003 | P1 | PR-014 | Initial `npm ci` rejected the committed peer-dependency tree; install now succeeds with project npm config | Lockfile omitted optional MongoDB peer integrations and npm's default resolution did not match the committed tree | `c22ae9d` (`server/.npmrc`); CI now uses `npm ci` | Run clean installs for frontend/backend, then backend tests | RESOLVED — both clean installs and backend tests passed in [40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017) |
| REL-004 | P1 | PR-023, PR-024, PR-026–PR-030, PR-038 | Source validators/tests are verifiable, but deployed environment values and provider-console settings are not available in this session | Production secrets, OAuth origins, API restrictions, quotas and SMTP delivery must be confirmed in deployment/provider consoles without exposing secret values | Production config validator and env inventory | Run config preflight and deployment smoke tests; verify OAuth, Razorpay, Gemini, YouTube quota, SMTP OTP delivery and environment separation in staging | BLOCKED — do not waive for production release |
| REL-005 | P2 | PR-021 | `src/lib/socialLinks.ts` had Facebook/GitHub social variables and rollout flags missing from example/types | Frontend env types and inventory drifted from actual public flags and social-link usage | `3b67883`, `d152ea3`, `f7d800b` | Frontend typecheck and current env/type inventory inspection; successful CI run [40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746) | RESOLVED — current example, declarations, code and inventory agree |
| REL-006 | P1 | PR-030 | CI run [40283675707](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40283675707) exposed malformed Web Push URL regex syntax | SMTP/Web Push/Redis config validation was added before its final regex source was syntactically valid | `51ece64` | Backend lint, synthetic production config preflight, tests and canonical-route Playwright tests pass in [CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746) | RESOLVED — keep live SMTP provider delivery under REL-004 staging gate |
| AUTH-001 | P1 | PR-051–PR-053 | Logout previously cleared only the local browser token and issued JWTs remained valid until expiry; password change/reset did not invalidate other sessions | Tokens had no per-user revocation/version check | `0dd1377` | [authTokenRevocation.test.js](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/server/test/authTokenRevocation.test.js) tests stale/legacy/expired tokens, multi-device logout revocation and password rotation; exact-candidate CI [40289400104](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40289400104) passed | RESOLVED — token version now checked in required and optional auth middleware; logout increments it atomically; password change/reset atomically rotate it and return a fresh token |
| DATA-001 | P1 | PR-056, PR-078 | The consent audit plan states a full account export/deletion rights workflow was not found; route/source review found no authenticated request tracker or deletion/export orchestrator | Account data rights/retention process is described generically in policy/contact copy but has no operational workflow, approved category-by-category retention schedule, legal-hold path, or verified deletion/export outcome | Proposed procedure documented in [`docs/PRIVACY_REQUESTS_AND_RETENTION.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/PRIVACY_REQUESTS_AND_RETENTION.md); runtime fix not yet implemented | Required: identity-verified request tracking, permission-scoped export, reviewed idempotent deletion/anonymization orchestration, retention/legal-hold handling, backup expiry, retry and post-operation verification tests | OPEN — P1 launch blocker; proposed document is not implementation evidence |

## Execution log

| Date (UTC) | Candidate SHA | Tasks executed | Done | Fail | Blocked | Remaining | Evidence | Notes |
|---|---|---|---:|---:|---:|---:|---|---|
| 2026-10-26 | Code/config candidate `c9e6941` verified green in [run 40282290084](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40282290084); checklist documentation commits follow | PR-001–PR-018, PR-020–PR-022, PR-025; PR-019 pending | 18 | 2 | 8 | 211 | [Green candidate CI](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40282290084) | CI passes config preflight, frontend build/smoke tests and backend tests. Branch protection/release gate fails; local working-tree, owner assignment and live staging/provider checks are blocked; backend unused-symbol warnings remain P2 cleanup. |
| 2026-10-26 | Candidate `f7d800b` includes public environment inventory/type fixes | PR-021 retest pending | 17 | 3 | 8 | 211 | [Inventory fix](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/f7d800bf4926e5768034953c096f964f4091fbcc) | Source audit found missing public social-link vars and missing rollout flag types. Fix committed; keep `REL-005` open until CI typecheck/build passes on a candidate including these commits. |
| 2026-10-26 | Candidate `51ece64` (SMTP/Web Push/Redis validator + canonical-route coverage) verified green | PR-021, PR-030 validation code | 23 | 2 | 13 | 201 | [Successful CI run 40284067746](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746) | Synthetic config preflight, backend lint/tests, frontend typecheck/build and canonical public/private route Playwright tests passed. Live SMTP/Web Push/Redis values remain a staging/provider task. |
| 2026-10-26 | Security/auth-response candidate `2021402` | PR-033–PR-039 plus auth tasks under validation | 23 | 2 | 13 | 201 | [Last fully green relevant CI](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284067746); [current candidate CI](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40284256463) | Auth error responses now redact untrusted internal messages; do not mark the newest auth changes verified until the current CI run completes successfully. Branch protection and staging/provider gates remain open. |

| 2026-10-26 | Code candidate `695850e4307a6f7abab58e7513e56b44d4b58c39` verified green | PR-054–PR-059 checked; PR-056 FAIL recorded | 43 | 3 | 13 | 180 | [Green exact-code CI 40290839107](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40290839107); [privacy workflow gap](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/PRIVACY_REQUESTS_AND_RETENTION.md) | Blocking CI passed frontend and backend jobs, including actual auth limiter behavior and login accessibility tests. Current `main` also has checklist documentation follow-up. `DATA-001` remains a P1 launch blocker; branch protection and live staging/provider checks remain open. |

| 2026-10-26 | Exact candidate `392be5a5a90b8e4418abe42767cf113dc1c824bb` | PR-060–PR-071, PR-073–PR-078 verified | 60 | 4 | 13 | 162 | [Green CI 40304531679](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40304531679); [ownership test](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/1422120a3c3d184daf9e8b2c8c818e7dc8945a34); [consent test](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/392be5a5a90b8e4418abe42767cf113dc1c824bb) | Verified role/permission boundaries, user-data ownership, export controls, PII/error redaction, role/status audit, consent persistence/withdrawal, and audit outbox behavior. DATA-001 remains a P1 failure under PR-056 and PR-078; PR-072 and PR-079 remain unchecked pending exhaustive destructive-action/page-to-permission mapping. |

| 2026-10-26 | Exact candidate `94fa470c08ccf9a0c37d3030baf0ea85bc022b57` | PR-102, PR-105–PR-107 verified | 64 | 4 | 13 | 158 | [Green CI 40305609446](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40305609446) | Player E2E verifies immediate completion UI updates, first failing-score quiz completion, preservation of graded result on progress-save failure, and retry without regrading. PR-103 and PR-104 remain open pending the uncompletion/idempotency test candidate `f0e4784d`. |

| 2026-10-26 | Exact code candidate `f0e4784d7f703801f8a84d464f5d49bca8def7e9` | PR-103 and PR-104 verified | 66 | 4 | 13 | 156 | [Green CI 40306445526](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40306445526); [idempotency test commit](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/f0e4784d7f703801f8a84d464f5d49bca8def7e9) | Uncompletion updates the UI immediately without a refresh; backend repeated completion remains idempotent and records learning activity once. Quiz completion and failed-save retry behavior remain green. DATA-001 and release-control/staging gates remain open. |

| 2026-10-26 | Exact candidate `6afca87678f4fb181ad5d10e3c1a8226214edfd2` | PR-072, PR-079–PR-081 verified | 70 | 4 | 13 | 152 | [Green CI run 40312089329](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40312089329); [audited deletion commit](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/a00e12019e41d4a6e4f3122d6e8baa50bc98241c); [catalogue UI commit](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/0b714b7c327586eede79e015c22dba64b52d8d96) | Destructive content deletion now requires ID validation, typed confirmation, and an auditable reason; admin page permission inventory passes; Explore now has sort, pagination, loading, and offline retry tests. DATA-001 remains P1, as do branch protection and staging/provider launch gates. |
| 2026-10-27 | Separate verified candidates `4156cf6271` and `a48495c8ed` | PR-082 and PR-085 verified | 72 | 4 | 13 | 150 | [Sparse course page CI 40468810696](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40468810696); [currency consistency CI 40313595957](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40313595957) | Long-title/sparse-course details and cross-surface fractional INR formatting have green evidence. PR-083/PR-084 course-card independent-action tests are being retested after correcting the card stacking context; PR-086 admin pricing-refresh E2E is also added and awaiting CI. Release remains NOT READY on PR-004, PR-020, DATA-001 and blocked live deployment/provider verification. |

| 2026-10-27 | Exact candidate `8d70ccc9dc726afb17a948e1807735f1950676a8` | PR-083 and PR-084 verified | 74 | 4 | 13 | 148 | [Green CI 40469653330](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40469653330); [card stacking fix](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/ca6997de7a7fa2d7ec72789f4e9c6852cb78afbf) | Browser tests confirmed card action links work independently after the stacking-context fix; zero-review states are truthful on both Explore cards and course details. PR-086 admin pricing refresh E2E is being checked in candidate `3c86387de5`; current release blockers are unchanged. |

| 2026-10-27 | Exact candidate `5342d4ffc9d78e13ba6d523d43f8141785a1ae07` | PR-086 verified | 75 | 4 | 13 | 147 | [Green CI 40469962130](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40469962130); [admin pricing refresh E2E commit](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/3c86387de5a99fd9360cd4a8e3116c9522e7c3f3) | Admin pricing apply retry now verifies that after a successful apply, the catalogue reload reflects the updated ₹499 base price. PR-087 free-course enrollment/access E2E has been added on candidate `40fda6f99bb36c0154c85794ff6340be110c0418`; CI is in progress. Release blockers unchanged. |

| 2026-10-27 | Exact candidate `b4b3402417bcc31d73a9a4ed0d6bac23935751a7` | PR-087 and PR-088 verified | 77 | 4 | 13 | 145 | [Green CI 40470486555](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40470486555); [free enrollment CI 40470211985](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40470211985) | Free individual enrollment/access is covered without payment checkout; negative/non-finite base and sale prices fail closed in backend pricing tests. Next up is PR-089: cross-currency formatting and provider minor-unit conversion; current production code contains hard-coded x100 conversions which require correction before this check can pass. Release blockers unchanged. |

| 2026-10-27 | Exact candidate `03ca5f59c18819d7a35a5de90d2cd03237ba604a` | PR-089 and PR-090 verified; PR-091 backend plan/CTA propagation coverage added | 79 | 4 | 13 | 143 | [Green CI 40473833432](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40473833432); [currency conversion test](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/f67ea462b75a2f2420a82847c42fae1ba0fdd03b); [configured plan order test](https://github.com/yashodipdeore2006/BuddyForStudy.V2/commit/03ca5f59c18819d7a35a5de90d2cd03237ba604a) | Currency precision conversion/refund reconciliation and configured subscription plan ordering are green. PR-091 adds direct controller regression coverage ensuring a selected plan's price, currency, billing period, provider plan, subscription term, and persisted payment agree; [CI 40474216977](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40474216977) is in progress. Release decision remains NOT READY due to branch protection, DATA-001 and live staging/provider verification. |
## Related project documents

- `docs/BUG_HISTORY_AND_PLATFORM_AUDIT.md` — reported bugs, known fixes and audit candidates.
- `docs/PLATFORM_UI_UX_FUNCTIONAL_INVENTORY.md` — route/control/API inventory and browser/staging evidence policy.
- `docs/PLATFORM_CONTROL_REGISTER.md` — stable control IDs and browser-test contracts.
- `docs/UI_UX_AUDIT.md` — existing UX findings; its header refers to an older `test`-branch audit, so reconcile findings against `main` before treating them as current.
- `docs/BUILD_WITH_AI_V2_ROLLOUT.md` — feature flags, rollout sequence and rollback guidance.
- `server/src/config/productionConfigValidation.js` and `server/src/scripts/verifyDeployment.js` — production configuration/deployment checks.


## Definition of done

The checklist is complete only when all tasks are `DONE` or have justified, approved `N/A`; every `FAIL` is fixed and retested; blocked tasks are resolved or formally accepted as launch risks; the exact release candidate has green CI; staging evidence is linked; and the release decision is recorded. A task count never overrides a release-blocking defect.

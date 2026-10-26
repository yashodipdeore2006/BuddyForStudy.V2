# BuddyForStudy.V2 — Production & Deployment Readiness Master Checklist

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Release branch:** `main`  
**Version:** 1.0 · **Total tasks:** 239

> **Status policy:** Code existing or a test file existing does not make a task complete. Mark `DONE` only after executing the check on the current candidate and recording evidence. Use `FAIL` for a reproduced defect, `BLOCKED` when environment/access prevents checking, and `N/A` only with a written reason.

## Progress dashboard

| Metric | Current |
|---|---:|
| Total tasks | 239 |
| Verified done | 16 / 239 |
| Failed tasks | 2 / 239 |
| Blocked | 2 / 239 |
| Not checked | 219 / 239 |
| Open findings | 2 (REL-001 P1 release controls; REL-002 P2 lint-warning backlog) |
| Release decision | **NOT READY — branch protection and staging/operations gates remain open** |

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
  Status: `DONE` · Evidence: frontend and backend `npm ci` both passed in [CI run 40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017); `server/.npmrc` keeps optional-peer resolution consistent with the committed lockfile.
- [x] **PR-015** review workflow permissions and fork secret exposure.  
  Status: `DONE` · Evidence: [CI workflow](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/.github/workflows/ci.yml) explicitly grants only `contents: read`, uses `pull_request` (not `pull_request_target`), has no deployment secrets in steps, and sets checkout `persist-credentials: false`.
- [x] **PR-016** scan for committed env files and secrets.  
  Status: `DONE — current tree scan` · Evidence: recursive Git tree scan (518 entries) found only `.env.example` and `server/.env.example` among env/key-like paths; repository code searches returned no matches for common API-key prefixes such as `AIza`, `sk-proj`, `sk-live`, `rzp_live`, `ghp_`, or `mongodb+srv`. Limitation: this is a current-tree pattern scan, not a full historical Git-secret scan.
- [x] **PR-017** record release notes and known risks.  
  Status: `DONE` · Evidence: [`docs/RELEASE_NOTES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/RELEASE_NOTES.md) records verified changes, CI evidence, known risks, and explicit NOT READY status.
- [ ] **PR-018** assign rollback and release decision owners.  
  Status: `BLOCKED` · Evidence: owner identities and formal approval authority are not defined in repository sources, and they cannot be inferred safely. Project owner must record named primary/backup release and rollback owners plus risk-acceptance authority.
- [ ] **PR-019** capture CI for exact candidate SHA.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-020** block release while required checks are red or pending.  
  Status: `FAIL` · Evidence: branch protection is disabled and no separate release/deployment workflow enforces a candidate-CI gate; see `REL-001`. Manual go/no-go notes exist, but they do not prevent an unprotected merge/release.

### B. Configuration and secrets

- [x] **PR-021** inventory frontend and backend environment variables.  
  Status: `DONE` · Evidence: [`docs/ENVIRONMENT_VARIABLES.md`](https://github.com/yashodipdeore2006/BuddyForStudy.V2/blob/main/docs/ENVIRONMENT_VARIABLES.md) documents public frontend values, backend secrets, production requirements, feature flags, bootstrap-only vars and deployment smoke inputs; `server/.env.example` now includes the runtime flags missing from its prior version. The stale OpenAI variable guidance in `server/README.md` was corrected to Gemini.
- [ ] **PR-022** run production config validation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-023** verify strong unique non-placeholder JWT secret.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-024** verify production HTTPS client URL.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-025** verify Razorpay secrets are backend-only.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-026** verify Mongo URI credentials TLS and database.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-027** verify Google OAuth origins and callbacks.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-028** verify LLM keys and model configuration.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-029** verify YouTube API restrictions and quota.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-030** verify SMTP host TLS sender and credentials.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-031** verify Web Push VAPID keys and subject.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-032** verify Redis authentication and TLS.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-033** verify error reporting without unnecessary PII.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-034** audit VITE variables for exposed secrets.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-035** document feature flags and safe defaults.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-036** coordinate Build with AI frontend/server flags.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-037** verify timezone currency locale and canonical URLs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-038** separate staging and production credentials.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-039** document secret rotation and revocation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### C. Authentication

- [ ] **PR-040** test registration validation and boundaries.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-041** test duplicate registration race.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-042** verify password hashing and policy.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-043** test login success and safe failure responses.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-044** test email verification expiry replay and resend.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-045** test login OTP expiry retries and cooldown.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-046** test forgot-password enumeration resistance.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-047** test reset OTP expiry and reuse prevention.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-048** test Google sign-in success.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-049** test Google prompt dismissal and token failure.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-050** verify OAuth issuer audience and account linking.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-051** test logout state cleanup.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-052** test malformed expired and revoked tokens.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-053** test session expiry and concurrent sessions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-054** test admin invitation accept expire and revoke.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-055** test suspended accounts across existing sessions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-056** review account deletion and retention.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-057** review CSRF for state-changing requests.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-058** test CORS allowlist and arbitrary-origin rejection.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-059** test auth rate limits and accessible states.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### D. Authorization and privacy

- [ ] **PR-060** enumerate roles and fail closed for unknown roles.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-061** verify every admin API permission middleware.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-062** verify frontend guards are not security boundaries.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-063** test unauthenticated protected API access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-064** test cross-user profile notes progress and saved items.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-065** test learner denial for admin APIs.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-066** test admin role allowed and denied actions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-067** test export permissions fields and limits.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-068** test PII reveal reason permission and audit.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-069** mask PII in lists logs notifications and errors.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-070** test admin status-change reason and audit.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-071** test role-change authorization and audit.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-072** test destructive-action confirmation and server validation.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-073** test consent capture withdrawal and timestamps.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-074** separate marketing and transactional consent.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-075** test fail-closed behavior when audit persistence fails.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-076** test audit outbox retry dedupe and dual-store failure.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-077** redact passwords tokens OTPs and payment secrets.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-078** review privacy retention export and deletion obligations.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-079** compare admin route permissions with page and data access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —

### E. Catalogue and pricing

- [ ] **PR-080** test catalogue search filters sort and pagination.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-081** test catalogue empty loading error offline retry states.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-082** test course details missing fields and long titles.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-083** test card navigation and independent action buttons.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-084** test zero-review display accuracy.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-085** compare prices and currencies across user surfaces.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-086** test admin price edits propagate correctly.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-087** test free-course setting through enrollment and access.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-088** test invalid negative and non-finite prices fail closed.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-089** test currency formatting and minor-unit conversions.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-090** verify configured plan order across currencies.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
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
- [ ] **PR-102** verify completion UI updates without refresh.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-103** verify uncompletion UI and backend state.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-104** test repeated completion idempotency.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-105** verify first quiz submission completes lesson regardless of score.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-106** preserve graded result if progress save fails.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
- [ ] **PR-107** retry progress save without regrading quiz.  
  Status: `NOT CHECKED` · Evidence: — · Finding/fix: —
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

## Execution log

| Date (UTC) | Candidate SHA | Tasks executed | Done | Fail | Blocked | Remaining | Evidence | Notes |
|---|---|---|---:|---:|---:|---:|---|---|
| 2026-10-26 | Candidate `153c054` (full CI run pending) | PR-001–PR-018, PR-020–PR-021; PR-019 pending | 16 | 2 | 2 | 219 | [Previous green full CI](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280974805); [current candidate run](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40281657193) | Branch protection/release gate fails; local working-tree state and named owners are blocked; backend unused-symbol warnings remain as P2 cleanup.

## Related project documents

- `docs/BUG_HISTORY_AND_PLATFORM_AUDIT.md` — reported bugs, known fixes and audit candidates.
- `docs/PLATFORM_UI_UX_FUNCTIONAL_INVENTORY.md` — route/control/API inventory and browser/staging evidence policy.
- `docs/PLATFORM_CONTROL_REGISTER.md` — stable control IDs and browser-test contracts.
- `docs/UI_UX_AUDIT.md` — existing UX findings; its header refers to an older `test`-branch audit, so reconcile findings against `main` before treating them as current.
- `docs/BUILD_WITH_AI_V2_ROLLOUT.md` — feature flags, rollout sequence and rollback guidance.
- `server/src/config/productionConfigValidation.js` and `server/src/scripts/verifyDeployment.js` — production configuration/deployment checks.


## Definition of done

The checklist is complete only when all tasks are `DONE` or have justified, approved `N/A`; every `FAIL` is fixed and retested; blocked tasks are resolved or formally accepted as launch risks; the exact release candidate has green CI; staging evidence is linked; and the release decision is recorded. A task count never overrides a release-blocking defect.

# BuddyForStudy.V2 Release Notes

## Unreleased — production readiness in progress

This document records changes under validation for the next release. It is **not** a production-release approval. The production readiness checklist remains the source of truth for outstanding launch gates.

### Engineering and reliability changes

- Pinned the repository, backend package metadata, local `.nvmrc`, and CI to Node.js 24.x.
- Updated GitHub Actions checkout/setup-node actions to Node 24-compatible releases.
- Added blocking backend ESLint and JavaScript syntax checks, plus clean `npm ci` installs for frontend and backend.
- Scoped frontend lint to frontend TypeScript files; backend lint runs separately from the server working directory.
- Restricted CI's `GITHUB_TOKEN` to `contents: read` and disabled persisted checkout credentials.
- Fixed the normal discovery-course creation path to use a defined default course level rather than an undefined identifier.
- Removed unnecessary escapes in template HTML escaping code.
- Preserved the quiz result view when the progress persistence request fails; the separate lesson-completion immediate-UI-refresh behavior still requires explicit end-to-end verification.

### Verification evidence

- CI run: [40280687017](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/40280687017) on candidate commit `5da983f86a0979f0b8b69b2452210688b02fb610`.
- Frontend: clean install, lint, typecheck, course-navigation unit tests, production build, and Playwright navigation/admin smoke tests passed.
- Backend: clean install, lint gate, Node test suite against MongoDB, mock-mode Build with AI selector comparison, and JavaScript syntax checks passed.
- Backend lint currently reports legacy unused-symbol findings as warnings. Undefined identifiers and other configured correctness errors remain blocking. Do not describe the backend as warning-free until that debt is cleared.

### Known risks and release blockers

- The `main` branch has no enabled branch protection/ruleset. Require pull requests and the relevant status checks before treating a release candidate as protected.
- No production-like staging evidence has yet been recorded for live OAuth, Razorpay, SMTP, Web Push, Redis, YouTube quota behavior, or LLM providers.
- Backup/restore and rollback drills have not yet been evidenced in the readiness checklist.
- Release/rollback owners and formal risk acceptance have not been recorded.
- Backend lint warning debt remains open for triage and cleanup.

**Release status: NOT READY.** Do not create or deploy a production release until the P0/P1 findings and required staging/operations gates in `docs/PRODUCTION_READINESS_MASTER_CHECKLIST.md` are resolved or formally accepted by an authorized owner.

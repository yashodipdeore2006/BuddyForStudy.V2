# Public pages and admin CMS — release handover

**Repository branch:** \`buddy-for-study-v2.2\`  
**Verified code snapshot:** \`c70de0544fdb3cbff2fef8e7e6494c8567c59642\`  
**CI run:** [45336021239](https://github.com/yashodipdeore2006/BuddyForStudy.V2/actions/runs/45336021239) — frontend, backend, and production release gate passed  
**Deployment status:** Not deployed by this implementation work

This document records the verified setup and the actual public-page/admin functionality in the V2.2 branch. It distinguishes implemented controls from remaining scope in the original product brief. It is not a statement that every requested CMS feature is complete.

## 1. Implementation status at this snapshot

| Area | Present in V2.2 | Still outstanding from the original brief |
|---|---|---|
| Global site settings | Admin-managed platform name, tagline, short description, logo URL, contact details, social URLs, and footer links | Media library; editable per-page SEO fields; editable page sections and publishing workflow |
| About | Public About page with product-purpose copy, capabilities, principles, learning steps, trust/expectations content, and CTA | About section CRUD and visibility controls; separate approved mission/vision; stats; team; milestones; partners; testimonials; ordering and draft/publish |
| Contact | Public support-routing content and settings-backed email/phone/address/hours/social details | Submission form, attachment handling, consent and honeypot processing, server-side intake, confirmation email/reference, topic routing, contact-message inbox, assignment, reply, internal notes and export |
| Help Centre | Searchable FAQ experience at \`/faq\`, topic filters, featured answers, empty state, and links to other learning/support areas | Separate article knowledge base, article/category pages, rich-text editor, schedules, tags, related articles, article feedback, zero-result search reporting and announcement management |
| FAQ | Admin create/edit, draft/published/archived status, featured flag, numeric display order, text search, and starter-content import | Category CRUD, drag-and-drop ordering, FAQ deletion (archiving is the available hide/retire operation), Help article links, and page-specific SEO fields |
| Administration | Permission-gated admin screens, fixed role profiles, and audit logging for sensitive settings/FAQ actions | Exact requested Editor and Support Agent profiles; a general Contact Us ticket queue; full public-page CMS and media library |

### Important distinctions

- The current Help Centre route is the FAQ experience. \`/help\` redirects to \`/faq\`; it is not a separate article system.
- The Contact page currently uses a \`mailto:\` link when a support email is configured. It does not submit a form or create a support ticket.
- Admin → Support is a payment/access-case workflow. It is not an inbox for general Contact Us messages.
- About copy is authored in \`client/src/pages/About.tsx\`. The global site name and short description are read from Site Settings, but individual About sections are not editable in admin.
- The FAQ category labels/values are fixed in server code. The FAQ manager assigns entries to those existing categories; it does not create or rename categories.
- The FAQ editor stores plain text. It does not provide rich text, a Help article relationship, or scheduled publication.

## 2. Current admin guide

Use an administrator with the required permission. The current role profiles are fixed in code:

| Role profile | Intended access |
|---|---|
| Super Admin | Full platform governance and security access |
| Platform Administrator | Day-to-day platform, site settings, FAQ and user/course operations |
| AI & Learning Content Manager | Learning content, curriculum and AI operations |
| Finance & Subscription Manager | Plans, trials, billing, coupons and pricing |
| Support Manager | Learner account and payment/access case investigations |
| Analyst & Auditor | Read-only analytics, audit and operations reporting |

The profiles above are the implemented V2.2 names. The original brief's generic **Editor** and **Support Agent** profiles are not present as named role profiles. Permissions are enforced by the API, not just by hiding navigation links.

### Site identity, public contact and footer

1. Sign in as a Super Admin or Platform Administrator.
2. Open **Admin → Site identity & footer** (\`/admin/site-settings\`).
3. Edit the platform name, tagline, short description and logo URL.
4. Add only verified support details. Leave phone, office address and hours empty when they are not approved for publication.
5. Add only official HTTPS social URLs. Empty values hide the relevant social links.
6. Edit footer labels/destinations, move links within their footer group with the up/down controls, or remove/add links.
7. Enter a change reason of 10–500 characters and save.

These settings are persisted in the \`site_settings\` collection and are served through the public site-settings endpoint. They take effect without rebuilding the frontend. The logo field accepts a same-site path or HTTPS URL; it is not a media-library upload control.

### FAQ management

1. Open **Admin → FAQ & help content** (\`/admin/faqs\`).
2. When the public page is still using its built-in starter content, the manager offers **Import starter FAQs**. Enter an import reason and import the five existing entries to make them managed database records.
3. Select **New FAQ** to create a draft, or choose an existing entry to edit it.
4. Set the question, plain-text answer, one of the predefined categories, numeric display order and featured flag.
5. Enter a change reason and save. A draft is not visible publicly.
6. Use Publish, Move to draft or Archive to control publication. Published FAQ edits become visible on the public page immediately after the API update.

The current seven categories are Getting started, Accounts, Courses & learning, Plans & payments, Technical support, Privacy & safety, and Other. Display order is numeric (lower values first); this is not drag-and-drop. Archiving hides an entry from the public page.

### Other admin areas

- **Admin → Administrator roles** (\`/admin/roles\`): invite administrators and assign one of the fixed role profiles. Only authorised governance roles can manage administrator access.
- **Admin → Audit log** (\`/admin/audit\`): review recorded administrator actions.
- **Admin → Payment and access cases** (\`/admin/support\`): manage payment/access cases, their assignments, internal notes and resolution workflow. This is not the general contact-form inbox described in the original brief.
- **Admin → Communications** (\`/admin/communications\`): communication tooling is separate from Contact Us form intake.

## 3. Real placeholders to complete before publishing

Do not replace these with invented claims. Obtain approval and use verified information.

| Item | Current state | Action |
|---|---|---|
| Platform name | Default is BuddyForStudy | Confirm the public/legal brand spelling |
| Tagline | \`[ADD: approved platform tagline]\` | Approve a short public tagline |
| Short description | \`[ADD: approved platform description]\` | Approve a factual description (up to 320 characters in Site Settings) |
| Mission and vision | No dedicated editable Mission/Vision content blocks | Approve the wording before a future About CMS is populated |
| Support email | Empty by default | Add a monitored, verified mailbox |
| Support phone | Empty | Add only if it is an official monitored number |
| Office address | Empty | Add only if it is an approved public business address; otherwise keep empty |
| Support hours | Empty | Add the time zone and hours the team can actually cover |
| Response-time promise | Not implemented on Contact | Define a realistic service target before publishing one |
| Social profiles | Empty by default | Add official HTTPS profiles only |
| Public logo | Defaults to the existing BuddyForStudy mascot asset | Confirm that this is the approved public logo; choose a trusted asset path/URL |
| Public statistics | No verified counts are published on About | Add only measured, dated, approved figures when a stats CMS exists |
| Team, milestones, partners and testimonials | No managed/public records in the current About implementation | Do not publish names, logos or quotes without permission and evidence |
| Public site origin | Build-time \`VITE_PUBLIC_SITE_URL\` | Set the final HTTPS origin attached to the intended static hosting project |
| Public API origin | Build-time \`VITE_API_URL\` | Set the actual deployed API HTTPS origin; never use the CI example hostname |
| Google OAuth | Optional until Google Sign-In is offered | Use the same Web Client ID on frontend/API and register the exact frontend origin |
| Email provider | SMTP runtime settings are required by the production preflight | Verify sender/domain, authentication, TLS mode and the actual port supported by the host |
| Payment provider | Render Blueprint currently sets \`PAYMENTS_ENABLED=false\` | Keep disabled until onboarding, webhook secrets and end-to-end payment tests are approved |

The current About page contains product-oriented explanatory copy, not verified company history, traction numbers, named team members, partner endorsements or customer testimonials. Do not infer these facts from the code.

## 4. Environment and local setup

Use Node.js **24.x** for both packages. The repository has separate frontend and backend package manifests; there is no root npm package manifest.

### Install

From the repository root:

\`\`\`bash
cd server
npm ci

cd ../client
npm ci
\`\`\`

### Required configuration

Use \`server/.env.example\` as the backend template and the frontend environment example already in \`client/\` as the frontend template. Keep the real \`.env\` files out of Git.

Minimum production configuration includes:

**Frontend build-time values**

- \`VITE_API_URL\`: actual public HTTPS API origin, no trailing slash.
- \`VITE_PUBLIC_SITE_URL\`: final public HTTPS site origin, no path/query/fragment.
- \`VITE_GOOGLE_CLIENT_ID\`: set when Google Sign-In is enabled; must match the server value.
- Keep \`VITE_INTENT_V2\` and \`VITE_ASYNC_ROADMAP\` disabled until their backend rollouts have been staged.

All \`VITE_*\` variables are browser-visible. Never put MongoDB, JWT, payment, SMTP, Gemini, YouTube or Web Push private credentials in them.

**Backend runtime values**

- \`NODE_ENV=production\`
- \`MONGO_URI\`: authenticated MongoDB URI with an explicit database name and TLS.
- \`JWT_SECRET\`: unique, high-entropy secret of at least 32 characters; keep it stable across API restarts.
- \`CLIENT_URL\`: exact frontend HTTPS origin.
- \`API_URL\`: exact backend HTTPS origin.
- \`TRUST_PROXY_HOPS\`: set to the verified proxy-hop count for the selected host; the Render Blueprint currently sets \`1\`.
- \`BACKGROUND_WORKER_MODE=inline\` for the current cost-conscious Blueprint. Do not run inline and standalone schedulers against the same database.
- \`SMTP_HOST\`, \`SMTP_PORT\`, \`SMTP_SECURE\`, \`SMTP_USER\`, \`SMTP_PASS\`, \`MAIL_FROM\`: verify this provider/port from the deployed service with OTP and password-reset tests.
- \`PAYMENTS_ENABLED=false\` until Razorpay onboarding and payment verification are ready.
- \`GOOGLE_CLIENT_ID\` when Google Sign-In is enabled.
- \`GEMINI_API_KEY\` and \`YOUTUBE_API_KEY\` when their corresponding live features are enabled.
- \`REDIS_URL\`, \`SENTRY_DSN\` and the three VAPID settings are optional integrations; configure related key sets together.

The complete environment inventory, optional variables, validation rules and provider caveats are maintained in [Environment Variables](ENVIRONMENT_VARIABLES.md) and [Deployment](DEPLOYMENT.md). Do not treat a successful config preflight as proof of provider connectivity.

### Create the first administrator

The backend provides \`npm run create-admin\`. Run it from \`server/\` on a trusted machine with the intended production/staging environment loaded. Supply \`ADMIN_EMAIL\`, \`ADMIN_PASSWORD\`, \`ADMIN_NAME\` and optionally \`ADMIN_ROLE=super_admin\` through the shell environment or a secret manager.

Example using environment variables in a Bash-compatible shell:

\`\`\`bash
cd server
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="<use-a-unique-secret-from-your-password-manager>"
export ADMIN_NAME="BuddyForStudy Admin"
export ADMIN_ROLE="super_admin"
npm run create-admin
unset ADMIN_PASSWORD
\`\`\`

Do not commit the credentials or paste them into logs/chat. The script also updates the password and role of an existing user with the same email, so do not rerun it casually.

### Database initialization and starter content

There is no standalone migration command in the current \`server/package.json\`. The application uses Mongoose model schemas and MongoDB collections; this is not a SQL migration workflow. Back up the target database before release changes and verify the required indexes/health after startup.

- \`FAQItem\` uses the \`faq_items\` collection. When no managed FAQ records exist, the public endpoint returns the five built-in starter FAQs. Import them from Admin → FAQ & help content to manage them in the database.
- \`SiteSettings\` uses the singleton \`site_settings\` record. Public defaults are returned until an administrator saves the first settings record.
- Administrator accounts are stored as users; bootstrap the first account with the script above.
- Audit records are generated through the existing audit service for supported sensitive changes.

No \`contact_messages\`, \`help_articles\`, \`article_feedback\`, \`search_logs\`, dynamic About section, team, milestone, partner or testimonial CMS collections are implemented in this page-management scope.

## 5. Build, test and verify

Run from a clean checkout of the intended commit. Set the required frontend build variables in the shell/CI environment first.

\`\`\`bash
cd client
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build

cd ../server
npm ci
npm run lint
npm run validate:production-config
npm test
npm run verify:deployment
\`\`\`

For browser-quality testing, use the existing CI workflow, which installs Playwright and axe, starts the built production preview, and runs the navigation and public-page quality suites. The successful V2.2 snapshot recorded 98 frontend unit tests, 10 deployment-config tests, 136 browser tests and 1,197 backend tests, with zero failures in those suites.

The frontend build generates route-specific HTML, \`robots.txt\` and \`sitemap.xml\`. Set a real HTTPS \`VITE_PUBLIC_SITE_URL\`; the CI hostnames are fixtures and must never be copied to production.

## 6. SEO, hosting and release notes

- The static generator emits initial HTML metadata for \`/\`, \`/about\`, \`/contact\`, \`/faq\`, \`/explore\`, \`/pricing\` and \`/legal\`.
- Render and Vercel route the generated public-page HTML files before the general SPA fallback. Other client routes continue to use the SPA shell.
- The sitemap contains only the stable public routes above. Dynamic course details and admin-managed legal slugs are not guessed or added.
- The current generator uses authored BuddyForStudy metadata at build time. Changing the public brand copy/metadata requires a frontend rebuild to refresh crawler-facing HTML.
- The FAQ route currently has no FAQPage JSON-LD structured-data block.
- Render Blueprint auto-deploy is disabled. CI success does not deploy or approve a production release. Follow the [Deployment runbook](DEPLOYMENT.md), [Operations readiness runbook](OPERATIONS_READINESS_RUNBOOK.md) and [Production Readiness Master Checklist](PRODUCTION_READINESS_MASTER_CHECKLIST.md).

### Hosting caveats

- The Render Free API can spin down after inactivity. Treat that deployment as staging/preview or a constrained launch, not an always-on production service.
- Render Free blocks outbound SMTP on ports 25, 465 and 587. Use a provider-documented supported port and prove real OTP/password-reset delivery, or use suitable paid compute/an HTTPS email adapter. The current backend does not include a generic HTTPS email-provider adapter.
- Keep payments disabled until the live gateway credentials, webhook endpoint and signature/reconciliation paths have been verified in the correct provider environment.
- Confirm Google OAuth origins, YouTube embed/search behavior, mail delivery and API CORS against the real staging domain.
- The Content Security Policy currently permits HTTPS/WSS connections broadly to support configurable origins. Tighten it only after the production origin inventory is confirmed and integration tests cover all required providers.

## 7. Remaining work before the original brief can be called fully complete

Treat the following as outstanding implementation scope, not as content placeholders:

1. Build a real About CMS for every section, including visibility, ordering, approved mission/vision, values, statistics, team, milestones, partners and testimonials.
2. Build the Contact intake flow: validated form, topic routing, consent, honeypot, attachment policy/scanning, rate limits, confirmation/reference, email delivery and a separate general-message inbox with assignment, internal notes, response and export.
3. Build a Help article knowledge base: managed categories, rich-text sanitization, article routes, draft/publish/schedule, tags, related articles, feedback votes, zero-result search reporting and announcements.
4. Extend FAQ management with category management, accessible reorder controls, Help article association and approved structured data/SEO fields.
5. Add an approved media library and page-specific SEO/social-image controls, with audit and role permissions.
6. Review role mapping against the requested Editor and Support Agent workflows; the current fixed profiles do not use those exact role names.
7. Re-run CI, manual keyboard/screen-reader checks, provider staging tests and deployment release checks for the exact resulting commit.

Do not claim the original CMS brief is fully delivered until these items have implementation evidence and the relevant acceptance tests pass.

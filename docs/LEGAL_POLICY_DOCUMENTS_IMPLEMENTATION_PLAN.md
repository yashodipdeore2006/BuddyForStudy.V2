# Legal & Policy Document Management — Implementation Plan

## Goal
Give authorized BuddyForStudy administrators a safe, auditable way to maintain the platform's current Privacy Policy, Terms of Service, Rules & Regulations, Refund & Cancellation Policy, Cookie Policy, Community Guidelines, and additional policy documents. Publish current versions to public, stable URLs without requiring a code deployment.

## Product decisions
- Admin workflow lives at `/admin/legal` and is discoverable from the admin navigation under Finance & governance.
- Public policy routes use stable slugs such as `/legal/privacy-policy`, `/legal/terms-of-service`, and `/legal/:slug`.
- Support both a readable rich-text/Markdown-style policy body and an optional PDF/document URL. The editor is the canonical source of readable page content; external files can be attached as downloadable references.
- New or edited content is a draft until explicitly published. Publishing creates an immutable version snapshot; only one version per document is current.
- Preserve published history; archive rather than hard-delete policy records.
- Store metadata, content, effective date, revision notes, status, and audit fields in MongoDB. No secrets or personally identifying user data are part of the policy payload.
- Public users can read only published documents. Admin mutations require authentication, admin authorization, a dedicated `legal.manage` permission, server-side validation, and audit events.

## Scope
1. Data model: LegalDocument with slug, title, category, summary, body, optional document URL, status, effective date, version, published timestamps, created/updated/published by, revision note, and immutable version snapshots.
2. Admin API: list documents, create draft, update draft, publish, unpublish, archive, and retrieve version history. Validate slug/title/body/URL and prevent unsafe external URL schemes.
3. Public API: list published documents and fetch a published document by slug, including current version and effective date. Never return drafts or unpublished history.
4. Admin UI: document library, search/status filters, create/edit form, preview, publish confirmation, version history, archive/unpublish actions, effective date, and revision reason. Follow existing admin design-system components and permissions.
5. Public UI: accessible legal-document renderer with title, effective date, version, readable content, downloadable reference link where configured, and clear unavailable state.
6. Navigation: add Legal & Policies to admin sidebar; add Privacy, Terms, and other published policy links to the public and signed-in footer. Stable public routes must not require login.
7. Governance: add `legal.manage` to the permission catalog and appropriate administrator profiles; audit all mutations. Publishing must not silently overwrite past published versions.
8. Tests: model/validation tests, permission/API tests where repository patterns permit, public-only published visibility, publish/version history behavior, safe URLs, and UI typecheck/build.

## Security and operational requirements
- Do not allow arbitrary HTML execution; render policy content as plain text/Markdown with safe links or sanitize any rich-text output.
- Limit content size and URL length; validate dates and allowed statuses on the server.
- Public endpoints return only published content.
- Publishing and archive operations require a reason and write an audit event.
- Do not claim a file is uploaded to object storage unless the repository has a configured storage provider. The first implementation supports a safe optional hosted-document URL alongside editable policy content; native binary uploads should be added only with an established storage provider and private/public access policy.
- Keep all changes on `test`; never modify `main`.

## Acceptance criteria
- An authorized admin can create and edit a draft, preview it, publish it, and see its current version on the public route.
- Editing a published document creates a draft/new revision without changing the live published text until republished.
- Previous published versions remain viewable in admin history.
- Public routes never reveal drafts or unpublished content.
- Unauthorized admins cannot mutate legal documents; all mutations are audited.
- The admin nav and both footer variants link to policy pages.
- Frontend typecheck/build and backend tests/CI pass, or remaining failures are explicitly reported.

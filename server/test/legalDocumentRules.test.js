import test from "node:test";
import assert from "node:assert/strict";
import { cleanInput } from "../src/controllers/legal.controller.js";
import { ADMIN_PERMISSION_CATALOG, hasAdminPermission } from "../src/utils/adminRbac.js";
import { LegalDocument } from "../src/models/LegalDocument.js";

const valid = {
  title: "Privacy Policy",
  slug: "privacy-policy",
  category: "privacy",
  summary: "How BuddyForStudy handles information.",
  body: "# Privacy Policy\n\nThis is a policy document.",
  documentUrl: "https://docs.example.com/privacy.pdf",
  effectiveAt: "2026-10-22",
  revisionNote: "Initial policy publication"
};

test("legal document input accepts valid policy metadata and content", () => {
  const result = cleanInput(valid);
  assert.equal(result.slug, "privacy-policy");
  assert.equal(result.category, "privacy");
  assert.match(result.body, /Privacy Policy/);
  assert.equal(result.documentUrl, valid.documentUrl);
});

test("legal document input rejects unsafe document URLs", () => {
  assert.throws(() => cleanInput({ ...valid, documentUrl: "javascript:alert(1)" }), /HTTPS URL/);
  assert.throws(() => cleanInput({ ...valid, documentUrl: "https://user:pass@example.com/policy.pdf" }), /embedded credentials/);
});

test("legal document input rejects malformed slugs and oversized content", () => {
  assert.throws(() => cleanInput({ ...valid, slug: "../privacy" }), /slug/);
  assert.throws(() => cleanInput({ ...valid, body: "x".repeat(50001) }), /50,000 characters/);
});

test("legal document management is permission-gated", () => {
  assert.ok(ADMIN_PERMISSION_CATALOG.includes("legal.manage"));
  assert.equal(hasAdminPermission("platform_admin", "legal.manage"), true);
  assert.equal(hasAdminPermission("super_admin", "legal.manage"), true);
  assert.equal(hasAdminPermission("analyst_auditor", "legal.manage"), false);
});

test("published legal versions retain slug and category snapshots", () => {
  assert.ok(LegalDocument.schema.path("publishedSlug"));
  const versionSchema = LegalDocument.schema.path("versions").schema;
  assert.ok(versionSchema.path("slug"));
  assert.ok(versionSchema.path("category"));
  assert.ok(versionSchema.path("body"));
});

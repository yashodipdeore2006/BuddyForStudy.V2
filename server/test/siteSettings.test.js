import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SiteSettings } from "../src/models/SiteSettings.js";
import {
  DEFAULT_SITE_SETTINGS,
  normalizeHttpsUrl,
  normalizeSiteHref,
  toPublicSiteSettings,
} from "../src/utils/siteSettings.js";

test("site settings are stored as one global record in the dedicated collection", () => {
  assert.equal(SiteSettings.collection.collectionName, "site_settings");
  assert.equal(SiteSettings.schema.path("key").options.default, "global");
  assert.equal(SiteSettings.schema.path("key").options.immutable, true);
});

test("public site defaults use only the existing BuddyForStudy identity and no invented contact details", () => {
  const settings = toPublicSiteSettings(DEFAULT_SITE_SETTINGS);
  assert.equal(settings.brand.siteName, "BuddyForStudy");
  assert.equal(settings.brand.logoUrl, "/buddyforstudy-mascot.webp");
  assert.equal(settings.brand.tagline, "Find Your Path. Learn with Purpose. Build Your Future.");
  assert.match(settings.brand.description, /AI-powered career learning platform/);
  assert.equal(settings.contact.supportEmail, "");
  assert.equal(settings.contact.supportPhone, "");
  assert.equal(settings.contact.officeAddress, "");
  assert.equal(settings.contact.businessHours, "");
  assert.ok(settings.footerLinks.some((item) => item.label === "All policies & accessibility" && item.href === "/legal"));
});

test("legacy brand placeholders resolve to approved public brand copy", () => {
  const settings = toPublicSiteSettings({
    brand: {
      siteName: "BuddyForStudy",
      tagline: "[ADD: approved platform tagline]",
      description: "[ADD: approved platform description]",
    },
  });
  assert.equal(settings.brand.tagline, "Find Your Path. Learn with Purpose. Build Your Future.");
  assert.match(settings.brand.description, /AI-powered career learning platform/);
});

test("public site projection excludes administrator metadata and sanitizes unsafe persisted links", () => {
  const settings = toPublicSiteSettings({
    key: "global",
    updatedBy: "private-administrator-id",
    brand: { siteName: " Example Platform ", logoUrl: "javascript:alert(1)" },
    contact: { supportEmail: "not-an-email", supportPhone: "call-me" },
    socialLinks: {
      instagram: "javascript:alert(1)",
      linkedin: "https://www.linkedin.com/company/example",
    },
    footerLinks: [
      { id: "bad", label: "Bad link", href: "javascript:alert(1)", group: "support" },
      { id: "good", label: "Help", href: "/faq", group: "plans_support" },
    ],
  });

  assert.equal(settings.brand.siteName, "Example Platform");
  assert.equal(settings.brand.logoUrl, "/buddyforstudy-mascot.webp");
  assert.equal(settings.contact.supportEmail, "");
  assert.equal(settings.contact.supportPhone, "");
  assert.equal(settings.socialLinks.instagram, "");
  assert.equal(settings.socialLinks.linkedin, "https://www.linkedin.com/company/example");
  assert.deepEqual(settings.footerLinks, [{ id: "good", label: "Help", href: "/faq", group: "plans_support" }]);
  assert.equal(Object.hasOwn(settings, "updatedBy"), false);
  assert.equal(Object.hasOwn(settings, "key"), false);
});

test("public site projection removes duplicate footer destinations", () => {
  const settings = toPublicSiteSettings({
    footerLinks: [
      { id: "policy-a", label: "All policies & accessibility", href: "/legal", group: "policies" },
      { id: "policy-b", label: "All policies & accessibility", href: "/legal", group: "policies" },
      { id: "privacy", label: "Privacy policy", href: "/legal/privacy-policy", group: "policies" },
    ],
  });
  assert.equal(settings.footerLinks.filter((item) => item.href === "/legal" && item.label === "All policies & accessibility").length, 1);
  assert.equal(settings.footerLinks.length, 2);
});

test("site href validation allows internal paths and HTTPS URLs only", () => {
  assert.equal(normalizeSiteHref("/help/getting-started?from=footer"), "/help/getting-started?from=footer");
  assert.equal(normalizeSiteHref("https://example.com/support"), "https://example.com/support");
  assert.equal(normalizeSiteHref("javascript:alert(1)"), "");
  assert.equal(normalizeSiteHref("//example.com/path"), "");
  assert.equal(normalizeSiteHref("https://user:password@example.com"), "");
  assert.equal(normalizeSiteHref("http://example.com"), "");
});

test("site href sanitizer rejects control characters and backslashes", () => {
  assert.equal(normalizeSiteHref("/help" + String.fromCharCode(0) + "now"), "");
  assert.equal(normalizeSiteHref("/help" + String.fromCharCode(31)), "");
  assert.equal(normalizeSiteHref("/help" + String.fromCharCode(127)), "");
  assert.equal(normalizeSiteHref("/help\\\\article"), "");
});

test("social profiles require HTTPS and reject credentials or non-web protocols", () => {
  assert.equal(normalizeHttpsUrl("https://instagram.com/buddyforstudy"), "https://instagram.com/buddyforstudy");
  assert.equal(normalizeHttpsUrl("http://instagram.com/buddyforstudy"), "");
  assert.equal(normalizeHttpsUrl("javascript:alert(1)"), "");
  assert.equal(normalizeHttpsUrl("https://user:password@example.com"), "");
});

test("footer link model validation rejects duplicate IDs and invalid groups", async () => {
  const duplicate = new SiteSettings({
    footerLinks: [
      { id: "same", label: "One", href: "/about", group: "company" },
      { id: "same", label: "Two", href: "/contact", group: "company" },
    ],
  });
  await assert.rejects(duplicate.validate(), /unique IDs/);

  const invalidGroup = new SiteSettings({
    footerLinks: [{ id: "external", label: "External", href: "/about", group: "random" }],
  });
  await assert.rejects(invalidGroup.validate());
});

test("public route is unauthenticated and admin writes require the dedicated site_settings.manage permission", async () => {
  const [publicRoutes, adminRoutes] = await Promise.all([
    readFile(new URL("../src/routes/publicSettings.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/adminPro.routes.js", import.meta.url), "utf8"),
  ]);
  assert.match(publicRoutes, /router\.get\("\/site-settings", getPublicSiteSettings\)/);
  assert.match(adminRoutes, /router\.get\("\/site-settings", adminPermissionMiddleware\("settings\.read"\)/);
  assert.match(adminRoutes, /router\.put\("\/site-settings", adminPermissionMiddleware\("site_settings\.manage"\)/);
});

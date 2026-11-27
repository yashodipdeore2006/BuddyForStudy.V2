import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PUBLIC_SEO_ROUTES,
  PRIVATE_ROBOTS_PATHS,
  buildRobotsTxt,
  buildSiteStructuredData,
  buildSitemapXml,
  resolvePublicSiteOrigin,
  writeSeoAssets,
} from "../scripts/write-seo-assets.mjs";

test("public SEO origin requires a clean HTTPS site origin", () => {
  assert.equal(resolvePublicSiteOrigin("https://buddyforstudy.in"), "https://buddyforstudy.in");
  assert.equal(resolvePublicSiteOrigin("https://buddyforstudy.in/"), "https://buddyforstudy.in");
  for (const invalid of [
    "", "http://buddyforstudy.in", "https://localhost", "https://127.0.0.1",
    "https://buddyforstudy.in/path", "https://user:pass@buddyforstudy.in",
    "https://buddyforstudy.in/?preview=true",
  ]) {
    assert.throws(() => resolvePublicSiteOrigin(invalid), /VITE_PUBLIC_SITE_URL/);
  }
});

test("sitemap contains only the declared public canonical routes", () => {
  const xml = buildSitemapXml("https://buddyforstudy.in");
  for (const route of PUBLIC_SEO_ROUTES) {
    assert.ok(xml.includes("<loc>" + new URL(route.path, "https://buddyforstudy.in").toString() + "</loc>"));
  }
  for (const privatePath of ["/admin", "/login", "/learn/", "/my-learning"]) {
    assert.ok(!xml.includes("buddyforstudy.in" + privatePath));
  }
});

test("robots excludes private and authenticated route families", () => {
  const robots = buildRobotsTxt("https://buddyforstudy.in");
  for (const path of PRIVATE_ROBOTS_PATHS) assert.ok(robots.includes("Disallow: " + path));
  assert.ok(robots.includes("Sitemap: https://buddyforstudy.in/sitemap.xml"));
});

test("build writes route-specific crawler-readable HTML and index files", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "bfs-seo-"));
  try {
    await writeFile(join(outputDirectory, "index.html"), [
      "<!doctype html>", "<html><head>",
      '<meta name="description" content="Default description" />',
      '<meta name="google-site-verification" content="YUDG8DYjMkIs8FZVIStx7gHVytPwvvtujxRccUGklXc" />',
      "<title data-default>Default title</title>",
      '<meta property="og:title" content="Default title" />',
      '<meta property="og:description" content="Default description" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '</head><body><div id="root"></div></body></html>',
    ].join("\n"), "utf8");

    const result = await writeSeoAssets({
      env: { VITE_PUBLIC_SITE_URL: "https://buddyforstudy.in" },
      outputDirectory,
    });
    assert.equal(result.routeCount, PUBLIC_SEO_ROUTES.length);

    const aboutHtml = await readFile(join(outputDirectory, "about", "index.html"), "utf8");
    assert.ok(aboutHtml.includes("<title>About BuddyForStudy | AI-Powered Career Learning</title>"));
    assert.ok(aboutHtml.includes('name="robots" content="index,follow,max-image-preview:large"'));
    assert.ok(aboutHtml.includes('rel="canonical" href="https://buddyforstudy.in/about"'));
    assert.ok(aboutHtml.includes('property="og:url" content="https://buddyforstudy.in/about"'));
    assert.ok(aboutHtml.includes('name="twitter:title" content="About BuddyForStudy | AI-Powered Career Learning"'));

    assert.ok(aboutHtml.includes('<script type="application/ld+json">'));
    assert.ok(aboutHtml.includes('name="google-site-verification" content="YUDG8DYjMkIs8FZVIStx7gHVytPwvvtujxRccUGklXc"'));

    const homepageHtml = await readFile(join(outputDirectory, "index.html"), "utf8");
    assert.ok(homepageHtml.includes("<title>AI-Powered Career Learning Platform | BuddyForStudy</title>"));
    const schemaMarker = '<script type="application/ld+json">';
    const schemaStart = homepageHtml.indexOf(schemaMarker);
    const schemaEnd = homepageHtml.indexOf("</script>", schemaStart);
    assert.ok(schemaStart >= 0 && schemaEnd > schemaStart, "homepage should include crawlable JSON-LD");
    const schemaText = homepageHtml.slice(schemaStart + schemaMarker.length, schemaEnd);
    const schema = JSON.parse(schemaText);
    const website = schema["@graph"].find((item) => item["@type"] === "WebSite");
    const organization = schema["@graph"].find((item) => item["@type"] === "Organization");
    assert.equal(website.name, "BuddyForStudy");
    assert.equal(website.alternateName, "Buddy For Study");
    assert.equal(website.url, "https://buddyforstudy.in/");
    assert.equal(organization.name, "BuddyForStudy");

    const directSchema = JSON.parse(buildSiteStructuredData("https://buddyforstudy.in"));
    assert.equal(directSchema["@graph"].length, 2);

    const sitemap = await readFile(join(outputDirectory, "sitemap.xml"), "utf8");
    const robots = await readFile(join(outputDirectory, "robots.txt"), "utf8");
    assert.ok(sitemap.includes("https://buddyforstudy.in/faq"));
    assert.ok(robots.includes("Sitemap: https://buddyforstudy.in/sitemap.xml"));
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("Google Search Console verification artifacts remain exact", async () => {
  const [homepage, verificationFile] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/googlee5d053a421eb0750.html", import.meta.url), "utf8"),
  ]);
  assert.ok(homepage.includes('<meta name="google-site-verification" content="YUDG8DYjMkIs8FZVIStx7gHVytPwvvtujxRccUGklXc" />'));
  assert.equal(verificationFile.trim(), "google-site-verification: googlee5d053a421eb0750.html");
});

test("SEO generation fails closed when the public URL is not configured", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "bfs-seo-missing-"));
  try {
    await writeFile(join(outputDirectory, "index.html"), "<html><head></head></html>", "utf8");
    await assert.rejects(writeSeoAssets({ env: {}, outputDirectory }), /VITE_PUBLIC_SITE_URL is required/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

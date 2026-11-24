import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PUBLIC_SEO_ROUTES,
  PRIVATE_ROBOTS_PATHS,
  buildRobotsTxt,
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
      "<title data-default>Default title</title>",
      '<meta property="og:title" content="Default title" />',
      '<meta property="og:description" content="Default description" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      "</head><body><div id=\\"root\\"></div></body></html>",
    ].join("\n"), "utf8");

    const result = await writeSeoAssets({
      env: { VITE_PUBLIC_SITE_URL: "https://buddyforstudy.in" },
      outputDirectory,
    });
    assert.equal(result.routeCount, PUBLIC_SEO_ROUTES.length);

    const aboutHtml = await readFile(join(outputDirectory, "about", "index.html"), "utf8");
    assert.ok(aboutHtml.includes("<title>About BuddyForStudy | A clearer way to learn</title>"));
    assert.ok(aboutHtml.includes('name="robots" content="index,follow,max-image-preview:large"'));
    assert.ok(aboutHtml.includes('rel="canonical" href="https://buddyforstudy.in/about"'));
    assert.ok(aboutHtml.includes('property="og:url" content="https://buddyforstudy.in/about"'));
    assert.ok(aboutHtml.includes('name="twitter:title" content="About BuddyForStudy | A clearer way to learn"'));

    const sitemap = await readFile(join(outputDirectory, "sitemap.xml"), "utf8");
    const robots = await readFile(join(outputDirectory, "robots.txt"), "utf8");
    assert.ok(sitemap.includes("https://buddyforstudy.in/faq"));
    assert.ok(robots.includes("Sitemap: https://buddyforstudy.in/sitemap.xml"));
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
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

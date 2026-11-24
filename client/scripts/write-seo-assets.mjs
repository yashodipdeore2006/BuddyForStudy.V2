import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLIC_SEO_ROUTES = Object.freeze([
  { path: "/", title: "BuddyForStudy — Learn. Plan. Grow.", description: "Discover courses, explore structured learning paths, and track your learning progress with BuddyForStudy." },
  { path: "/about", title: "About BuddyForStudy | A clearer way to learn", description: "Learn how BuddyForStudy brings course discovery, structured learning paths, and learner progress into one connected experience." },
  { path: "/contact", title: "Contact BuddyForStudy | Support and help", description: "Find official support information and practical guidance for questions about your BuddyForStudy account and learning experience." },
  { path: "/faq", title: "BuddyForStudy Help Centre | Frequently asked questions", description: "Find answers about getting started, accounts, courses, plans, payments, privacy, and using BuddyForStudy." },
  { path: "/explore", title: "Explore Courses | BuddyForStudy", description: "Browse available courses and structured learning options on BuddyForStudy. Review course details before you begin." },
  { path: "/pricing", title: "BuddyForStudy Plans and Pricing", description: "Review the plans and access options currently published on BuddyForStudy. Availability and prices are shown on the platform." },
  { path: "/legal", title: "BuddyForStudy | Legal and policies", description: "Read the privacy, terms, cookie, and other policy documents currently published by BuddyForStudy." },
]);

export const PRIVATE_ROBOTS_PATHS = Object.freeze([
  "/admin", "/admin/", "/home", "/dashboard", "/login", "/register",
  "/verify-email", "/verify-login", "/forgot-password", "/accept-admin-invitation",
  "/billing", "/my-learning", "/my-courses", "/saved", "/saved-courses",
  "/profile", "/settings", "/notifications", "/learn/", "/playlists/", "/roadmaps/", "/api/",
]);

export function resolvePublicSiteOrigin(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("VITE_PUBLIC_SITE_URL is required to generate public SEO assets.");
  let parsed;
  try { parsed = new URL(input); }
  catch { throw new Error("VITE_PUBLIC_SITE_URL must be a valid absolute HTTPS site origin."); }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") || hostname === "localhost" ||
    hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
  ) {
    throw new Error("VITE_PUBLIC_SITE_URL must be a verified HTTPS origin without credentials, path, query, or fragment.");
  }
  return parsed.origin;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
}

function upsertMeta(html, attribute, key, content) {
  const pattern = new RegExp("<meta\\s+" + attribute + "=[\"']" + key + "[\"'][^>]*>", "i");
  const tag = '    <meta ' + attribute + '="' + key + '" content="' + escapeHtml(content) + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, tag + "\n  </head>");
}

function upsertCanonical(html, url) {
  const pattern = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  const tag = '    <link rel="canonical" href="' + escapeHtml(url) + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, tag + "\n  </head>");
}

export function buildRobotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    ...PRIVATE_ROBOTS_PATHS.map((path) => "Disallow: " + path),
    "Sitemap: " + origin + "/sitemap.xml",
    "",
  ].join("\n");
}

export function buildSitemapXml(origin) {
  const entries = PUBLIC_SEO_ROUTES.map(({ path }) => {
    return "  <url><loc>" + escapeXml(new URL(path, origin).toString()) + "</loc></url>";
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

function buildRouteHtml(template, route, canonicalUrl) {
  let html = template.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, "<title>" + escapeHtml(route.title) + "</title>");
  html = upsertMeta(html, "name", "description", route.description);
  html = upsertMeta(html, "name", "robots", "index,follow,max-image-preview:large");
  html = upsertMeta(html, "property", "og:title", route.title);
  html = upsertMeta(html, "property", "og:description", route.description);
  html = upsertMeta(html, "property", "og:type", "website");
  html = upsertMeta(html, "property", "og:site_name", "BuddyForStudy");
  html = upsertMeta(html, "property", "og:url", canonicalUrl);
  html = upsertMeta(html, "name", "twitter:card", "summary");
  html = upsertMeta(html, "name", "twitter:title", route.title);
  html = upsertMeta(html, "name", "twitter:description", route.description);
  return upsertCanonical(html, canonicalUrl);
}

export async function writeSeoAssets({
  env = process.env,
  outputDirectory = fileURLToPath(new URL("../dist", import.meta.url)),
} = {}) {
  const origin = resolvePublicSiteOrigin(env.VITE_PUBLIC_SITE_URL);
  const outputDir = resolve(outputDirectory);
  const indexPath = resolve(outputDir, "index.html");
  const template = await readFile(indexPath, "utf8");

  for (const route of PUBLIC_SEO_ROUTES) {
    const canonicalUrl = new URL(route.path, origin).toString();
    const html = buildRouteHtml(template, route, canonicalUrl);
    const targetPath = route.path === "/" ? indexPath : resolve(outputDir, route.path.slice(1), "index.html");
    await mkdir(resolve(targetPath, ".."), { recursive: true });
    await writeFile(targetPath, html, "utf8");
  }

  await writeFile(resolve(outputDir, "robots.txt"), buildRobotsTxt(origin), "utf8");
  await writeFile(resolve(outputDir, "sitemap.xml"), buildSitemapXml(origin), "utf8");
  return { origin, routeCount: PUBLIC_SEO_ROUTES.length, outputDirectory: outputDir };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  writeSeoAssets().then(({ origin, routeCount }) => {
    process.stdout.write("Generated SEO HTML for " + routeCount + " public routes and robots.txt/sitemap.xml for " + origin + "\n");
  }).catch((error) => {
    console.error("Failed to generate public SEO assets:", String(error?.message || "Unknown error").slice(0, 300));
    process.exitCode = 1;
  });
}

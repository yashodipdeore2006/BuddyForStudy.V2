import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLIC_SEO_ROUTES = Object.freeze([
  {
    path: "/",
    title: "AI-Powered Career Learning Platform | BuddyForStudy",
    description: "BuddyForStudy is an AI-powered career learning platform. Explore career paths, follow structured skill roadmaps, discover curated courses and learning resources, and track your learning progress.",
  },
  {
    path: "/about",
    title: "About BuddyForStudy | AI-Powered Career Learning",
    description: "Learn how BuddyForStudy connects career exploration, structured skill roadmaps, curated courses, and learning progress in one AI-assisted career learning platform.",
  },
  {
    path: "/contact",
    title: "Contact BuddyForStudy | Support & Help",
    description: "Contact BuddyForStudy for help with your account, course access, or learning experience. Find the official support information published on our website.",
  },
  {
    path: "/faq",
    title: "BuddyForStudy Help Centre | FAQs",
    description: "Get answers about BuddyForStudy accounts, career roadmaps, curated courses, learning progress, plans, payments, and platform support.",
  },
  {
    path: "/explore",
    title: "Courses & Learning Resources | BuddyForStudy",
    description: "Discover curated courses and learning resources for technology and other career skills. Compare course details and choose a practical next step with BuddyForStudy.",
  },
  {
    path: "/pricing",
    title: "Plans & Pricing | BuddyForStudy",
    description: "Explore BuddyForStudy plans and learning access options. Compare available features and pricing before choosing how to continue your learning journey.",
  },
  {
    path: "/legal",
    title: "Legal & Policies | BuddyForStudy",
    description: "Review the privacy, terms, cookie, and other policy documents that govern your use of BuddyForStudy.",
  },
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


export function buildSiteStructuredData(origin) {
  const description = "BuddyForStudy is an AI-powered career learning platform that connects career exploration, structured skill roadmaps, curated courses, learning resources, and learner progress.";
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": origin + "/#website",
        "url": origin + "/",
        "name": "BuddyForStudy",
        "alternateName": "Buddy For Study",
        "description": description,
        "inLanguage": "en-IN",
        "publisher": { "@id": origin + "/#organization" }
      },
      {
        "@type": "Organization",
        "@id": origin + "/#organization",
        "name": "BuddyForStudy",
        "alternateName": "Buddy For Study",
        "url": origin + "/",
        "description": description
      }
    ]
  }, null, 2).replace(/</g, "\\u003c");
}

function buildRouteHtml(template, route, canonicalUrl, origin) {
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
  const structuredData = '<script type="application/ld+json">' + buildSiteStructuredData(origin) + "</script>";
  html = html.replace(/<\/head>/i, structuredData + "\n  </head>");
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
    const html = buildRouteHtml(template, route, canonicalUrl, origin);
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

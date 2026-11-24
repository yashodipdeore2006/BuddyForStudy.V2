import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSiteSettings } from "@/context/SiteSettingsContext";

const PUBLIC_STATIC_PATHS = new Map<string, string>([
  ["/", "/"], ["/about", "/about"], ["/about-us", "/about"],
  ["/contact", "/contact"], ["/contact-us", "/contact"],
  ["/faq", "/faq"], ["/help", "/faq"], ["/explore", "/explore"],
  ["/courses", "/explore"], ["/pricing", "/pricing"], ["/legal", "/legal"],
]);
const PRIVATE_PATHS = [
  /^\/admin(?:\/|$)/,
  /^\/(?:home|dashboard|login|register|verify-email|verify-login|forgot-password|accept-admin-invitation|billing|my-learning|my-courses|saved|saved-courses|profile|settings|notifications)\/?$/,
  /^\/(?:learn|playlists|roadmaps)(?:\/|$)/,
];
type PageMetadata = { title: string; description: string };

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
}
function getPublicCanonicalPath(pathname: string): string | null {
  const normalized = normalizePath(pathname);
  const direct = PUBLIC_STATIC_PATHS.get(normalized);
  if (direct !== undefined) return direct;
  if (/^\/legal\/[a-z0-9-]+$/i.test(normalized)) return normalized;
  return null;
}
function getPublicSiteOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "") || hostname === "localhost" ||
      hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]") return null;
    return parsed.origin;
  } catch { return null; }
}
function upsertMeta(attribute: "name" | "property", key: string, content: string | null): void {
  const selector = 'meta[' + attribute + '="' + key + '"]';
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) { existing?.remove(); return; }
  const element = existing || document.createElement("meta");
  element.setAttribute(attribute, key);
  element.setAttribute("content", content);
  if (!existing) document.head.appendChild(element);
}
function upsertCanonical(href: string | null): void {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) { existing?.remove(); return; }
  const link = existing || document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  if (!existing) document.head.appendChild(link);
}
function resolveMetadata(pathname: string, siteName: string, configuredDescription: string): PageMetadata | null {
  const canonicalPath = getPublicCanonicalPath(pathname);
  const normalized = normalizePath(pathname);
  const legalDetail = /^\/legal\/[a-z0-9-]+$/i.test(normalized);
  const courseDetail = /^\/courses\/[^/]+$/i.test(normalized);
  if (!canonicalPath && !legalDetail && !courseDetail) return null;
  const homeDescription = configuredDescription && !/^\[ADD:/i.test(configuredDescription)
    ? configuredDescription
    : "Discover courses, explore structured learning paths, and track your learning progress with " + siteName + ".";
  const pages: Record<string, PageMetadata> = {
    "/": { title: siteName + " — Learn. Plan. Grow.", description: homeDescription },
    "/about": {
      title: "About " + siteName + " | A clearer way to learn",
      description: "Learn how " + siteName + " brings course discovery, structured learning paths, and learner progress into one connected experience.",
    },
    "/contact": {
      title: "Contact " + siteName + " | Support and help",
      description: "Find official support information and practical guidance for questions about your " + siteName + " account and learning experience.",
    },
    "/faq": {
      title: siteName + " Help Centre | Frequently asked questions",
      description: "Find answers about getting started, accounts, courses, plans, payments, privacy, and using " + siteName + ".",
    },
    "/explore": {
      title: "Explore Courses | " + siteName,
      description: "Browse available courses and structured learning options on " + siteName + ". Review course details before you begin.",
    },
    "/pricing": {
      title: siteName + " Plans and Pricing",
      description: "Review the plans and access options currently published on " + siteName + ". Availability and prices are shown on the platform.",
    },
    "/legal": {
      title: siteName + " | Legal and policies",
      description: "Read the privacy, terms, cookie, and other policy documents currently published by " + siteName + ".",
    },
  };
  if (legalDetail) return { title: siteName + " | Policy details", description: "Read the current policy details published by " + siteName + "." };
  if (courseDetail) return { title: "Course details | " + siteName, description: "Review course information, learning outcomes, and available access options on " + siteName + "." };
  return pages[canonicalPath || "/"] || null;
}

/** Keeps public-page SEO in sync with prerendered route HTML; private routes are noindex and canonical-free. */
export default function PublicCanonicalUrl() {
  const { pathname } = useLocation();
  const { settings } = useSiteSettings();
  const siteName = settings.brand.siteName.trim() || "BuddyForStudy";
  const configuredDescription = settings.brand.description.trim();

  useEffect(() => {
    const normalized = normalizePath(pathname);
    const canonicalPath = getPublicCanonicalPath(pathname);
    const metadata = resolveMetadata(pathname, siteName, configuredDescription);
    const isPrivate = PRIVATE_PATHS.some((pattern) => pattern.test(normalized));
    const isIndexable = Boolean(metadata) && !isPrivate;
    const siteOrigin = getPublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL || "");
    const canonicalUrl = siteOrigin && canonicalPath ? new URL(canonicalPath, siteOrigin).toString() : null;

    document.title = metadata?.title || (isPrivate ? siteName + " | Learning space" : siteName);
    upsertMeta("name", "description", isIndexable ? metadata?.description || null : null);
    upsertMeta("name", "robots", isIndexable ? "index,follow,max-image-preview:large" : "noindex,nofollow");
    upsertMeta("property", "og:title", isIndexable ? metadata?.title || null : null);
    upsertMeta("property", "og:description", isIndexable ? metadata?.description || null : null);
    upsertMeta("property", "og:type", isIndexable ? "website" : null);
    upsertMeta("property", "og:site_name", isIndexable ? siteName : null);
    upsertMeta("property", "og:url", isIndexable ? canonicalUrl : null);
    upsertMeta("name", "twitter:card", isIndexable ? "summary" : null);
    upsertMeta("name", "twitter:title", isIndexable ? metadata?.title || null : null);
    upsertMeta("name", "twitter:description", isIndexable ? metadata?.description || null : null);
    upsertCanonical(isIndexable ? canonicalUrl : null);
  }, [pathname, siteName, configuredDescription]);
  return null;
}

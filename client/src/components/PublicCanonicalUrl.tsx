import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PUBLIC_STATIC_PATHS = new Map<string, string>([
  ["/", "/"],
  ["/home", "/"],
  ["/about", "/about"],
  ["/about-us", "/about"],
  ["/contact", "/contact"],
  ["/contact-us", "/contact"],
  ["/faq", "/faq"],
  ["/help", "/faq"],
  ["/explore", "/explore"],
  ["/courses", "/explore"],
  ["/pricing", "/pricing"],
  ["/legal", "/legal"],
]);

function getPublicCanonicalPath(pathname: string): string | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  const direct = PUBLIC_STATIC_PATHS.get(normalized);
  if (direct) return direct;
  // Legal document slugs are public, stable, and do not carry private user data.
  if (/^\/legal\/[a-z0-9-]+$/i.test(normalized)) return normalized;
  return null;
}

function getPublicSiteOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Adds canonical URLs only to known public routes and only when the deployer
 * configures the verified public site URL. Authenticated/admin/player routes
 * intentionally receive no canonical tag.
 */
export default function PublicCanonicalUrl() {
  const { pathname } = useLocation();

  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const siteOrigin = getPublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL || "");
    const canonicalPath = getPublicCanonicalPath(pathname);
    if (!siteOrigin || !canonicalPath) {
      existing?.remove();
      return;
    }

    const href = new URL(canonicalPath, siteOrigin).toString();
    const link = existing || document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    if (!existing) document.head.appendChild(link);
  }, [pathname]);

  return null;
}

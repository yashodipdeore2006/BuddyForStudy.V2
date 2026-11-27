export const SITE_SETTINGS_KEY = "global";

export const SITE_SOCIAL_LINK_FIELDS = Object.freeze([
  "instagram",
  "linkedin",
  "youtube",
  "x",
  "facebook",
  "github",
]);

export const SITE_FOOTER_GROUPS = Object.freeze([
  "company",
  "discover",
  "plans_support",
  "policies",
]);

export const DEFAULT_SITE_SETTINGS = Object.freeze({
  brand: Object.freeze({
    siteName: "BuddyForStudy",
    tagline: "Find Your Path. Learn with Purpose. Build Your Future.",
    description: "BuddyForStudy is an AI-powered career learning platform that helps learners explore career paths, follow structured roadmaps, discover curated courses, and track their skill-building progress.",
    logoUrl: "/buddyforstudy-mascot.webp",
  }),
  contact: Object.freeze({
    supportEmail: "",
    supportPhone: "",
    officeAddress: "",
    businessHours: "",
  }),
  socialLinks: Object.freeze({
    instagram: "",
    linkedin: "",
    youtube: "",
    x: "",
    facebook: "",
    github: "",
  }),
  footerLinks: Object.freeze([
    { id: "about", label: "About us", href: "/about", group: "company" },
    { id: "contact", label: "Contact us", href: "/contact", group: "company" },
    { id: "explore", label: "Explore courses", href: "/explore", group: "discover" },
    { id: "roadmaps", label: "Learning roadmaps", href: "/explore?build=1", group: "discover" },
    { id: "pricing", label: "Plans & pricing", href: "/pricing", group: "plans_support" },
    { id: "faq", label: "Help centre & FAQs", href: "/faq", group: "plans_support" },
    { id: "support-contact", label: "Contact support", href: "/contact", group: "plans_support" },
    { id: "privacy", label: "Privacy policy", href: "/legal/privacy-policy", group: "policies" },
    { id: "terms", label: "Terms of service", href: "/legal/terms-of-service", group: "policies" },
    { id: "cookies", label: "Cookie policy", href: "/legal/cookie-policy", group: "policies" },
    { id: "all-policies", label: "All policies & accessibility", href: "/legal", group: "policies" },
  ]),
});

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const PHONE_PATTERN = /^[+0-9().\s-]{0,40}$/;

export function normalizeHttpsUrl(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  const input = value.trim();
  if (!input) return "";
  if (input.length > maxLength) return "";

  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function hasUnsafeSiteCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127 || value[index] === String.fromCharCode(92)) return true;
  }
  return false;
}

export function normalizeSiteHref(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  const input = value.trim();
  if (!input || input.length > maxLength || hasUnsafeSiteCharacters(input)) return "";

  if (input.startsWith("/") && !input.startsWith("//")) {
    try {
      const url = new URL(input, "https://buddyforstudy.invalid");
      if (url.origin !== "https://buddyforstudy.invalid") return "";
      return url.pathname + url.search + url.hash;
    } catch {
      return "";
    }
  }

  return normalizeHttpsUrl(input, maxLength);
}

export function normalizeSiteLogoUrl(value) {
  return normalizeSiteHref(value, 1000);
}

/**
 * Public site settings are projected through an explicit allowlist. This keeps
 * administrator metadata, audit details and private operational settings out
 * of the unauthenticated API response.
 */
export function toPublicSiteSettings(record) {
  const brand = record?.brand || {};
  const contact = record?.contact || {};
  const socialLinks = record?.socialLinks || {};
  const footerLinks = Array.isArray(record?.footerLinks) ? record.footerLinks : DEFAULT_SITE_SETTINGS.footerLinks;

  const supportEmail = typeof contact.supportEmail === "string" && contact.supportEmail.length <= 254 &&
    EMAIL_PATTERN.test(contact.supportEmail.trim()) ? contact.supportEmail.trim() : "";
  const supportPhone = typeof contact.supportPhone === "string" && PHONE_PATTERN.test(contact.supportPhone.trim())
    ? contact.supportPhone.trim() : "";

  return {
    brand: {
      siteName: cleanText(brand.siteName, DEFAULT_SITE_SETTINGS.brand.siteName, 80),
      tagline: cleanBrandText(brand.tagline, DEFAULT_SITE_SETTINGS.brand.tagline, 160),
      description: cleanBrandText(brand.description, DEFAULT_SITE_SETTINGS.brand.description, 320),
      logoUrl: normalizeSiteLogoUrl(brand.logoUrl) || DEFAULT_SITE_SETTINGS.brand.logoUrl,
    },
    contact: {
      supportEmail,
      supportPhone,
      officeAddress: cleanText(contact.officeAddress, "", 240),
      businessHours: cleanText(contact.businessHours, "", 160),
    },
    socialLinks: Object.fromEntries(SITE_SOCIAL_LINK_FIELDS.map((field) => [
      field,
      normalizeHttpsUrl(socialLinks[field], 500),
    ])),
    footerLinks: normalizeFooterLinks(footerLinks),
  };
}

function cleanBrandText(value, fallback, maxLength) {\n  const text = cleanText(value, fallback, maxLength);\n  return /^\\[ADD:/i.test(text) ? fallback : text;\n}\n\nfunction cleanText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function normalizeFooterLinks(value) {
  if (!Array.isArray(value)) return DEFAULT_SITE_SETTINGS.footerLinks.map((item) => ({ ...item }));
  const seenIds = new Set();
  const seenDestinations = new Set();
  return value.slice(0, 30).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const id = cleanText(item.id, "footer-" + index, 80);
    const label = cleanText(item.label, "", 50);
    const href = normalizeSiteHref(item.href, 500);
    const group = SITE_FOOTER_GROUPS.includes(item.group) ? item.group : "";
    if (!id || !label || !href || !group) return [];
    const destinationKey = [group, label.toLowerCase(), href].join("|");
    if (seenIds.has(id) || seenDestinations.has(destinationKey)) return [];
    seenIds.add(id);
    seenDestinations.add(destinationKey);
    return [{ id, label, href, group }];
  });
}

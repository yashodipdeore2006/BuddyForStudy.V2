export type SiteFooterGroup = "company" | "discover" | "plans_support" | "policies";

export interface SiteFooterLink {
  id: string;
  label: string;
  href: string;
  group: SiteFooterGroup;
}

export interface SiteSettings {
  brand: {
    siteName: string;
    tagline: string;
    description: string;
    logoUrl: string;
  };
  contact: {
    supportEmail: string;
    supportPhone: string;
    officeAddress: string;
    businessHours: string;
  };
  socialLinks: {
    instagram: string;
    linkedin: string;
    youtube: string;
    x: string;
    facebook: string;
    github: string;
  };
  footerLinks: SiteFooterLink[];
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brand: {
    siteName: "BuddyForStudy",
    tagline: "Learn with direction. Build skills one step at a time.",
    description: "Discover courses, follow structured learning paths, and keep your learning progress organised.",
    logoUrl: "/buddyforstudy-mascot.webp",
  },
  contact: {
    supportEmail: "",
    supportPhone: "",
    officeAddress: "",
    businessHours: "",
  },
  socialLinks: {
    instagram: "",
    linkedin: "",
    youtube: "",
    x: "",
    facebook: "",
    github: "",
  },
  footerLinks: [
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
  ],
};

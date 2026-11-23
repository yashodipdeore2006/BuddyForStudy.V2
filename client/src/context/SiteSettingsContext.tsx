import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@/types/siteSettings";

type SiteSettingsContextValue = {
  settings: SiteSettings;
  loading: boolean;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: DEFAULT_SITE_SETTINGS,
  loading: true,
});

function mergeSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== "object") return DEFAULT_SITE_SETTINGS;
  const received = value as Partial<SiteSettings>;
  return {
    brand: { ...DEFAULT_SITE_SETTINGS.brand, ...(received.brand || {}) },
    contact: { ...DEFAULT_SITE_SETTINGS.contact, ...(received.contact || {}) },
    socialLinks: { ...DEFAULT_SITE_SETTINGS.socialLinks, ...(received.socialLinks || {}) },
    footerLinks: Array.isArray(received.footerLinks) ? received.footerLinks : DEFAULT_SITE_SETTINGS.footerLinks,
  };
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiFetch<{ settings?: unknown }>("/api/public/site-settings", { cache: "no-store" })
      .then((response) => {
        if (active) setSettings(mergeSettings(response.settings));
      })
      .catch(() => {
        // The bundled, known-safe brand defaults keep the global shell usable
        // while the public settings service is unavailable.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({ settings, loading }), [settings, loading]);
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

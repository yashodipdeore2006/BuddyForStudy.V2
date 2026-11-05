import { useEffect, useState } from "react";
import { ArrowUpRight, Facebook, Github, Instagram, Linkedin, Twitter, Youtube, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_PUBLIC_SOCIAL_LINKS,
  normalizeHttpsSocialUrl,
  PUBLIC_SOCIAL_PLATFORMS,
  type PublicSocialLinks as PublicSocialLinksData,
  type SocialPlatformId
} from "@/lib/socialLinks";

const socialIcons: Record<SocialPlatformId, LucideIcon> = {
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
  x: Twitter,
  facebook: Facebook,
  github: Github
};

type Props = {
  title?: string;
  variant?: "footer" | "contact";
  showLabels?: boolean;
  showEmptyMessage?: boolean;
};

export default function PublicSocialLinks({
  title,
  variant = "footer",
  showLabels = false,
  showEmptyMessage = true
}: Props) {
  const [savedLinks, setSavedLinks] = useState<PublicSocialLinksData | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch<{ links?: PublicSocialLinksData }>("/api/public/social-links")
      .then((response) => {
        if (active && response.links && typeof response.links === "object") setSavedLinks(response.links);
      })
      .catch(() => {
        // Keep frontend environment URLs as a fallback if the public settings
        // endpoint is temporarily unavailable.
        if (active) setSavedLinks(null);
      });
    return () => { active = false; };
  }, []);

  const configured = PUBLIC_SOCIAL_PLATFORMS.flatMap((platform) => {
    const hasSavedValue = savedLinks !== null && Object.prototype.hasOwnProperty.call(savedLinks, platform.id);
    const rawValue = hasSavedValue ? savedLinks?.[platform.id] ?? "" : DEFAULT_PUBLIC_SOCIAL_LINKS[platform.id];
    const href = normalizeHttpsSocialUrl(typeof rawValue === "string" ? rawValue : "");
    if (!href) return [];
    return [{ ...platform, href, Icon: socialIcons[platform.id] }];
  });

  if (!configured.length && !showEmptyMessage) return null;

  return (
    <div className={variant === "footer" ? "bfs-footer-social-block" : "bfs-contact-social-block"}>
      {title && <h3>{title}</h3>}
      {configured.length ? (
        <div className={variant === "footer" ? "bfs-footer-socials" : "bfs-contact-socials"}>
          {configured.map(({ id, label, href, Icon }) => (
            <a key={id} href={href} target="_blank" rel="noopener noreferrer" aria-label={`BuddyForStudy on ${label}`} title={label}>
              <Icon size={18} aria-hidden="true" />
              {showLabels && <span>{label}</span>}
              <span className="sr-only">Opens in a new tab</span>
              {showLabels && <ArrowUpRight size={13} aria-hidden="true" />}
            </a>
          ))}
        </div>
      ) : (
        <p className="bfs-footer-muted">Official social links have not been configured yet.</p>
      )}
    </div>
  );
}

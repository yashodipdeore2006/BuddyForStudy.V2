import { ArrowUpRight } from "lucide-react";
import PublicSocialLinks from "@/components/PublicSocialLinks";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { routes } from "@/lib/routes";
import { useSiteSettings } from "@/context/SiteSettingsContext";
import type { SiteFooterGroup } from "@/types/siteSettings";

function Brand() {
  const { settings } = useSiteSettings();
  return (
    <Link to={routes.landing()} className="bfs-user-brand bfs-marketing-footer__brand-link" aria-label={settings.brand.siteName + " home"}>
      <span className="bfs-user-brand__mark">
        <img src={settings.brand.logoUrl || "/buddyforstudy-mascot.webp"} alt="" aria-hidden="true" />
      </span>
      <span className="bfs-user-brand__wordmark">{settings.brand.siteName}</span>
    </Link>
  );
}

function FooterDestination({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith("/") && !href.startsWith("//")) return <Link to={href}>{children}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}

const footerGroupLabels: Record<SiteFooterGroup, string> = {
  company: "Company",
  discover: "Discover",
  support: "Support",
  policies: "Policies",
};

export default function Footer() {
  const { session, profile } = useAuth();
  const isSignedIn = Boolean(session || profile);

  return (
    <footer className={`bfs-marketing-footer${isSignedIn ? " bfs-marketing-footer--signed-in" : ""}`}>
      <div className="bfs-marketing-footer__inner">
        <div className="bfs-marketing-footer__top">
          <div className="bfs-marketing-footer__columns">
            <section className="bfs-footer-column" aria-labelledby="footer-brand-title">
              <h2 id="footer-brand-title">{settings.brand.siteName}</h2>
              <p className="bfs-footer-column__intro">{settings.brand.tagline}</p>
              <PublicSocialLinks title={"Follow " + settings.brand.siteName} variant="footer" />
            </section>

            {(Object.keys(footerGroupLabels) as SiteFooterGroup[]).map((group) => {
              const links = settings.footerLinks.filter((item) => item.group === group);
              if (!links.length) return null;
              return (
                <section className="bfs-footer-column" key={group} aria-labelledby={"footer-" + group + "-title"}>
                  <h2 id={"footer-" + group + "-title"}>{footerGroupLabels[group]}</h2>
                  {links.map((item) => <FooterDestination key={item.id} href={item.href}>{item.label}</FooterDestination>)}
                  {group === "discover" && isSignedIn && (
                    <>
                      <Link to={routes.myLearning()}>My learning</Link>
                      <Link to={routes.saved()}>Saved learning</Link>
                    </>
                  )}
                </section>
              );
            })}
          </div>
          </div>
        </div>

        <div className="bfs-marketing-footer__legal">
          <div className="bfs-footer-bottom-brand">
            <Brand />
            <p>© {new Date().getFullYear()} {settings.brand.siteName}. All rights reserved.</p>
          </div>
          <nav aria-label="Footer preferences">
            <a href="#cookie-settings" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new Event("bfs:open-cookie-settings")); }}>Cookie settings</a>
          </nav>
          <a className="bfs-footer-back-top" href="#root">Back to top <ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}

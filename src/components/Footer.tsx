import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { routes } from "@/lib/routes";

type SocialLink = { label: string; href: string };

function isPublicHttpsUrl(value?: string): value is string {
  if (!value?.trim()) return false;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

const configuredSocialLinks: SocialLink[] = [
  { label: "Instagram", href: import.meta.env.VITE_PUBLIC_SOCIAL_INSTAGRAM || "" },
  { label: "LinkedIn", href: import.meta.env.VITE_PUBLIC_SOCIAL_LINKEDIN || "" },
  { label: "YouTube", href: import.meta.env.VITE_PUBLIC_SOCIAL_YOUTUBE || "" },
  { label: "X", href: import.meta.env.VITE_PUBLIC_SOCIAL_X || "" },
]
  .filter((item) => isPublicHttpsUrl(item.href))
  .map((item) => ({ ...item, href: item.href.trim() }));

function Brand() {
  return (
    <Link to={routes.landing()} className="bfs-user-brand bfs-marketing-footer__brand-link" aria-label="BuddyForStudy home">
      <span className="bfs-user-brand__mark">
        <img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" />
      </span>
      <span className="bfs-user-brand__wordmark">Buddy<span>For</span>Study</span>
    </Link>
  );
}

function SocialLinks() {
  return (
    <div className="bfs-footer-social-block">
      <h3>Follow BuddyForStudy</h3>
      {configuredSocialLinks.length ? (
        <div className="bfs-footer-socials">
          {configuredSocialLinks.map((social) => (
            <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={`BuddyForStudy on ${social.label}`}>
              {social.label}<ArrowUpRight size={12} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <p className="bfs-footer-muted">Official social links will appear here once configured.</p>
      )}
    </div>
  );
}

export default function Footer() {
  const { session, profile } = useAuth();
  const isSignedIn = Boolean(session || profile);

  return (
    <footer className={`bfs-marketing-footer${isSignedIn ? " bfs-marketing-footer--signed-in" : ""}`}>
      <div className="bfs-marketing-footer__inner">
        <div className="bfs-marketing-footer__top">
          <div className="bfs-marketing-footer__columns">
            <section className="bfs-footer-column" aria-labelledby="footer-about-title">
              <h2 id="footer-about-title">About</h2>
              <Link to={routes.about()}>About BuddyForStudy</Link>
              <Link to={routes.contact()}>Contact us</Link>
              <Link to={routes.faq()}>Help and support</Link>
              <SocialLinks />
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-discover-title">
              <h2 id="footer-discover-title">Discover and learn</h2>
              <Link to={routes.explore()}>Explore courses</Link>
              <Link to={routes.buildPath()}>Build a learning roadmap</Link>
              {isSignedIn ? (
                <>
                  <Link to={routes.myLearning()}>My learning</Link>
                  <Link to={routes.saved()}>Saved learning</Link>
                </>
              ) : (
                <>
                  <Link to={routes.login()}>Sign in to your learning</Link>
                  <Link to={routes.register()}>Create an account</Link>
                </>
              )}
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-plans-title">
              <h2 id="footer-plans-title">Plans and support</h2>
              <Link to={routes.pricing()}>Plans and pricing</Link>
              <Link to={routes.faq()}>Frequently asked questions</Link>
              <Link to={routes.contact()}>Contact support</Link>
              {isSignedIn ? (
                <>
                  <Link to={routes.profile()}>My account</Link>
                  <Link to={routes.notifications()}>Notifications</Link>
                </>
              ) : (
                <Link to={routes.login()}>Sign in</Link>
              )}
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-legal-title">
              <h2 id="footer-legal-title">Legal and accessibility</h2>
              <Link to="/legal/privacy-policy">Privacy policy</Link>
              <Link to="/legal/terms-of-service">Terms of service</Link>
              <Link to="/legal">All policies</Link>
            </section>
          </div>
        </div>

        <div className="bfs-marketing-footer__legal">
          <div className="bfs-footer-bottom-brand">
            <Brand />
            <p>© {new Date().getFullYear()} BuddyForStudy. All rights reserved.</p>
          </div>
          <nav aria-label="Footer legal links">
            <Link to="/legal/privacy-policy">Privacy</Link>
            <Link to="/legal/terms-of-service">Terms</Link>
            <Link to="/legal">Policies</Link>
          </nav>
          <a className="bfs-footer-back-top" href="#root">Back to top <ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}

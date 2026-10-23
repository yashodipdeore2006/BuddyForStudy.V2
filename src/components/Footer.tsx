import { ArrowUpRight, BookOpen, Compass, GraduationCap, HelpCircle, Mail, Sparkles } from "lucide-react";
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
].filter((item) => isPublicHttpsUrl(item.href)).map((item) => ({ ...item, href: item.href.trim() }));

function Brand() {
  return (
    <Link to={routes.landing()} className="bfs-user-brand bfs-marketing-footer__brand-link" aria-label="BuddyForStudy home">
      <span className="bfs-user-brand__mark"><img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" /></span>
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
              {social.label}<ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <p className="bfs-footer-muted">Official social links will appear here when the platform accounts are configured.</p>
      )}
    </div>
  );
}

export default function Footer() {
  const { session, profile } = useAuth();
  const isSignedIn = Boolean(session || profile);

  if (isSignedIn) {
    return (
      <footer className="bfs-slim-footer">
        <span>© {new Date().getFullYear()} BuddyForStudy</span>
        <nav aria-label="Footer navigation">
          <Link to={routes.about()}>About</Link>
          <Link to={routes.contact()}>Contact</Link>
          <Link to={routes.faq()}>FAQ</Link>
          <Link to={routes.pricing()}>Plans and pricing</Link>
          <Link to={routes.profile()}>Help and account</Link>
          <Link to={routes.settings() + "#learning-goals"}>Learning goals</Link>
          <Link to={routes.notifications()}>Notifications</Link>
          <Link to="/legal/privacy-policy">Privacy</Link>
          <Link to="/legal/terms-of-service">Terms</Link>
          <Link to="/legal">Policies</Link>
        </nav>
      </footer>
    );
  }

  return (
    <footer className="bfs-marketing-footer">
      <div className="bfs-marketing-footer__inner">
        <div className="bfs-marketing-footer__top">
          <div className="bfs-marketing-footer__brand">
            <Brand />
            <p>Build skills with direction. Discover courses, organise your learning, and take the next step at your own pace.</p>
            <div className="bfs-marketing-footer__trust"><Sparkles size={15} aria-hidden="true" /> Learn with purpose, one step at a time.</div>
            <SocialLinks />
          </div>

          <div className="bfs-marketing-footer__columns">
            <section className="bfs-footer-column" aria-labelledby="footer-platform-title">
              <h2 id="footer-platform-title">Platform</h2>
              <Link to={routes.about()}>About us</Link>
              <Link to={routes.explore()}><Compass size={15} aria-hidden="true" /> Explore courses</Link>
              <Link to={routes.explore()}><BookOpen size={15} aria-hidden="true" /> Learning library</Link>
              <Link to={routes.faq()}><HelpCircle size={15} aria-hidden="true" /> How it works / FAQ</Link>
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-plans-title">
              <h2 id="footer-plans-title">Plans</h2>
              <Link to={routes.pricing()}>Plans and pricing</Link>
              <Link to={routes.explore()}>Browse courses</Link>
              <Link to={routes.myLearning()}>My learning</Link>
              <Link to={routes.register()}>Create an account</Link>
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-support-title">
              <h2 id="footer-support-title">Resources & support</h2>
              <Link to={routes.faq()}>Help centre / FAQ</Link>
              <Link to={routes.contact()}><Mail size={15} aria-hidden="true" /> Contact us</Link>
              <Link to={routes.contact()}>Feedback and support</Link>
              <Link to="/legal">Policies and guidelines</Link>
            </section>
          </div>
        </div>

        <div className="bfs-marketing-footer__legal">
          <p>© {new Date().getFullYear()} BuddyForStudy. All rights reserved.</p>
          <nav aria-label="Legal and policy links">
            <Link to="/legal/privacy-policy">Privacy</Link>
            <Link to="/legal/terms-of-service">Terms of service</Link>
            <Link to="/legal">All policies</Link>
          </nav>
          <Link className="bfs-footer-back-top" to={routes.landing()}><GraduationCap size={15} aria-hidden="true" /> BuddyForStudy <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>
    </footer>
  );
}

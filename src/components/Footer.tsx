import { ArrowUpRight } from "lucide-react";
import PublicSocialLinks from "@/components/PublicSocialLinks";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { routes } from "@/lib/routes";

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

export default function Footer() {
  const { session, profile } = useAuth();
  const isSignedIn = Boolean(session || profile);

  return (
    <footer className={`bfs-marketing-footer${isSignedIn ? " bfs-marketing-footer--signed-in" : ""}`}>
      <div className="bfs-marketing-footer__inner">
        <div className="bfs-marketing-footer__top">
          <div className="bfs-marketing-footer__columns">
            <section className="bfs-footer-column" aria-labelledby="footer-brand-title">
              <h2 id="footer-brand-title">BuddyForStudy</h2>
              <p className="bfs-footer-column__intro">Learn with direction. Build skills one step at a time.</p>
              <Link to={routes.about()}>About us</Link>
              <Link to={routes.contact()}>Contact us</Link>
              <PublicSocialLinks title="Follow BuddyForStudy" variant="footer" />
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-discover-title">
              <h2 id="footer-discover-title">Discover</h2>
              <Link to={routes.explore()}>Explore courses</Link>
              <Link to={routes.buildPath()}>Learning roadmaps</Link>
              {isSignedIn ? (
                <>
                  <Link to={routes.myLearning()}>My learning</Link>
                  <Link to={routes.saved()}>Saved learning</Link>
                </>
              ) : (
                <>
                  <Link to={routes.login()}>Sign in</Link>
                  <Link to={routes.register()}>Create an account</Link>
                </>
              )}
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-support-title">
              <h2 id="footer-support-title">Plans & support</h2>
              <Link to={routes.pricing()}>Plans & pricing</Link>
              <Link to={routes.faq()}>Help centre & FAQs</Link>
              {isSignedIn && <Link to={routes.notifications()}>Notifications</Link>}
              {isSignedIn && <Link to={routes.profile()}>My account</Link>}
              <Link to={routes.contact()}>Contact support</Link>
            </section>

            <section className="bfs-footer-column" aria-labelledby="footer-legal-title">
              <h2 id="footer-legal-title">Policies</h2>
              <Link to="/legal/privacy-policy">Privacy policy</Link>
              <Link to="/legal/terms-of-service">Terms of service</Link>
              <Link to="/legal/cookie-policy">Cookie policy</Link>
              <Link to="/legal">All policies & accessibility</Link>
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
            <a href="#cookie-settings" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new Event("bfs:open-cookie-settings")); }}>Cookie settings</a>
          </nav>
          <a className="bfs-footer-back-top" href="#root">Back to top <ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}

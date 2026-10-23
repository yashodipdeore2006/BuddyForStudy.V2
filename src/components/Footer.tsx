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
            <section className="bfs-footer-column" aria-labelledby="footer-about-title">
              <h2 id="footer-about-title">About</h2>
              <Link to={routes.about()}>About BuddyForStudy</Link>
              <Link to={routes.contact()}>Contact us</Link>
              <Link to={routes.faq()}>Help and support</Link>
              <PublicSocialLinks title="Follow BuddyForStudy" variant="footer" />
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
              <Link to="/legal/cookie-policy">Cookie policy</Link>
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
            <a href="#cookie-settings" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new Event("bfs:open-cookie-settings")); }}>Cookie settings</a>
          </nav>
          <a className="bfs-footer-back-top" href="#root">Back to top <ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}

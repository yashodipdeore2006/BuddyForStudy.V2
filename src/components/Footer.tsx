import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Footer() {
  const { session, profile } = useAuth();
  const isSignedIn = Boolean(session || profile);

  if (isSignedIn) {
    return (
      <footer className="bfs-slim-footer">
        <span>© 2026 BuddyForStudy</span>
        <nav aria-label="Footer navigation">
          <Link to="/profile">Help and account</Link>
          <Link to="/settings#learning-goals">Learning goals</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
      </footer>
    );
  }

  return (
    <footer className="bfs-marketing-footer">
      <div className="bfs-marketing-footer__inner">
        <Link to="/" className="bfs-user-brand" aria-label="BuddyForStudy home">
          <span className="bfs-user-brand__mark"><img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" /></span>
          <span className="bfs-user-brand__wordmark">Buddy<span>For</span>Study</span>
        </Link>
        <nav aria-label="Footer navigation">
          <Link to="/explore">Explore</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Get started</Link>
        </nav>
        <p>© 2026 BuddyForStudy. Learn with purpose, one step at a time.</p>
      </div>
    </footer>
  );
}

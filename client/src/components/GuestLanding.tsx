import { ArrowRight, Compass, GraduationCap, Route, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/context/SiteSettingsContext";
import { routes } from "@/lib/routes";

const capabilities = [
  {
    icon: Compass,
    title: "Explore what is available",
    text: "Browse the public course catalogue, compare learning options, and read course details before deciding where to begin.",
  },
  {
    icon: Route,
    title: "Give your goal a structure",
    text: "Use structured learning paths and roadmaps to break a broad skill goal into smaller, more understandable steps.",
  },
  {
    icon: GraduationCap,
    title: "Keep your learning organised",
    text: "When you create an account and start learning, your learner home brings enrolled courses, progress, and your next lesson together.",
  },
];

export default function GuestLanding() {
  const { settings } = useSiteSettings();
  const siteName = settings.brand.siteName.trim() || "BuddyForStudy";

  return (
    <main className="bfs-public-page" id="main-content">
      <section className="bfs-public-hero" aria-labelledby="guest-landing-title">
        <span className="bfs-public-eyebrow">
          <Sparkles size={15} aria-hidden="true" /> A clearer way to learn with {siteName}
        </span>
        <h1 id="guest-landing-title">Find your next skill. Know what to do next.</h1>
        <p>
          Bring course discovery, structured learning paths, and learner progress
          into one connected learning space. Explore what is available, choose a
          direction, and build your next step at your own pace.
        </p>
        <div className="bfs-public-hero__actions">
          <Link className="bfs-public-button" to={routes.explore()}>
            Explore courses <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="bfs-public-button bfs-public-button--secondary" to={routes.register()}>
            Create your account
          </Link>
        </div>
        <p className="bfs-public-note">
          Already have an account? <Link to={routes.login()}>Sign in</Link>
        </p>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="guest-capabilities-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">A connected learning experience</span>
          <h2 id="guest-capabilities-title">From finding a course to making steady progress.</h2>
          <p>
            Start by exploring the learning options that are currently available.
            Create an account when you are ready to keep your learning activity together.
          </p>
        </div>
        <div className="bfs-public-pillar-grid">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <article className="bfs-public-pillar" key={title}>
              <span className="bfs-public-pillar__icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bfs-public-cta" aria-labelledby="guest-cta-title">
        <div>
          <h2 id="guest-cta-title">Start with the skill you want to build.</h2>
          <p>
            You can explore public course details first, then sign in or create
            an account when you are ready to organise your learning.
          </p>
        </div>
        <Link className="bfs-public-button" to={routes.explore()}>
          Browse the course catalogue <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Route,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/context/SiteSettingsContext";
import { routes } from "@/lib/routes";
import LongFormCourseCarousel from "@/components/LongFormCourseCarousel";

const capabilities = [
  {
    icon: Compass,
    title: "Explore courses with context",
    text: "Browse available courses, compare learning options and review course details before deciding where to begin.",
  },
  {
    icon: Route,
    title: "Turn a goal into clear steps",
    text: "Use structured learning paths and roadmaps to break a broad skill goal into smaller, manageable stages.",
  },
  {
    icon: TrendingUp,
    title: "Keep your progress in view",
    text: "Bring your enrolled courses, completed lessons and next learning steps together in your learner space.",
  },
];

const learningSteps = [
  {
    number: "01",
    icon: Target,
    title: "Choose a direction",
    text: "Start with a skill or subject you want to learn and explore the options available.",
  },
  {
    number: "02",
    icon: BookOpen,
    title: "Follow a learning path",
    text: "Use course content and structured roadmaps to understand what to learn next.",
  },
  {
    number: "03",
    icon: CheckCircle2,
    title: "Build steady progress",
    text: "Create an account to keep your learning activity and progress organised.",
  },
];

export default function GuestLanding() {
  const { settings } = useSiteSettings();
  const siteName = settings.brand.siteName.trim() || "BuddyForStudy";

  return (
    <main className="bfs-public-page bfs-public-page--landing" id="main-content">
      <section className="bfs-public-hero bfs-public-hero--landing" aria-labelledby="guest-landing-title">
        <div className="bfs-public-hero__copy">
          <span className="bfs-public-eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            A clearer way to learn with {siteName}
          </span>
          <h1 id="guest-landing-title">Find the right course. Follow a clear learning path.</h1>
          <p>
            Bring course discovery, structured learning paths and learning progress
            together in one place—so you can spend less time wondering where to start
            and more time building skills.
          </p>
          <div className="bfs-public-hero__actions">
            <Link className="bfs-public-button" to={routes.explore()}>
              Explore courses <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="bfs-public-button bfs-public-button--secondary" to={routes.register()}>
              Create a free account
            </Link>
          </div>
          <p className="bfs-public-note">
            Already have an account? <Link to={routes.login()}>Sign in</Link>
            <span aria-hidden="true"> · </span>
            Explore courses before creating an account.
          </p>
        </div>

        <div
          className="bfs-learning-preview"
          role="img"
          aria-label="Illustrative learning journey showing three steps: choose a skill, follow a roadmap and track progress."
        >
          <div className="bfs-learning-preview__top" aria-hidden="true">
            <span><Sparkles size={15} /> Learning journey</span>
            <span className="bfs-learning-preview__tag">Example</span>
          </div>
          <div className="bfs-learning-preview__heading" aria-hidden="true">
            <span className="bfs-learning-preview__label">Your next steps</span>
            <h2>A path you can follow</h2>
            <p>Turn a learning goal into manageable actions.</p>
          </div>
          <div className="bfs-learning-preview__steps" aria-hidden="true">
            <div className="bfs-learning-preview__step">
              <span className="bfs-learning-preview__step-number">01</span>
              <span className="bfs-learning-preview__step-copy">
                <strong>Choose a skill</strong>
                <small>Decide what you want to learn</small>
              </span>
              <CheckCircle2 size={18} />
            </div>
            <div className="bfs-learning-preview__step">
              <span className="bfs-learning-preview__step-number">02</span>
              <span className="bfs-learning-preview__step-copy">
                <strong>Follow a roadmap</strong>
                <small>Move through clear learning stages</small>
              </span>
              <Route size={18} />
            </div>
            <div className="bfs-learning-preview__step">
              <span className="bfs-learning-preview__step-number">03</span>
              <span className="bfs-learning-preview__step-copy">
                <strong>Track your progress</strong>
                <small>Keep your next step in view</small>
              </span>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="bfs-learning-preview__footer" aria-hidden="true">
            <img src="/buddyforstudy-mascot.webp" alt="" />
            <span>Small, consistent steps add up.</span>
          </div>
        </div>
      </section>

      <LongFormCourseCarousel />

      <section className="bfs-public-content-section" aria-labelledby="guest-capabilities-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">One connected learning space</span>
          <h2 id="guest-capabilities-title">Everything starts with knowing your next step.</h2>
          <p>
            Discover learning options, bring structure to your goals and keep your
            progress organised as you move forward.
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

      <section className="bfs-public-content-section bfs-public-how-it-works" id="how-it-works" aria-labelledby="guest-steps-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">How it works</span>
          <h2 id="guest-steps-title">A simple way to keep moving.</h2>
          <p>
            You do not need to have everything figured out before you begin.
            Start with a direction and take the next useful step.
          </p>
        </div>
        <div className="bfs-public-steps-grid">
          {learningSteps.map(({ number, icon: Icon, title, text }) => (
            <article className="bfs-public-step" key={number}>
              <div className="bfs-public-step__top">
                <span className="bfs-public-step__number">{number}</span>
                <Icon size={20} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bfs-public-cta bfs-public-cta--landing" aria-labelledby="guest-cta-title">
        <div>
          <h2 id="guest-cta-title">Start exploring. Create an account when you are ready.</h2>
          <p>
            Browse the public course catalogue first. Sign up when you want to
            organise your learning and keep track of your progress.
          </p>
        </div>
        <div className="bfs-public-cta__actions">
          <Link className="bfs-public-button" to={routes.register()}>
            Get started free <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="bfs-public-cta__link" to={routes.pricing()}>View plans</Link>
        </div>
      </section>
    </main>
  );
}

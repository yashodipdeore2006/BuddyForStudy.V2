import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  GraduationCap,
  Layers3,
  Route,
  Sparkles,
  Target,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";
import { useSiteSettings } from "@/context/SiteSettingsContext";

const capabilities = [
  {
    icon: Compass,
    title: "Discover what to learn",
    text: "Explore the courses and learning topics currently available, then choose a starting point that fits the skill you want to develop.",
  },
  {
    icon: Route,
    title: "Give learning a structure",
    text: "Use structured learning paths and roadmaps to break a broad career or skill goal into smaller, more approachable steps.",
  },
  {
    icon: BookOpen,
    title: "Keep your learning organised",
    text: "Return to your learning area, revisit saved material, and keep your learning activity connected in one platform.",
  },
];

const principles = [
  {
    icon: Target,
    title: "Start with the learner's goal",
    text: "A useful learning experience begins with what someone wants to understand or build, not with an overwhelming list of unrelated resources.",
  },
  {
    icon: Layers3,
    title: "Make the next step understandable",
    text: "Organised topics and clear progression can make a large learning objective easier to approach one step at a time.",
  },
  {
    icon: Waypoints,
    title: "Connect discovery with progress",
    text: "Finding a resource is only the beginning. Learning tools should also help people return to their work and continue from where they left off.",
  },
];

const learningSteps = [
  {
    number: "01",
    title: "Choose a direction",
    text: "Identify a skill, subject, or career path you want to explore.",
  },
  {
    number: "02",
    title: "Explore the available learning",
    text: "Review courses and structured learning options, then decide where to begin.",
  },
  {
    number: "03",
    title: "Continue at your own pace",
    text: "Use your learning area and saved resources to return and keep moving forward.",
  },
];

export default function About() {
  const { settings } = useSiteSettings();
  const configuredDescription = settings.brand.description.trim();
  const descriptionIsPlaceholder = /^\[ADD:/i.test(configuredDescription);
  const platformDescription = configuredDescription && !descriptionIsPlaceholder
    ? configuredDescription
    : `${settings.brand.siteName} brings course discovery, structured learning paths, and learner progress together to help make skill development more organised.`;

  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero" aria-labelledby="about-page-title">
        <span className="bfs-public-eyebrow"><Sparkles size={15} aria-hidden="true" /> About {settings.brand.siteName}</span>
        <h1 id="about-page-title">Make your next learning step feel clear.</h1>
        <p>{platformDescription}</p>
        <div className="bfs-public-hero__actions">
          <Link className="bfs-public-button" to={routes.explore()}>
            Explore courses <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="bfs-public-button bfs-public-button--secondary" to={routes.faq()}>
            Visit the help centre
          </Link>
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="about-purpose-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Why BuddyForStudy</span>
          <h2 id="about-purpose-title">Learning should feel like a path, not a pile of tabs.</h2>
          <p>
            Learning a new skill often means deciding what to study, finding useful material,
            understanding what comes next, and keeping track of progress. BuddyForStudy is
            designed to bring those parts of the experience closer together.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="bfs-public-pillar">
            <span className="bfs-public-pillar__icon"><Compass size={22} aria-hidden="true" /></span>
            <h3>From uncertainty to a starting point</h3>
            <p>
              Instead of having to plan every detail before beginning, learners can explore
              available courses and structured paths, compare what is relevant, and choose
              a practical next step.
            </p>
          </article>
          <article className="bfs-public-pillar">
            <span className="bfs-public-pillar__icon"><GraduationCap size={22} aria-hidden="true" /></span>
            <h3>From a starting point to steady progress</h3>
            <p>
              A learning goal becomes easier to work towards when the material is organised
              and the learner can return to their learning activity without starting over.
            </p>
          </article>
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="about-capabilities-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">The platform</span>
          <h2 id="about-capabilities-title">A connected learning experience</h2>
          <p>
            BuddyForStudy brings together three practical parts of a learner's journey.
            The exact courses and features available may evolve as the platform develops.
          </p>
        </div>
        <div className="bfs-public-pillar-grid">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <article className="bfs-public-pillar" key={title}>
              <span className="bfs-public-pillar__icon"><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="about-principles-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Our approach</span>
          <h2 id="about-principles-title">Built around useful learning principles</h2>
          <p>
            These principles guide how the platform organises learning experiences.
            They describe the product approach, not claims about outcomes or guaranteed results.
          </p>
        </div>
        <div className="bfs-public-pillar-grid">
          {principles.map(({ icon: Icon, title, text }) => (
            <article className="bfs-public-pillar" key={title}>
              <span className="bfs-public-pillar__icon"><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="about-steps-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Getting started</span>
          <h2 id="about-steps-title">A simple way to begin</h2>
          <p>You do not need to have every step planned before you start exploring.</p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {learningSteps.map((step) => (
            <li className="bfs-public-pillar" key={step.number}>
              <span className="text-xs font-bold tracking-[.14em] text-violet-700">STEP {step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="about-trust-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Clear expectations</span>
          <h2 id="about-trust-title">A platform that keeps the details visible</h2>
          <p>
            Course availability, access requirements, and plan information can change.
            Review the details shown on each course and the current pricing information
            before making a decision.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Check course details for current content and access information.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Review plan details and availability before choosing a subscription.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Use the Help Centre for answers to common platform questions.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Contact the platform through the support details currently published.</p>
          </div>
        </div>
      </section>

      <section className="bfs-public-cta" aria-labelledby="about-cta-title">
        <div>
          <h2 id="about-cta-title">Ready to choose your next skill?</h2>
          <p>Browse the available courses and find a place to begin.</p>
        </div>
        <Link className="bfs-public-button" to={routes.explore()}>
          Start exploring <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

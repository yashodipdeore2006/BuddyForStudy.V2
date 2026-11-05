import { ArrowRight, BookOpen, Compass, GraduationCap, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";

const pillars = [
  { icon: Compass, title: "Discover with direction", text: "Explore courses and learning topics that match the skills you want to build." },
  { icon: BookOpen, title: "Learn in a clear sequence", text: "Use course structures and roadmaps to make a large learning goal feel manageable." },
  { icon: GraduationCap, title: "Keep your progress together", text: "Return to your learning, save useful courses, and build a consistent study habit." },
];

export default function About() {
  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero">
        <span className="bfs-public-eyebrow"><Sparkles size={15} /> About BuddyForStudy</span>
        <h1>Make your next learning step feel clear.</h1>
        <p>BuddyForStudy is a learning platform designed to help you discover courses, follow structured learning paths, and keep your learning journey organised.</p>
        <div className="bfs-public-hero__actions">
          <Link className="bfs-public-button" to={routes.explore()}>Explore courses <ArrowRight size={17} /></Link>
          <Link className="bfs-public-button bfs-public-button--secondary" to={routes.pricing()}>View plans</Link>
        </div>
      </section>
      <section className="bfs-public-content-section" aria-labelledby="about-pillars-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Our approach</span>
          <h2 id="about-pillars-title">A more organised way to learn</h2>
          <p>Start with a goal, find relevant learning material, and take the next step at your own pace.</p>
        </div>
        <div className="bfs-public-pillar-grid">
          {pillars.map(({ icon: Icon, title, text }) => (
            <article className="bfs-public-pillar" key={title}>
              <span className="bfs-public-pillar__icon"><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="bfs-public-cta">
        <div><h2>Ready to choose your next skill?</h2><p>Browse the available courses and find a place to begin.</p></div>
        <Link className="bfs-public-button" to={routes.explore()}>Start exploring <ArrowRight size={17} /></Link>
      </section>
    </main>
  );
}

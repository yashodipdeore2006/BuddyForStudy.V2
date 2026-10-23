import { ArrowRight, CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";

const faqs = [
  { question: "Where can I find courses?", answer: "Open Explore to browse the courses currently available on BuddyForStudy. Course details show the information available for each course." },
  { question: "How do I find plans and prices?", answer: "Visit the Pricing page to see subscription plans currently returned by the platform. Availability and prices may change as plans are updated." },
  { question: "Can I learn without a paid subscription?", answer: "Course access depends on the course's displayed price and the access rules shown by the platform. Check the course details before enrolling." },
  { question: "How do I return to a course I started?", answer: "Sign in and open My Learning to find your enrolled learning. The available course actions depend on your current enrollment." },
  { question: "Where can I read the platform policies?", answer: "The Legal and Policies section links to the published policy documents. If a document is unavailable, check the policy index for current publications." },
];

export default function FAQ() {
  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact">
        <span className="bfs-public-eyebrow"><CircleHelp size={15} /> Help centre</span>
        <h1>Frequently asked questions</h1>
        <p>Quick answers about discovering courses, plans, learning access, and platform policies.</p>
      </section>
      <section className="bfs-faq-list" aria-label="Frequently asked questions">
        {faqs.map((faq) => (
          <details className="bfs-faq-item" key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>
      <section className="bfs-public-cta">
        <div><h2>Still need help?</h2><p>Visit the contact page for the currently configured support options.</p></div>
        <Link className="bfs-public-button" to="/contact">Contact us <ArrowRight size={17} /></Link>
      </section>
    </main>
  );
}

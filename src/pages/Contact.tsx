import { ArrowUpRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";

const supportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim();

export default function Contact() {
  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact">
        <span className="bfs-public-eyebrow"><MessageCircle size={15} /> Contact us</span>
        <h1>We want your learning experience to work for you.</h1>
        <p>Choose the support route that fits your question. We only publish contact details that have been configured by the platform team.</p>
      </section>
      <section className="bfs-contact-grid" aria-label="Contact options">
        <article className="bfs-contact-card">
          <span className="bfs-public-pillar__icon"><Mail size={22} aria-hidden="true" /></span>
          <h2>Email support</h2>
          {supportEmail ? <>
            <p>For questions about the platform, account access, or learning experience, send us a message.</p>
            <a className="bfs-contact-email" href={`mailto:${supportEmail}`}>{supportEmail} <ArrowUpRight size={16} /></a>
          </> : <>
            <p>The public support email has not been configured yet. No address is shown here to avoid sending your message to an unverified destination.</p>
            <p className="bfs-public-note">Platform team: configure <code>VITE_PUBLIC_SUPPORT_EMAIL</code> in the frontend environment to publish the official support address.</p>
          </>}
        </article>
        <article className="bfs-contact-card">
          <span className="bfs-public-pillar__icon"><ShieldCheck size={22} aria-hidden="true" /></span>
          <h2>Account and billing</h2>
          <p>For personal account or subscription information, sign in and use the relevant account or billing screen.</p>
          <div className="bfs-contact-actions">
            <Link to={routes.login()}>Sign in</Link>
            <Link to={routes.pricing()}>Plans and pricing</Link>
          </div>
        </article>
      </section>
    </main>
  );
}

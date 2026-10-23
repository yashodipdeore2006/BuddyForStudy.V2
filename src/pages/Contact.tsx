import { ArrowUpRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";
import PublicSocialLinks from "@/components/PublicSocialLinks";

const rawSupportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const supportEmail = rawSupportEmail.length <= 254 && EMAIL_PATTERN.test(rawSupportEmail)
  ? rawSupportEmail
  : "";

export default function Contact() {
  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact">
        <span className="bfs-public-eyebrow"><MessageCircle size={15} aria-hidden="true" /> Contact us</span>
        <h1>We want your learning experience to work for you.</h1>
        <p>Choose the support route that fits your question. We only publish contact details that have been configured by the platform team.</p>
      </section>
      <section className="bfs-contact-grid" aria-label="Contact options">
        <article className="bfs-contact-card">
          <span className="bfs-public-pillar__icon"><Mail size={22} aria-hidden="true" /></span>
          <h2>Email support</h2>
          {supportEmail ? <>
            <p>For questions about the platform, account access, or learning experience, send us a message.</p>
            <a className="bfs-contact-email" href={`mailto:${encodeURIComponent(supportEmail).replace(/%40/g, "@")}`}>
              {supportEmail} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </> : <>
            <p>The official support email is not configured with a valid address yet. This page does not send messages through a contact form.</p>
            <p className="bfs-public-note">When an official support address is available, the platform team can configure <code>VITE_PUBLIC_SUPPORT_EMAIL</code> in the frontend environment.</p>
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
      <section className="bfs-contact-card bfs-contact-social-card" aria-labelledby="contact-social-title">
        <h2 id="contact-social-title">Find us on social media</h2>
        <p>Follow BuddyForStudy for platform updates, learning resources, and announcements.</p>
        <PublicSocialLinks variant="contact" showLabels />
      </section>
    </main>
  );
}

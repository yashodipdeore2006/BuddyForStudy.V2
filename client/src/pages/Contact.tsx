import { ArrowUpRight, Clock3, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";
import PublicSocialLinks from "@/components/PublicSocialLinks";
import { useSiteSettings } from "@/context/SiteSettingsContext";


export default function Contact() {
  const { settings } = useSiteSettings();
  const supportEmail = settings.contact.supportEmail;
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
            <p>For questions about the platform, account access, or learning experience, use the official support email below.</p>
            <a className="bfs-contact-email" href={`mailto:${encodeURIComponent(supportEmail).replace(/%40/g, "@")}`}>
              {supportEmail} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </> : <p>The official support email has not been published yet. Please check the Help Centre for self-service answers.</p>}
          {settings.contact.supportPhone && <p className="mt-3 flex items-center gap-2"><Phone size={15} aria-hidden="true" /><a href={`tel:${settings.contact.supportPhone.replace(/[^+0-9]/g, "")}`}>{settings.contact.supportPhone}</a></p>}
          {settings.contact.businessHours && <p className="mt-2 flex items-center gap-2"><Clock3 size={15} aria-hidden="true" />{settings.contact.businessHours}</p>}
          {settings.contact.officeAddress && <p className="mt-2 flex items-start gap-2"><MapPin size={15} aria-hidden="true" /><span>{settings.contact.officeAddress}</span></p>}
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

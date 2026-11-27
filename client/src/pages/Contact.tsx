import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  CreditCard,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import PublicSocialLinks from "@/components/PublicSocialLinks";
import { useAuth } from "@/context/AuthContext";
import { useSiteSettings } from "@/context/SiteSettingsContext";

function ContactDetail({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm text-slate-700">
      <Icon size={17} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export default function Contact() {
  const { settings } = useSiteSettings();
  const { session, profile } = useAuth();
  const supportEmail = settings.contact.supportEmail.trim();
  const isSignedIn = Boolean(session || profile);
  const mailto = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent("BuddyForStudy support request")}`
    : undefined;

  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact" aria-labelledby="contact-page-title">
        <span className="bfs-public-eyebrow">
          <MessageCircle size={15} aria-hidden="true" /> Contact us
        </span>
        <h1 id="contact-page-title">We want your learning experience to work for you.</h1>
        <p>
          Find the right place to get help with BuddyForStudy. For the quickest
          answer, you can also check the Help Centre before contacting the team.
        </p>
        <div className="bfs-public-hero__actions">
          <Link className="bfs-public-button" to={routes.faq()}>
            Visit the Help Centre <ArrowRight size={17} aria-hidden="true" />
          </Link>
          {mailto && (
            <a className="bfs-public-button bfs-public-button--secondary" href={mailto}>
              Email support <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="contact-routes-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">How can we help?</span>
          <h2 id="contact-routes-title">Choose the right support route</h2>
          <p>
            These routes help direct your question to the most relevant part of
            the platform. Only configured official contact details are displayed.
          </p>
        </div>
        <div className="bfs-public-pillar-grid">
          <article className="bfs-contact-card">
            <span className="bfs-public-pillar__icon"><BookOpen size={22} aria-hidden="true" /></span>
            <h2>Courses and learning</h2>
            <p>
              Questions about finding courses, learning paths, course content,
              or returning to your learning? Start with the Help Centre.
            </p>
            <div className="bfs-contact-actions">
              <Link to={routes.faq()}>Browse help answers <ArrowRight size={15} aria-hidden="true" /></Link>
              <Link to={routes.explore()}>Explore courses <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </article>

          <article className="bfs-contact-card">
            <span className="bfs-public-pillar__icon"><CreditCard size={22} aria-hidden="true" /></span>
            <h2>Account, plans and billing</h2>
            <p>
              For account-specific information, sign in and review the relevant
              account or billing area. Plan and payment availability is shown
              by the platform and may change.
            </p>
            <div className="bfs-contact-actions">
              {isSignedIn ? (
                <>
                  <Link to={routes.billing()}>Open billing <ArrowRight size={15} aria-hidden="true" /></Link>
                  <Link to={routes.settings()}>Account settings <ArrowRight size={15} aria-hidden="true" /></Link>
                </>
              ) : (
                <Link to={routes.login()}>Sign in to your account <ArrowRight size={15} aria-hidden="true" /></Link>
              )}
              <Link to={routes.pricing()}>View plans <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </article>

          <article className="bfs-contact-card">
            <span className="bfs-public-pillar__icon"><HelpCircle size={22} aria-hidden="true" /></span>
            <h2>Technical or other questions</h2>
            <p>
              If the Help Centre does not answer your question, use the official
              support contact published below. Include a short description of
              what happened and the page where you encountered it.
            </p>
            {mailto ? (
              <div className="bfs-contact-actions">
                <a href={mailto}>Contact support <ArrowUpRight size={15} aria-hidden="true" /></a>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                The official support email has not been published yet. Please
                use the Help Centre for self-service information.
              </p>
            )}
          </article>
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="contact-details-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Official contact information</span>
          <h2 id="contact-details-title">Contact the BuddyForStudy team</h2>
          <p>
            Contact information below is managed by the platform team. If a
            detail is not shown, it has not been published.
          </p>
        </div>
        <div className="bfs-contact-card">
          <div className="space-y-4">
            {supportEmail ? (
              <ContactDetail icon={Mail}>
                <span className="block font-semibold text-slate-900">Email</span>
                <a className="break-all font-semibold text-violet-700 underline-offset-4 hover:underline" href={mailto}>
                  {supportEmail}
                </a>
              </ContactDetail>
            ) : (
              <ContactDetail icon={Mail}>
                <span className="block font-semibold text-slate-900">Email</span>
                <span>Official support email not published yet.</span>
              </ContactDetail>
            )}
            {settings.contact.supportPhone && (
              <ContactDetail icon={Phone}>
                <span className="block font-semibold text-slate-900">Phone</span>
                <a href={`tel:${settings.contact.supportPhone.replace(/[^+0-9]/g, "")}`} className="font-semibold text-violet-700 underline-offset-4 hover:underline">
                  {settings.contact.supportPhone}
                </a>
              </ContactDetail>
            )}
            {settings.contact.businessHours && (
              <ContactDetail icon={Clock3}>
                <span className="block font-semibold text-slate-900">Published support hours</span>
                <span>{settings.contact.businessHours}</span>
              </ContactDetail>
            )}
            {settings.contact.officeAddress && (
              <ContactDetail icon={MapPin}>
                <span className="block font-semibold text-slate-900">Office address</span>
                <span>{settings.contact.officeAddress}</span>
              </ContactDetail>
            )}
            {!settings.contact.supportPhone && !settings.contact.businessHours && !settings.contact.officeAddress && (
              <p className="text-sm text-slate-500">
                No phone number, support hours, or office address has been published.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="bfs-public-content-section" aria-labelledby="contact-before-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Help us help you</span>
          <h2 id="contact-before-title">Before you send a support request</h2>
          <p>
            A clear description can make it easier to understand the issue.
            Share only information that is necessary for the support request.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <UserRound size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Mention the account email associated with your BuddyForStudy account when relevant.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <BookOpen size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Include the course, page, or feature you were using and the steps that led to the issue.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">Never send your password, one-time password, full card number, or security code.</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <MessageCircle size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p className="text-sm text-slate-700">If you include a screenshot, check it first for private or payment information.</p>
          </div>
        </div>
      </section>

      <section className="bfs-contact-card bfs-contact-social-card" aria-labelledby="contact-social-title">
        <h2 id="contact-social-title">Find us on social media</h2>
        <p>Follow {settings.brand.siteName} for platform updates, learning resources, and announcements.</p>
        <PublicSocialLinks variant="contact" showLabels />
      </section>
    </main>
  );
}

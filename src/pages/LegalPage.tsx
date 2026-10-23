import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

type LegalSummary = { slug: string; title: string; category: string; summary?: string; version: number; effectiveAt?: string | null; publishedAt?: string | null };
type LegalDocument = LegalSummary & { body: string; documentUrl?: string; updatedAt?: string };

const FALLBACK_POLICIES: Record<string, LegalDocument> = {
  "terms-of-service": {
    slug: "terms-of-service",
    title: "Terms of Service",
    category: "terms",
    summary: "Baseline terms for using BuddyForStudy while the administrator prepares a reviewed, published policy.",
    version: 1,
    effectiveAt: "2026-10-23",
    publishedAt: "2026-10-23",
    body: `# 1. Using BuddyForStudy
BuddyForStudy provides learning tools, course information, learning roadmaps, progress features, and related services. You agree to use the platform lawfully, provide accurate account information, and keep your sign-in credentials secure. Keep your account for your own use and do not sell or share access in a way that compromises security.

# 2. Acceptable use
Do not attempt to access another person's account or private information, interfere with the platform, bypass access controls, upload malicious content, infringe rights, or use the service for unlawful or abusive activity. We may restrict access when reasonably needed to protect learners, creators, the platform, or its services.

# 3. Learning information and external resources
Roadmaps, AI-generated explanations, summaries, course metadata, and selected third-party resources are provided to support learning. They can contain errors, become outdated, or be unavailable. Check important information and follow the terms of external providers. BuddyForStudy does not guarantee a specific exam result, job, certification, or career outcome.

# 4. Courses, plans, and payments
Course access depends on the access option shown for that course, including free enrollment, an eligible subscription, or a verified individual purchase. Prices, plan entitlements, cancellation, and refunds are described in the current checkout and any published pricing/refund policy. Payments may be processed by third-party payment providers; their terms also apply.

# 5. Content and intellectual property
Respect the rights of BuddyForStudy, course creators, and external resource providers. Do not copy, redistribute, or commercially exploit material unless you have permission or the law allows it.

# 6. Account security and availability
We may update features, correct content, or temporarily restrict access to address security, legal, reliability, or abuse issues. Where required, we will follow applicable law and any published policy.

# 7. Disclaimers and changes
The platform is provided as an educational service. To the extent permitted by applicable law, some features and third-party resources may be provided without guarantees of uninterrupted availability or fitness for a particular purpose. Any applicable consumer rights remain unaffected. Material changes to these terms should be published as a new version and presented for renewed acknowledgement where required.

# 8. Contact
For questions about these terms, use the Contact page to reach BuddyForStudy support.`,
  },
  "privacy-policy": {
    slug: "privacy-policy",
    title: "Privacy Policy",
    category: "privacy",
    summary: "A baseline explanation of the account information BuddyForStudy uses and the choices available to learners.",
    version: 1,
    effectiveAt: "2026-10-23",
    publishedAt: "2026-10-23",
    body: `# 1. Information you provide
We process the name and email address needed to operate an account. When you use Google sign-in, Google supplies the basic profile information you authorize, such as your name, email address, and profile picture. Google does not automatically provide your phone number through this sign-in flow. If you choose to complete your profile, you enter your phone number, city, and learning goal yourself.

# 2. Learning and service information
To run the platform, we process course enrollments, saved courses, learning progress, quiz activity, reviews, preferences, account-security events, and relevant support records. If you purchase a course or plan, payment providers process payment details; BuddyForStudy receives the transaction information needed to record and support the purchase.

# 3. How information is used
Information is used to authenticate your account, provide learning features, personalize your experience, remember settings, support purchases, maintain safety, prevent abuse, troubleshoot reliability issues, and respond to requests. Optional product-news and promotional email is separate from essential account and transactional messages.

# 4. Service providers and external resources
The platform may rely on providers for sign-in and identity (including Google when you choose Google sign-in), hosting and storage, email delivery, payment processing, AI-assisted features, and learning-resource retrieval. The website also loads the Inter typeface from Google Fonts. Google Identity Services is loaded when a page offering Google sign-in is opened, rather than across every page. These third-party requests may receive technical connection information such as your IP address, browser/device details, and the page/request metadata necessary to deliver the resource. Each provider may process data under its own terms and privacy notices. We aim to use providers only as needed to deliver or protect the relevant service and subject to applicable requirements.

# 5. Your choices
You can change cookie and browser-storage preferences through Cookie settings, update or remove optional profile details in Settings, and opt out of product-news emails there. Declining optional marketing does not affect access to ordinary learning features. Essential storage required for sign-in and security cannot be switched off while using the signed-in service.

# 6. Security and retention
We use technical and operational controls intended to protect account information. No online system can promise absolute security. Information is retained for as long as needed to operate the service, maintain account and learning records, resolve disputes, meet legal obligations, and protect the platform, subject to applicable law.

# 7. Requests and contact
For questions or requests about access, correction, deletion, or use of your information, contact BuddyForStudy through the Contact page. Requests may require identity verification and are handled subject to applicable law and necessary service records.`,
  },
  "cookie-policy": {
    slug: "cookie-policy",
    title: "Cookies and browser storage",
    category: "cookies",
    summary: "How essential browser storage and optional tracking preferences are handled in BuddyForStudy.",
    version: 1,
    effectiveAt: "2026-10-23",
    publishedAt: "2026-10-23",
    body: `# 1. Essential browser storage
BuddyForStudy uses browser storage for sign-in/session state, security, appearance, and remembering your consent choices. Some essential storage may not be an HTTP cookie, but the same preference controls are provided here for clarity. Essential storage remains active while you use signed-in features.

# 2. Optional categories
The consent manager offers separate Analytics and Marketing categories. They are off by default until you choose to enable them. In this build, BuddyForStudy has not enabled an analytics SDK or an advertising/marketing pixel, so these preferences are recorded for your control and future use; they do not currently enable a tracker. Any optional tracking technology added to the platform must check and respect your recorded preference before loading or storing optional information.

# 3. Your choice and changes
You can Accept all, Reject optional categories, or open Cookie settings to choose categories separately. You can reopen Cookie settings from the footer or Settings at any time. Your preference is kept in this browser and, when you are signed in, may also be stored with your account.

# 4. Current implementation
The consent manager records your choice. Optional categories should not be treated as permission to load a particular third-party tool unless that tool is actually configured and checks the saved preference. Essential sign-in and security storage remains on.`,
  }
};
const labels: Record<string, string> = { privacy: "Privacy", terms: "Terms of service", rules: "Rules & regulations", refunds: "Refunds & cancellation", cookies: "Cookies", community: "Community guidelines", other: "Other policies" };

function ContentBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Array<{ type: "paragraph" | "heading" | "bullet" | "ordered"; text: string }> = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { blocks.push({ type: "paragraph", text: paragraph.join(" ") }); paragraph = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,3}\s+/.test(line)) { flush(); blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s+/, "") }); }
    else if (/^[-*]\s+/.test(line)) { flush(); blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") }); }
    else if (/^\d+[.)]\s+/.test(line)) { flush(); blocks.push({ type: "ordered", text: line.replace(/^\d+[.)]\s+/, "") }); }
    else paragraph.push(line);
  }
  flush();
  return <div className="space-y-4">{blocks.map((block, index) => block.type === "heading" ? <h2 key={index} className="pt-3 text-xl font-semibold tracking-tight text-slate-950">{block.text}</h2> : block.type === "bullet" ? <div key={index} className="flex gap-3 pl-2 text-sm leading-7 text-slate-700"><span aria-hidden="true">•</span><p>{block.text}</p></div> : block.type === "ordered" ? <div key={index} className="flex gap-3 pl-2 text-sm leading-7 text-slate-700"><span aria-hidden="true">{index + 1}.</span><p>{block.text}</p></div> : <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{block.text}</p>)}</div>;
}

export default function LegalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [documents, setDocuments] = useState<LegalSummary[]>([]);
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fallbackPolicy = slug ? FALLBACK_POLICIES[slug] || null : null;
  const activeDocument = document || fallbackPolicy;
  const usingFallbackPolicy = Boolean(slug && !document && fallbackPolicy);

  useEffect(() => {
    let active = true; setLoading(true); setError(""); setDocument(null); setDocuments([]);
    const request = slug ? apiFetch("/api/legal/documents/" + encodeURIComponent(slug)).then((data) => { if (active) setDocument(data.document || null); })
      : apiFetch("/api/legal/documents").then((data) => { if (active) setDocuments(data.documents || []); });
    request.catch((e) => { if (active) setError(e instanceof Error ? e.message : "Unable to load policy documents."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  return <main className="mx-auto min-h-[65vh] w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
    <Link to="/legal" className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900"><ArrowLeft size={16}/>All policies</Link>
    {loading ? <div role="status" className="mt-8 space-y-4"><div className="h-8 w-2/3 animate-pulse rounded bg-slate-200"/><div className="h-4 w-full animate-pulse rounded bg-slate-100"/><div className="h-4 w-5/6 animate-pulse rounded bg-slate-100"/></div>
      : error && !fallbackPolicy ? <section className="mt-8 rounded-2xl border border-slate-200 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400"/><h1 className="mt-3 text-xl font-semibold text-slate-900">{slug ? "Policy not available" : "Policies could not be loaded"}</h1><p className="mt-2 text-sm text-slate-600">{slug ? "This document may not have been published or may have been removed." : error}</p><Link to="/legal" className="mt-4 inline-block font-semibold text-violet-700">Browse available policies</Link></section>
      : slug && activeDocument ? <article className="mt-8">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-700"><ShieldCheck size={17}/>{labels[activeDocument.category] || "Platform policy"}</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{activeDocument.title}</h1>
        {activeDocument.summary && <p className="mt-4 text-lg leading-7 text-slate-600">{activeDocument.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-xs text-slate-500"><span>Version {activeDocument.version}</span><span>Published {activeDocument.publishedAt ? new Date(activeDocument.publishedAt).toLocaleDateString() : "—"}</span><span>Effective {activeDocument.effectiveAt ? new Date(activeDocument.effectiveAt).toLocaleDateString() : "on publication"}</span></div>
        {usingFallbackPolicy && <div role="note" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This is an interim default disclosure (version 1), shown until an administrator publishes a reviewed policy. The platform operator should have this text reviewed and replace it with the applicable approved policy before production launch.</div>}
        <div className="mt-8"><ContentBlock text={activeDocument.body}/></div>
        {activeDocument.documentUrl && <a href={activeDocument.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Open attached document <ExternalLink size={15}/></a>}
      </article>
      : !slug && documents.length ? <><header className="mt-8"><p className="text-sm font-semibold text-violet-700">Transparency & trust</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Legal & policies</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Read the policies and guidelines that explain how BuddyForStudy operates and how your information is handled.</p></header><div className="mt-8 grid gap-3 sm:grid-cols-2">{documents.map((item) => <Link key={item.slug} to={"/legal/" + item.slug} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{labels[item.category] || "Policy"}</p><h2 className="mt-2 text-lg font-semibold text-slate-950 group-hover:text-violet-800">{item.title}</h2>{item.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>}<p className="mt-4 text-xs text-slate-500">Version {item.version}{item.effectiveAt ? " · Effective " + new Date(item.effectiveAt).toLocaleDateString() : ""}</p></Link>)}</div></>
      : !slug ? <><header className="mt-8"><p className="text-sm font-semibold text-violet-700">Transparency & trust</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Legal & policies</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Read the policies and guidelines that explain how BuddyForStudy operates and how your information is handled.</p></header><div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Some pages below are interim default disclosures. Administrators should publish reviewed legal documents in Admin → Legal before production launch.</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{Object.values(FALLBACK_POLICIES).map((item) => <Link key={item.slug} to={"/legal/" + item.slug} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{labels[item.category] || "Policy"}</p><h2 className="mt-2 text-lg font-semibold text-slate-950 group-hover:text-violet-800">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p><p className="mt-4 text-xs text-slate-500">Interim version 1</p></Link>)}</div></> : null}
  </main>;
}

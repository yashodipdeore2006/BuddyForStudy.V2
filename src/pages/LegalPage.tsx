import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

type LegalSummary = { slug: string; title: string; category: string; summary?: string; version: number; effectiveAt?: string | null; publishedAt?: string | null };
type LegalDocument = LegalSummary & { body: string; documentUrl?: string; updatedAt?: string };
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
      : error ? <section className="mt-8 rounded-2xl border border-slate-200 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400"/><h1 className="mt-3 text-xl font-semibold text-slate-900">{slug ? "Policy not available" : "Policies could not be loaded"}</h1><p className="mt-2 text-sm text-slate-600">{slug ? "This document may not have been published or may have been removed." : error}</p><Link to="/legal" className="mt-4 inline-block font-semibold text-violet-700">Browse available policies</Link></section>
      : slug && document ? <article className="mt-8">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-700"><ShieldCheck size={17}/>{labels[document.category] || "Platform policy"}</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{document.title}</h1>
        {document.summary && <p className="mt-4 text-lg leading-7 text-slate-600">{document.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-xs text-slate-500"><span>Version {document.version}</span><span>Published {document.publishedAt ? new Date(document.publishedAt).toLocaleDateString() : "—"}</span><span>Effective {document.effectiveAt ? new Date(document.effectiveAt).toLocaleDateString() : "on publication"}</span></div>
        <div className="mt-8"><ContentBlock text={document.body}/></div>
        {document.documentUrl && <a href={document.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Open attached document <ExternalLink size={15}/></a>}
      </article>
      : !slug && documents.length ? <><header className="mt-8"><p className="text-sm font-semibold text-violet-700">Transparency & trust</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Legal & policies</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Read the policies and guidelines that explain how BuddyForStudy operates and how your information is handled.</p></header><div className="mt-8 grid gap-3 sm:grid-cols-2">{documents.map((item) => <Link key={item.slug} to={"/legal/" + item.slug} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{labels[item.category] || "Policy"}</p><h2 className="mt-2 text-lg font-semibold text-slate-950 group-hover:text-violet-800">{item.title}</h2>{item.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>}<p className="mt-4 text-xs text-slate-500">Version {item.version}{item.effectiveAt ? " · Effective " + new Date(item.effectiveAt).toLocaleDateString() : ""}</p></Link>)}</div></>
      : !slug ? <section className="mt-10 rounded-2xl border border-slate-200 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400"/><h1 className="mt-3 text-xl font-semibold text-slate-900">Policies are being prepared</h1><p className="mt-2 text-sm text-slate-600">Published policies will appear here when available.</p></section> : null}
  </main>;
}

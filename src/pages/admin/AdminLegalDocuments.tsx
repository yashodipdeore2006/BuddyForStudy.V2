import { useCallback, useEffect, useState } from "react";
import { Archive, ExternalLink, FileText, History, Plus, RefreshCw, Save, Send, Eye, EyeOff } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminAlert, AdminButton, AdminCard, AdminEmptyState, AdminPageHeader, AdminSkeleton } from "@/components/admin/AdminUI";

type LegalDocument = {
  _id: string; slug: string; publishedSlug?: string; title: string; category: string; summary: string; body: string;
  documentUrl?: string; effectiveAt?: string | null; isPublished: boolean; currentVersion: number;
  publishedAt?: string | null; updatedAt?: string; revisionNote?: string; hasUnpublishedChanges?: boolean;
};
type Version = { version: number; title: string; publishedAt: string; effectiveAt?: string | null; revisionNote: string; isCurrent: boolean };

const emptyDraft = { title: "", slug: "", category: "privacy", summary: "", body: "", documentUrl: "", effectiveAt: "", revisionNote: "" };
const categoryLabels: Record<string, string> = { privacy: "Privacy Policy", terms: "Terms of Service", rules: "Rules & Regulations", refunds: "Refunds & Cancellation", cookies: "Cookie Policy", community: "Community Guidelines", other: "Other" };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

export default function AdminLegalDocuments() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const selected = documents.find((doc) => doc._id === selectedId);
  const draftDirty = Boolean(selected && (draft.title !== selected.title || draft.slug !== selected.slug || draft.category !== selected.category || draft.summary !== (selected.summary || "") || draft.body !== (selected.body || "") || draft.documentUrl !== (selected.documentUrl || "") || draft.effectiveAt !== (selected.effectiveAt ? String(selected.effectiveAt).slice(0, 10) : "")));

  const load = useCallback(async (preferredId?: string | null) => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/legal/admin/documents");
      const rows: LegalDocument[] = data.documents || [];
      setDocuments(rows);
      const nextId = preferredId ?? selectedId;
      if (nextId) {
        const current = rows.find((row) => row._id === nextId);
        if (current) {
          setSelectedId(current._id);
          setDraft({ title: current.title, slug: current.slug, category: current.category, summary: current.summary || "", body: current.body || "", documentUrl: current.documentUrl || "", effectiveAt: current.effectiveAt ? String(current.effectiveAt).slice(0, 10) : "", revisionNote: "" });
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load legal documents."); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { void load(null); }, [load]);

  function newDocument() {
    setSelectedId(null); setDraft({ ...emptyDraft }); setReason(""); setPreview(false); setHistory(null); setError(""); setNotice("");
  }
  function editDocument(doc: LegalDocument) {
    setSelectedId(doc._id);
    setDraft({ title: doc.title, slug: doc.slug, category: doc.category, summary: doc.summary || "", body: doc.body || "", documentUrl: doc.documentUrl || "", effectiveAt: doc.effectiveAt ? String(doc.effectiveAt).slice(0, 10) : "", revisionNote: "" });
    setReason(""); setPreview(false); setHistory(null); setError(""); setNotice("");
  }
  function setField<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (draft.revisionNote.trim().length < 10) { setError("Add a revision reason of at least 10 characters."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...draft, effectiveAt: draft.effectiveAt || null };
      const data = await adminFetch(selectedId ? "/api/legal/admin/documents/" + selectedId : "/api/legal/admin/documents", {
        method: selectedId ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      const saved = data.document as LegalDocument;
      setSelectedId(saved._id);
      setNotice("Draft changes saved. The live policy remains unchanged until you publish.");
      setDraft({ title: saved.title, slug: saved.slug, category: saved.category, summary: saved.summary || "", body: saved.body || "", documentUrl: saved.documentUrl || "", effectiveAt: saved.effectiveAt ? String(saved.effectiveAt).slice(0, 10) : "", revisionNote: "" });
      setReason("");
      await load(saved._id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save draft."); }
    finally { setSaving(false); }
  }

  async function publishDocument() {
    if (draftDirty) { setError("Save your draft changes before publishing."); return; }
    if (!selectedId) { setError("Save this document as a draft before publishing."); return; }
    if (reason.trim().length < 10) { setError("Enter a publish reason of at least 10 characters."); return; }
    setPublishing(true); setError(""); setNotice("");
    try {
      await adminFetch("/api/legal/admin/documents/" + selectedId + "/publish", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setNotice("Policy published. The new version is now live.");
      setReason(""); await load(selectedId);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to publish policy."); }
    finally { setPublishing(false); }
  }

  async function changeState(action: "unpublish" | "archive", doc: LegalDocument) {
    const reasonText = window.prompt(action === "archive" ? "Why are you archiving this document? (10+ characters)" : "Why are you unpublishing this document? (10+ characters)");
    if (!reasonText || reasonText.trim().length < 10) return;
    setError(""); setNotice("");
    try {
      await adminFetch("/api/legal/admin/documents/" + doc._id + "/" + action, { method: "POST", body: JSON.stringify({ reason: reasonText.trim() }) });
      setNotice(action === "archive" ? "Document archived." : "Policy unpublished.");
      if (selectedId === doc._id) { setSelectedId(null); setDraft({ ...emptyDraft }); }
      await load(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update document status."); }
  }

  async function showHistory(doc: LegalDocument) {
    setError("");
    try {
      const data = await adminFetch("/api/legal/admin/documents/" + doc._id + "/history");
      setHistory(data.versions || []); setHistoryTitle(doc.title);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load version history."); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader eyebrow="Platform governance" title="Legal & policies" description="Maintain published policies, keep a version history, and preview changes before they go live." actions={<><AdminButton icon={<RefreshCw size={16}/>} onClick={() => void load(selectedId)}>Refresh</AdminButton><AdminButton variant="primary" icon={<Plus size={16}/>} onClick={newDocument}>New document</AdminButton></>} />
      {error && <AdminAlert tone="danger" title="Action could not be completed">{error}</AdminAlert>}
      {notice && <AdminAlert tone="success">{notice}</AdminAlert>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
        <AdminCard className="overflow-hidden">
          <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-950">Document library</h2><p className="mt-1 text-sm text-slate-500">{documents.length} active records</p></div>
          {loading ? <div className="p-4"><AdminSkeleton rows={5}/></div> : documents.length ? <div className="divide-y divide-slate-100">
            {documents.map((doc) => <article key={doc._id} className={"p-4 " + (selectedId === doc._id ? "bg-violet-50/60" : "")}>
              <button type="button" onClick={() => editDocument(doc)} className="w-full text-left">
                <span className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-900">{doc.title}</span><span className={"shrink-0 rounded-full px-2 py-1 text-xs font-medium " + (doc.isPublished ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>{doc.isPublished ? "Published" : "Draft"}</span></span>
                <span className="mt-1 block text-xs text-slate-500">{categoryLabels[doc.category] || doc.category} · {doc.slug}</span>
                <span className="mt-2 block text-xs text-slate-500">Live version {doc.currentVersion || "—"}{doc.hasUnpublishedChanges ? " · Draft changes pending" : ""}</span>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <AdminButton size="sm" icon={<History size={14}/>} onClick={() => void showHistory(doc)}>History</AdminButton>
                {doc.isPublished && <AdminButton size="sm" icon={<EyeOff size={14}/>} onClick={() => void changeState("unpublish", doc)}>Unpublish</AdminButton>}
                <AdminButton size="sm" variant="danger-ghost" icon={<Archive size={14}/>} onClick={() => void changeState("archive", doc)}>Archive</AdminButton>
                {doc.isPublished && <a className="admin-button admin-button--sm" href={"/legal/" + (doc.publishedSlug || doc.slug)} target="_blank" rel="noreferrer"><ExternalLink size={14}/>View live</a>}
              </div>
            </article>)}
          </div> : <AdminEmptyState title="No policy documents yet" description="Create a draft for your privacy policy, terms, rules, or another platform document." icon={<FileText size={24}/>}/>}
        </AdminCard>

        <AdminCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">{selected ? "Document editor" : "New draft"}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected?.title || "Create a policy document"}</h2><p className="mt-1 text-sm text-slate-500">Changes to published policies remain drafts until you publish a new version.</p></div><AdminButton icon={<Eye size={15}/>} onClick={() => setPreview((value) => !value)}>{preview ? "Edit document" : "Preview draft"}</AdminButton></div>
          {preview ? <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-violet-700">Draft preview · not public</p><h1 className="mt-2 text-2xl font-bold text-slate-950">{draft.title || "Untitled document"}</h1>{draft.summary && <p className="mt-2 text-slate-600">{draft.summary}</p>}
            <div className="mt-5 space-y-4">{draft.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{paragraph}</p>)}</div>
            {draft.documentUrl && <a href={draft.documentUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-violet-700">Open attached document <ExternalLink size={14}/></a>}
          </div> : <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Document title<input required maxLength={180} value={draft.title} onChange={(e) => { setField("title", e.target.value); if (!selectedId && !draft.slug) setField("slug", slugify(e.target.value)); }} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Privacy Policy"/></label>
              <label className="block text-sm font-medium text-slate-700">Category<select value={draft.category} onChange={(e) => setField("category", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">{Object.entries(categoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label className="block text-sm font-medium text-slate-700">Public URL slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} value={draft.slug} onChange={(e) => setField("slug", e.target.value.toLowerCase())} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="privacy-policy"/><span className="mt-1 block text-xs text-slate-500">Public URL: /legal/{draft.slug || "your-document-slug"}</span></label>
            <label className="block text-sm font-medium text-slate-700">Short summary<textarea maxLength={500} rows={2} value={draft.summary} onChange={(e) => setField("summary", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Briefly explain what this document covers."/></label>
            <label className="block text-sm font-medium text-slate-700">Import policy text (.md or .txt)<input type="file" accept=".md,.txt,text/plain,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 50000) { setError("Policy text files must be 50 KB or smaller."); event.target.value = ""; return; } void file.text().then((text) => { setField("body", text); setNotice("Imported " + file.name + " into the draft editor. Save the draft to keep the changes."); setError(""); }).catch(() => setError("Unable to read that file. Please try a UTF-8 .txt or .md file.")); event.target.value = ""; }} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-700" /><span className="mt-1 block text-xs text-slate-500">Imports text into the editor; the file itself is not stored as an attachment. For PDFs, provide a hosted HTTPS URL below.</span></label>\n            <label className="block text-sm font-medium text-slate-700">Policy content<textarea required maxLength={50000} rows={16} value={draft.body} onChange={(e) => setField("body", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm leading-6" placeholder={"Write the policy text here. Use plain text, headings, and blank lines for sections.\\n\\n1. Introduction\\n..."} /><span className="mt-1 block text-xs text-slate-500">{draft.body.length.toLocaleString()} / 50,000 characters. HTML is displayed as text, not executed.</span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Effective date<input type="date" value={draft.effectiveAt} onChange={(e) => setField("effectiveAt", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"/></label>
              <label className="block text-sm font-medium text-slate-700">Optional hosted PDF/document URL<input type="url" value={draft.documentUrl} onChange={(e) => setField("documentUrl", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="https://..."/></label>
            </div>
            <label className="block text-sm font-medium text-slate-700">Revision reason <span className="font-normal text-slate-500">(required, 10–500 characters)</span><textarea required minLength={10} maxLength={500} rows={2} value={draft.revisionNote} onChange={(e) => setField("revisionNote", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Explain what changed and why."/></label>
            <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4"><AdminButton type="submit" variant="primary" loading={saving} icon={<Save size={16}/>}>Save draft</AdminButton><span className="text-xs text-slate-500">Saving never changes the live published version.</span></div>
          </form>}
          {selectedId && !preview && <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4"><h3 className="font-semibold text-slate-900">Publish this version</h3><p className="mt-1 text-sm text-slate-600">Save draft changes first. Publishing creates a new immutable version and makes it live immediately.</p><label className="mt-3 block text-sm font-medium text-slate-700">Publish reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Why should this version become effective?"/></label><AdminButton variant="primary" loading={publishing} disabled={draftDirty} icon={<Send size={15}/>} className="mt-3" onClick={() => void publishDocument()}>Publish new version</AdminButton>{draftDirty && <p className="mt-2 text-xs text-amber-800">Save your unsaved changes before publishing.</p>}</div>}
          {history && <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Version history · {historyTitle}</h3><button type="button" className="text-sm text-violet-700" onClick={() => setHistory(null)}>Close</button></div>{history.length ? <ol className="mt-3 space-y-3">{history.map((version) => <li key={version.version} className="rounded-lg bg-slate-50 p-3"><div className="flex flex-wrap items-center gap-2"><strong>Version {version.version}</strong>{version.isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Current</span>}</div><p className="mt-1 text-sm text-slate-700">{version.title}</p><p className="mt-1 text-xs text-slate-500">{version.publishedAt ? new Date(version.publishedAt).toLocaleString() : "—"} · {version.revisionNote}</p></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">No published versions yet.</p>}</div>}
        </AdminCard>
      </div>
    </div>
  );
}

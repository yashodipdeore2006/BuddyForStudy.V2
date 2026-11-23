import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, CircleHelp, Eye, Plus, RefreshCw, Save, Upload } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminAlert, AdminBadge, AdminButton, AdminCard, AdminEmptyState, AdminPageHeader, AdminSkeleton } from "@/components/admin/AdminUI";

type FaqStatus = "draft" | "published" | "archived";
type FaqItem = {
  id: string;
  key: string;
  question: string;
  answer: string;
  category: string;
  status: FaqStatus;
  displayOrder: number;
  featured: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
};
type Category = { value: string; label: string };
type Draft = {
  question: string;
  answer: string;
  category: string;
  displayOrder: string;
  featured: boolean;
  reason: string;
};
type AccessResponse = { access?: { permissions?: string[] } };
type ListResponse = { faqs?: FaqItem[]; categories?: Category[]; starterFaqsAvailable?: boolean };

const DEFAULT_CATEGORIES: Category[] = [
  { value: "getting-started", label: "Getting started" },
  { value: "accounts", label: "Accounts" },
  { value: "courses-learning", label: "Courses & learning" },
  { value: "plans-payments", label: "Plans & payments" },
  { value: "technical-support", label: "Technical support" },
  { value: "privacy-safety", label: "Privacy & safety" },
  { value: "other", label: "Other" },
];

const EMPTY_DRAFT: Draft = {
  question: "",
  answer: "",
  category: "getting-started",
  displayOrder: "100",
  featured: false,
  reason: "",
};

const STATUS_LABELS: Record<FaqStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function toDraft(item: FaqItem): Draft {
  return {
    question: item.question,
    answer: item.answer,
    category: item.category,
    displayOrder: String(item.displayOrder ?? 100),
    featured: Boolean(item.featured),
    reason: "",
  };
}

export default function AdminFAQs() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [starterFaqsAvailable, setStarterFaqsAvailable] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FaqStatus>("all");
  const [importReason, setImportReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = items.find((item) => item.id === selectedId) || null;
  const canManage = permissions.includes("faqs.manage");
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesSearch = !query || item.question.toLowerCase().includes(query) ||
        item.answer.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, statusFilter]);

  const load = useCallback(async (preferredId: string | null = null) => {
    setLoading(true);
    setError("");
    try {
      const [faqResponse, accessResponse] = await Promise.all([
        adminFetch("/api/admin/faqs") as Promise<ListResponse>,
        adminFetch("/api/admin/access") as Promise<AccessResponse>,
      ]);
      const rows = faqResponse.faqs || [];
      setItems(rows);
      setCategories(faqResponse.categories?.length ? faqResponse.categories : DEFAULT_CATEGORIES);
      setStarterFaqsAvailable(Boolean(faqResponse.starterFaqsAvailable));
      setPermissions(accessResponse.access?.permissions || []);
      if (preferredId) {
        const nextItem = rows.find((item) => item.id === preferredId);
        if (nextItem) {
          setSelectedId(nextItem.id);
          setDraft(toDraft(nextItem));
        } else {
          setSelectedId(null);
          setDraft({ ...EMPTY_DRAFT });
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load FAQ content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(null); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function newFaq() {
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT });
    setError("");
    setNotice("");
  }

  function editFaq(item: FaqItem) {
    setSelectedId(item.id);
    setDraft(toDraft(item));
    setError("");
    setNotice("");
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveFaq() {
    if (!canManage) return;
    if (draft.reason.trim().length < 10) {
      setError("Enter a change reason of at least 10 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        question: draft.question,
        answer: draft.answer,
        category: draft.category,
        displayOrder: Number(draft.displayOrder),
        featured: draft.featured,
        reason: draft.reason.trim(),
      };
      const response = await adminFetch(
        selectedId ? "/api/admin/faqs/" + selectedId : "/api/admin/faqs",
        { method: selectedId ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      const saved = response.faq as FaqItem;
      setSelectedId(saved.id);
      setNotice(saved.status === "published"
        ? "FAQ updated. Changes to published FAQs are live immediately."
        : "FAQ draft saved. It is not visible on the public FAQ page until published.");
      setDraft({ ...toDraft(saved), reason: "" });
      await load(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this FAQ.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: FaqStatus) {
    if (!canManage || !selectedId) return;
    if (draft.reason.trim().length < 10) {
      setError("Enter a status-change reason of at least 10 characters.");
      return;
    }
    setChangingStatus(true);
    setError("");
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/faqs/" + selectedId + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status, reason: draft.reason.trim() }),
      });
      const updated = response.faq as FaqItem;
      setNotice("FAQ status changed to " + STATUS_LABELS[updated.status].toLowerCase() + ".");
      setDraft({ ...toDraft(updated), reason: "" });
      await load(updated.id);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to change FAQ status.");
    } finally {
      setChangingStatus(false);
    }
  }

  async function importStarterFaqs() {
    if (!canManage) return;
    if (importReason.trim().length < 10) {
      setError("Enter an import reason of at least 10 characters.");
      return;
    }
    setImporting(true);
    setError("");
    setNotice("");
    try {
      await adminFetch("/api/admin/faqs/import-starter", {
        method: "POST",
        body: JSON.stringify({ reason: importReason.trim() }),
      });
      setImportReason("");
      setNotice("The existing five FAQ entries are now managed and published. You can edit or unpublish them individually.");
      await load(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import the starter FAQs.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader
        eyebrow="Public content"
        title="FAQ management"
        description="Maintain learner-facing answers, organise topics, and control which entries are published."
        actions={<>
          <AdminButton icon={<RefreshCw size={16} />} onClick={() => void load(selectedId)}>Refresh</AdminButton>
          <AdminButton variant="primary" icon={<Plus size={16} />} onClick={newFaq} disabled={!canManage}>New FAQ</AdminButton>
        </>}
      />

      {error && <AdminAlert tone="danger" title="Action could not be completed">{error}</AdminAlert>}
      {notice && <AdminAlert tone="success">{notice}</AdminAlert>}

      {starterFaqsAvailable && (
        <AdminCard className="border border-violet-200 bg-violet-50/50 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="rounded-xl bg-white p-2 text-violet-700"><Upload size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-950">Bring the current FAQ answers into the manager</h2>
              <p className="mt-1 text-sm leading-6 text-slate-700">The public page is currently using its five built-in starter answers. Importing them creates editable, published FAQ records without changing their wording.</p>
              <label htmlFor="faq-import-reason" className="mt-3 block text-sm font-semibold text-slate-800">Import reason <span className="font-normal text-slate-500">(10–500 characters)</span></label>
              <textarea id="faq-import-reason" value={importReason} onChange={(event) => setImportReason(event.target.value)} maxLength={500} rows={2} className="input-field mt-1 w-full max-w-2xl" placeholder="Explain why the starter FAQ content is being imported." disabled={!canManage} />
              <AdminButton variant="primary" className="mt-3" icon={<Upload size={15} />} loading={importing} disabled={!canManage} onClick={() => void importStarterFaqs()}>Import starter FAQs</AdminButton>
            </div>
          </div>
        </AdminCard>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
        <AdminCard className="overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-semibold text-slate-950">FAQ library</h2><p className="mt-1 text-sm text-slate-500">{items.length} managed entries</p></div>
              <AdminBadge tone="neutral">{items.filter((item) => item.status === "published").length} live</AdminBadge>
            </div>
            <label htmlFor="faq-search" className="sr-only">Search FAQ content</label>
            <input id="faq-search" value={search} onChange={(event) => setSearch(event.target.value)} className="input-field mt-4 w-full" placeholder="Search questions, answers or categories…" />
            <label htmlFor="faq-status-filter" className="sr-only">Filter by status</label>
            <select id="faq-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | FaqStatus)} className="input-field mt-2 w-full">
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {loading ? <div className="p-4"><AdminSkeleton rows={5} /></div> : visibleItems.length ? (
            <div className="divide-y divide-slate-100">
              {visibleItems.map((item) => (
                <article key={item.id} className={"p-4 " + (selectedId === item.id ? "bg-violet-50/60" : "")}>
                  <button type="button" onClick={() => editFaq(item)} className="w-full text-left">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-slate-900">{item.question}</span>
                      <AdminBadge tone={item.status === "published" ? "success" : item.status === "draft" ? "warning" : "neutral"}>{STATUS_LABELS[item.status]}</AdminBadge>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{categories.find((category) => category.value === item.category)?.label || item.category} · Order {item.displayOrder}</span>
                    {item.featured && <span className="mt-2 inline-block text-xs font-semibold text-violet-700">Featured</span>}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-4"><AdminEmptyState icon={<CircleHelp size={24} />} title="No matching FAQs" description={items.length ? "Try another search term or status filter." : "Create your first FAQ or import the existing starter answers."} /></div>
          )}
        </AdminCard>

        <AdminCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">{selected ? "FAQ editor" : "New FAQ"}</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">{selected?.question || "Create a frequently asked question"}</h2>
              <p className="mt-1 text-sm text-slate-500">Answers are plain text. Markup is displayed as text and is never executed.</p>
            </div>
            {selected?.status === "published" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><Eye size={14} /> Live on the public page</span>}
          </div>

          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void saveFaq(); }}>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="faq-question">Question
              <input id="faq-question" required minLength={8} maxLength={220} value={draft.question} onChange={(event) => updateDraft("question", event.target.value)} disabled={!canManage || saving} className="input-field mt-1 w-full" placeholder="Write the question learners are likely to ask." />
              <span className="mt-1 block text-xs font-normal text-slate-500">{draft.question.length}/220 characters</span>
            </label>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="faq-answer">Answer
              <textarea id="faq-answer" required minLength={10} maxLength={6000} rows={9} value={draft.answer} onChange={(event) => updateDraft("answer", event.target.value)} disabled={!canManage || saving} className="input-field mt-1 w-full leading-6" placeholder="Provide a clear, accurate answer. Use line breaks to separate steps." />
              <span className="mt-1 block text-xs font-normal text-slate-500">{draft.answer.length.toLocaleString()}/6,000 characters</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="faq-category">Category
                <select id="faq-category" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} disabled={!canManage || saving} className="input-field mt-1 w-full">
                  {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700" htmlFor="faq-order">Display order
                <input id="faq-order" type="number" min={0} max={10000} step={1} value={draft.displayOrder} onChange={(event) => updateDraft("displayOrder", event.target.value)} disabled={!canManage || saving} className="input-field mt-1 w-full" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Lower numbers appear first within a category.</span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={draft.featured} onChange={(event) => updateDraft("featured", event.target.checked)} disabled={!canManage || saving} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
              Feature this FAQ on the public page
            </label>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="faq-change-reason">Change reason <span className="font-normal text-slate-500">(required, 10–500 characters)</span>
              <textarea id="faq-change-reason" value={draft.reason} onChange={(event) => updateDraft("reason", event.target.value)} minLength={10} maxLength={500} rows={2} disabled={!canManage || saving || changingStatus} className="input-field mt-1 w-full" placeholder="Explain what changed and why." />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <AdminButton type="submit" variant="primary" icon={<Save size={16} />} loading={saving} disabled={!canManage || changingStatus}>Save {selected ? "changes" : "draft"}</AdminButton>
              {selected && <span className="text-xs text-slate-500">Created {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : "—"}</span>}
            </div>
          </form>

          {selected && canManage && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Publication status</h3>
              <p className="mt-1 text-sm text-slate-600">
                {selected.status === "published"
                  ? "This answer is visible to visitors. Saving edits updates the published answer immediately."
                  : selected.status === "archived"
                    ? "This entry is archived and hidden from the public FAQ page. You can restore it as a draft."
                    : "This entry is a draft and is not visible to visitors until published."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.status !== "published" && <AdminButton size="sm" variant="primary" icon={<CheckCircle2 size={14} />} loading={changingStatus} onClick={() => void changeStatus("published")}>Publish</AdminButton>}
                {selected.status !== "draft" && <AdminButton size="sm" variant="secondary" loading={changingStatus} onClick={() => void changeStatus("draft")}>Move to draft</AdminButton>}
                {selected.status !== "archived" && <AdminButton size="sm" variant="danger-ghost" icon={<Archive size={14} />} loading={changingStatus} onClick={() => void changeStatus("archived")}>Archive</AdminButton>}
              </div>
              {!draft.reason.trim() && <p className="mt-2 text-xs text-amber-800">Enter a change reason above before changing publication status.</p>}
            </div>
          )}
          {!canManage && !loading && <AdminAlert tone="warning" title="Read-only access">Your role can view FAQs but does not have permission to edit or publish them.</AdminAlert>}
        </AdminCard>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ClipboardList, RefreshCcw, Search } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { TypedConfirmDialog } from "@/components/admin/TypedConfirmDialog";

type Issue = {
  _id: string;
  category: string;
  description: string;
  status: "open" | "in_review" | "resolved" | "closed";
  adminNote?: string;
  assignedTo?: { _id?: string; id?: string; name?: string; email?: string } | string | null;
  internalNotes?: { _id?: string; note: string; reason: string; createdAt: string; author?: { name?: string; email?: string } | string }[];
  createdAt: string;
  user?: { name?: string; email?: string };
  payment?: { amount?: number; currency?: string; status?: string; course?: { title?: string }; plan?: { name?: string } };
};

type Assignee = { id: string; name: string; email: string; role: string };

const STATUS_LABELS: Record<Issue["status"], string> = {
  open: "Open", in_review: "In review", resolved: "Resolved", closed: "Closed",
};
const CATEGORY_LABELS: Record<string, string> = {
  benefit_not_received: "Benefit not received", payment_failed: "Payment failed",
  duplicate_charge: "Duplicate charge", incorrect_amount: "Incorrect amount",
  refund_help: "Refund assistance", other: "Other",
};
const statusTone = (status: Issue["status"]): "success" | "neutral" | "warning" | "info" => status === "resolved" ? "success" : status === "closed" ? "neutral" : status === "in_review" ? "warning" : "info";
const money = (amount = 0, currency = "INR") => {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount || 0)); }
  catch { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(amount || 0)); }
};
const assigneeId = (assignee: Issue["assignedTo"]) => typeof assignee === "string" ? assignee : assignee?._id || assignee?.id || "";

export default function AdminSupport() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [pendingFinalization, setPendingFinalization] = useState<{ issue: Issue; status: "resolved" | "closed"; assignment: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmReason, setConfirmReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filter) params.set("status", filter);
      if (search) params.set("q", search);

      // Case reading and case management have separate permissions. A denied assignee
      // request must not prevent a billing-read user from viewing the queue.
      const [casesResult, assigneeResult] = await Promise.allSettled([
        adminFetch("/api/admin/payment-issues?" + params.toString()),
        adminFetch("/api/admin/payment-issues/assignees"),
      ]);
      if (casesResult.status !== "fulfilled") throw casesResult.reason;
      const data = casesResult.value;
      const nextPages = Math.max(1, Number(data.pages || 1));
      setTotal(Number(data.total || 0));
      setPages(nextPages);
      const managementAvailable = assigneeResult.status === "fulfilled";
      setCanManage(managementAvailable);
      setAssignees(managementAvailable ? (assigneeResult.value.assignees || []) : []);

      if (page > nextPages) {
        setPage(nextPages);
        return;
      }

      setIssues(data.issues || []);
      setAssignments((current) => {
        const next = { ...current };
        for (const issue of data.issues || []) {
          if (next[issue._id] === undefined) next[issue._id] = assigneeId(issue.assignedTo);
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load support cases.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, limit, search]);

  useEffect(() => { void load(); }, [load]);

  async function update(issue: Issue, status: Issue["status"], assignment = assignments[issue._id] ?? assigneeId(issue.assignedTo), confirmed = false) {
    if (!canManage) {
      setError("Case-management permission could not be verified. Refresh the page or ask a platform administrator to review your access.");
      return;
    }
    const adminNote = (notes[issue._id] ?? issue.adminNote ?? "").trim();
    const internalNote = (internalNotes[issue._id] || "").trim();
    const reason = (reasons[issue._id] || "").trim();
    if (reason.length < 10 || reason.length > 500) {
      setError("Enter a reason between 10 and 500 characters before saving this case.");
      return;
    }
    if (status === "resolved" && !adminNote) {
      setError("Add a learner-facing resolution note before resolving this case.");
      return;
    }
    if (!confirmed && status !== issue.status && (status === "resolved" || status === "closed")) {
      setPendingFinalization({ issue, status, assignment });
      setConfirmText("");
      setConfirmReason("");
      setError("");
      return;
    }

    setSavingId(issue._id);
    setError("");
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/payment-issues/" + issue._id, {
        method: "PUT",
        body: JSON.stringify({ status, adminNote, assignedTo: assignment || null, internalNote, reason }),
      });
      const serverIssue = response.issue || {};
      const selectedAssignee = assignment ? assignees.find((person) => person.id === assignment) || { id: assignment } : null;
      const updatedIssue: Issue = {
        ...issue,
        ...serverIssue,
        user: issue.user,
        payment: issue.payment,
        assignedTo: selectedAssignee,
        internalNotes: serverIssue.internalNotes || issue.internalNotes,
      };
      setSelected((current) => current?._id === issue._id ? updatedIssue : current);
      setIssues((current) => current.map((item) => item._id === issue._id ? updatedIssue : item));
      setAssignments((current) => ({ ...current, [issue._id]: assignment || "" }));
      setNotes((current) => ({ ...current, [issue._id]: adminNote }));
      setInternalNotes((current) => ({ ...current, [issue._id]: "" }));
      setReasons((current) => ({ ...current, [issue._id]: "" }));
      setNotice("Support case updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update support case.");
    } finally {
      setSavingId(null);
    }
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader
      eyebrow="Learner support"
      title="Payment and access cases"
      description="Review the support queue at a glance, then open a case for assignments, internal notes and resolution actions."
      actions={<button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary"><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh</button>}
    />
    {error && !selected && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && !selected && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {!loading && !canManage && <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Read-only view. Case assignments, internal notes and status changes are unavailable because management access could not be verified.</p></div>}

    <section className="card p-4">
      <form className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); setSelected(null); }}>
        <label className="block text-sm font-medium text-slate-700">Case status
          <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); setSelected(null); }} className="input-field mt-1.5 w-full">
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="">All cases</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Search cases
          <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Learner name, email, payment category or description" className="w-full py-2.5 text-sm outline-none" /></span>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary"><Search className="h-4 w-4" /> Apply filters</button>
          <button type="button" className="btn-secondary" onClick={() => { setQuery(""); setSearch(""); setFilter(""); setPage(1); setSelected(null); }}>Clear</button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
        <span>{total.toLocaleString()} matching cases</span>
        <span>Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} · page {page} of {pages}</span>
      </div>
    </section>

    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div><h2 className="font-semibold text-slate-950">Support queue</h2><p className="mt-1 text-sm text-slate-500">Choose a case to inspect the payment context and update its workflow.</p></div>
        <div className="inline-flex items-center gap-2 text-xs text-slate-500"><ClipboardList className="h-4 w-4" /> {total.toLocaleString()} records</div>
      </div>
      {loading ? <div role="status" aria-live="polite" className="p-10 text-center text-sm text-slate-500">Loading support cases…</div> : issues.length === 0 ? (
        <div role="status" className="p-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold text-slate-900">No matching cases</p><p className="mt-1 text-sm text-slate-500">Try another status or search term.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-4">Case</th><th scope="col" className="p-4">Learner</th><th scope="col" className="p-4">Payment</th><th scope="col" className="p-4">Status</th><th scope="col" className="p-4">Assignee</th><th scope="col" className="p-4 text-right">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => {
                const assignedId = assigneeId(issue.assignedTo);
                const assignedName = !canManage
                  ? "Restricted"
                  : typeof issue.assignedTo === "object" && issue.assignedTo?.name
                    ? issue.assignedTo.name
                    : assignees.find((person) => person.id === (assignments[issue._id] || assignedId))?.name || "Unassigned";
                return <tr key={issue._id} className="align-top hover:bg-slate-50/70">
                  <td className="max-w-[320px] p-4"><p className="font-semibold text-slate-900">{CATEGORY_LABELS[issue.category] || issue.category}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{issue.description}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{issue._id}</p></td>
                  <td className="p-4"><p className="font-medium text-slate-800">{issue.user?.name || "Unknown learner"}</p><p className="mt-1 text-xs text-slate-500">{issue.user?.email || "No email"}</p><p className="mt-1 text-xs text-slate-400">{new Date(issue.createdAt).toLocaleString()}</p></td>
                  <td className="p-4"><p className="font-semibold text-slate-800">{money(issue.payment?.amount, issue.payment?.currency || "INR")}</p><p className="mt-1 text-xs text-slate-500">{issue.payment?.status || "Payment status unknown"}</p><p className="mt-1 max-w-[180px] truncate text-xs text-slate-500">{issue.payment?.course?.title || issue.payment?.plan?.name || "Product not specified"}</p></td>
                  <td className="p-4"><AdminBadge tone={statusTone(issue.status)}>{STATUS_LABELS[issue.status]}</AdminBadge></td>
                  <td className="p-4 text-sm text-slate-600">{assignedName}</td>
                  <td className="p-4 text-right"><button type="button" className="btn-secondary text-xs" onClick={() => { setSelected(issue); setError(""); setNotice(""); }} aria-label="Open support case details">Review case</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 px-3 py-2">
        <AdminPagination page={page} pages={pages} total={total} from={total ? (page - 1) * limit + 1 : 0} to={Math.min(page * limit, total)} limit={limit} loading={loading} onPageChange={(nextPage) => { setSelected(null); setPage(nextPage); }} onLimitChange={(nextLimit) => { setSelected(null); setLimit(nextLimit); setPage(1); }} />
      </div>
    </section>

    <DetailDrawer
      open={Boolean(selected)}
      title={selected ? (CATEGORY_LABELS[selected.category] || selected.category) : "Support case"}
      subtitle={selected ? [selected.user?.name || "Unknown learner", selected.user?.email || "No email", new Date(selected.createdAt).toLocaleString()].join(" · ") : undefined}
      onClose={() => setSelected(null)}
      wide
      footer={selected && canManage ? <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Status changes are audited and terminal states cannot be reopened.</p>
        <div className="flex flex-wrap gap-2">
          {selected.status !== "in_review" && selected.status !== "resolved" && selected.status !== "closed" && <button type="button" disabled={savingId === selected._id} onClick={() => void update(selected, "in_review")} className="btn-secondary">Mark in review</button>}
          {selected.status !== "resolved" && selected.status !== "closed" && <button type="button" disabled={savingId === selected._id} onClick={() => void update(selected, "resolved")} className="btn-primary">{savingId === selected._id ? "Saving…" : "Resolve case"}</button>}
          {selected.status !== "closed" && selected.status !== "resolved" && <button type="button" disabled={savingId === selected._id} onClick={() => void update(selected, "closed")} className="btn-secondary">Close case</button>}
        </div>
      </div> : undefined}
    >
      {selected && <div className="space-y-5">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        <section className="grid gap-3 sm:grid-cols-2" aria-label="Case status and payment details">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current status</p>
            <div className="mt-2"><AdminBadge tone={statusTone(selected.status)}>{STATUS_LABELS[selected.status]}</AdminBadge></div>
            <p className="mt-3 text-xs text-slate-500">Case ID</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{selected._id}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Transaction</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{money(selected.payment?.amount, selected.payment?.currency || "INR")}</p>
            <p className="mt-1 text-sm text-slate-600">{selected.payment?.status || "Payment status unknown"}</p>
            <p className="mt-1 text-sm text-slate-500">{selected.payment?.course?.title || selected.payment?.plan?.name || "Product not specified"}</p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Learner report</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.description || "No description was provided."}</p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900">Assignment</h3>
          <p className="mt-1 text-sm text-slate-500">Assign ownership so another administrator can follow up.</p>
          {canManage ? <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Assigned administrator
              <select value={assignments[selected._id] ?? assigneeId(selected.assignedTo)} onChange={(event) => setAssignments((current) => ({ ...current, [selected._id]: event.target.value }))} disabled={savingId === selected._id} className="input-field mt-1.5 w-full">
                <option value="">Unassigned</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void update(selected, selected.status)} disabled={savingId === selected._id} className="btn-secondary">{savingId === selected._id ? "Saving…" : "Save assignment"}</button>
          </div> : <p className="mt-2 text-sm text-slate-600">{typeof selected.assignedTo === "object" && selected.assignedTo?.name ? selected.assignedTo.name : "Assignment details are restricted."}</p>}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900">Internal notes</h3>
          <p className="mt-1 text-sm text-slate-500">Private notes are visible to administrators with case-management permission only.</p>
          {canManage && <>
            <div className="mt-3 space-y-2">
              {(selected.internalNotes || []).map((note, index) => <article key={note._id || index} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="whitespace-pre-wrap text-sm text-slate-700">{note.note}</p><p className="mt-2 text-xs text-slate-500">{typeof note.author === "object" ? note.author?.name || note.author?.email || "Administrator" : "Administrator"} · {new Date(note.createdAt).toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Reason: {note.reason}</p></article>)}
            </div>
            <label className="mt-3 block text-sm font-medium text-slate-700">Add internal note
              <textarea value={internalNotes[selected._id] || ""} onChange={(event) => setInternalNotes((current) => ({ ...current, [selected._id]: event.target.value }))} rows={3} maxLength={2000} placeholder="Private context for the support team; not sent to the learner." className="input-field mt-1.5 w-full" />
            </label>
            <button type="button" disabled={savingId === selected._id || !(internalNotes[selected._id] || "").trim()} onClick={() => void update(selected, selected.status)} className="btn-secondary mt-2">Add internal note</button>
          </>}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900">Learner-facing update</h3>
          <p className="mt-1 text-sm text-slate-500">This message can be sent to the learner when case status changes.</p>
          {canManage ? <>
            <textarea value={notes[selected._id] ?? selected.adminNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [selected._id]: event.target.value }))} rows={3} maxLength={2000} placeholder="Explain the next step or outcome in clear language." className="input-field mt-3 w-full" />
            <button type="button" disabled={savingId === selected._id} onClick={() => void update(selected, selected.status)} className="btn-secondary mt-2">Save message</button>
          </> : <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.adminNote || "No learner-facing update has been recorded."}</p>}
        </section>

        {canManage && <section>
          <label className="block text-sm font-semibold text-slate-800">Reason for this change (required)
            <textarea value={reasons[selected._id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [selected._id]: event.target.value }))} rows={2} minLength={10} maxLength={500} placeholder="Explain why this assignment, note, or status change is necessary." className="input-field mt-1.5 w-full" />
          </label>
          <p className="mt-1 text-xs text-slate-500">{(reasons[selected._id] || "").trim().length}/500 characters · minimum 10</p>
        </section>}
      </div>}
    </DetailDrawer>
    {pendingFinalization && <TypedConfirmDialog
      open
      title={pendingFinalization.status === "resolved" ? "Resolve support case" : "Close support case"}
      description={pendingFinalization.status === "resolved" ? "This marks the payment/access case as resolved." : "This closes the payment/access case."}
      consequence="This is a terminal state and the case cannot be reopened. Confirm that the learner-facing notes and internal case history are accurate before continuing."
      confirmLabel={pendingFinalization.status === "resolved" ? "Resolve case" : "Close case"}
      requiredText={pendingFinalization.issue._id}
      value={confirmText}
      onValueChange={setConfirmText}
      reason={confirmReason}
      onReasonChange={setConfirmReason}
      loading={savingId === pendingFinalization.issue._id}
      onClose={() => { if (savingId !== pendingFinalization.issue._id) setPendingFinalization(null); }}
      onConfirm={() => {
        if (!pendingFinalization) return;
        const { issue, status, assignment } = pendingFinalization;
        setReasons((current) => ({ ...current, [issue._id]: confirmReason.trim() }));
        setPendingFinalization(null);
        void update(issue, status, assignment, true);
      }}
    />}
  </div>;
}

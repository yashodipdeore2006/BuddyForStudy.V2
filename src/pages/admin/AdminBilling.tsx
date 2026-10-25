import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CreditCard, IndianRupee, RefreshCcw, Search, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminConfirmDialog, AdminPageHeader, AdminPagination, AdminTabs } from "@/components/admin/AdminUI";
import { DetailDrawer } from "@/components/admin/DetailDrawer";

type Person = { _id?: string; name?: string; email?: string };
type PaymentRecord = {
  _id: string;
  user?: Person;
  course?: { title?: string } | null;
  plan?: { name?: string } | null;
  amount?: number;
  currency?: string;
  provider?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  status: string;
  createdAt?: string;
};
type Refund = {
  _id: string;
  user?: Person;
  payment?: PaymentRecord | null;
  amount?: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "processed";
  adminNote?: string;
  decisionReason?: string;
  providerRefundId?: string;
  createdAt?: string;
  processedBy?: Person | null;
  sla?: { dueAt?: string; breached?: boolean; hoursRemaining?: number };
};
type PaymentIssue = {
  _id: string;
  user?: Person;
  payment?: PaymentRecord | null;
  category?: string;
  description?: string;
  status: "open" | "in_review" | "resolved" | "closed";
  adminNote?: string;
  createdAt?: string;
};
type BillingAction =
  | { kind: "refund"; item: Refund; status: "approved" | "rejected" }
  | { kind: "issue"; item: PaymentIssue; status: "in_review" | "resolved" | "closed" };
type DetailSelection =
  | { type: "payment"; item: PaymentRecord }
  | { type: "refund"; item: Refund }
  | { type: "issue"; item: PaymentIssue }
  | null;

function money(value: number | undefined, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0)); }
}
function EvidenceRow({ label, value }: { label: string; value: unknown }) {
  return <div className="grid gap-1 border-b border-slate-100 pb-3 sm:grid-cols-[180px_minmax(0,1fr)]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="break-words text-sm text-slate-800">{String(value ?? "—")}</p></div>;
}
function queryParams(page: number, limit: number, status: string, q: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status && status !== "all") params.set("status", status);
  if (q.trim()) params.set("q", q.trim().slice(0, 100));
  return params.toString();
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["paid", "processed", "resolved"].includes(status)) return "success";
  if (["pending", "approved", "in_review"].includes(status)) return "warning";
  if (["failed", "rejected", "closed", "refunded"].includes(status)) return "danger";
  return "neutral";
}
function StatusLabel({ status }: { status: string }) {
  const tone = statusTone(status);
  const cls = tone === "success" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-800" : tone === "danger" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize " + cls}>{String(status || "unknown").replace(/_/g, " ")}</span>;
}

export default function AdminBilling() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [refundSummary, setRefundSummary] = useState({ pending: 0, approved: 0, rejected: 0, processed: 0 });
  const [paymentSummary, setPaymentSummary] = useState({ totalPayments: 0, paidTotalsByCurrency: {} as Record<string, number> });
  const [refundFilter, setRefundFilter] = useState("pending");
  const [refundSearchInput, setRefundSearchInput] = useState("");
  const [refundSearch, setRefundSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentSearchInput, setPaymentSearchInput] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [issueFilter, setIssueFilter] = useState("open");
  const [issueSearchInput, setIssueSearchInput] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [refundPage, setRefundPage] = useState(1);
  const [refundLimit, setRefundLimit] = useState(25);
  const [refundPages, setRefundPages] = useState(1);
  const [refundTotal, setRefundTotal] = useState(0);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentLimit, setPaymentLimit] = useState(25);
  const [paymentPages, setPaymentPages] = useState(1);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [issuePage, setIssuePage] = useState(1);
  const [issueLimit, setIssueLimit] = useState(25);
  const [issuePages, setIssuePages] = useState(1);
  const [issueTotal, setIssueTotal] = useState(0);
  const [refundLoading, setRefundLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [issueLoading, setIssueLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionWarning, setPermissionWarning] = useState("");
  const [refundError, setRefundError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [issueError, setIssueError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actionConfirmText, setActionConfirmText] = useState("");
  const [pendingAction, setPendingAction] = useState<BillingAction | null>(null);
  const [detailDrawer, setDetailDrawer] = useState<DetailSelection>(null);
  const [reconcileItem, setReconcileItem] = useState<Refund | null>(null);
  const [providerRefundId, setProviderRefundId] = useState("");
  const [reconcileReason, setReconcileReason] = useState("");
  const [reconcileError, setReconcileError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState<"refunds" | "issues" | "payments">("refunds");
  const loading = refundLoading || paymentLoading || issueLoading;

  const loadRefunds = useCallback(async () => {
    setRefundLoading(true); setRefundError("");
    try {
      const params = queryParams(refundPage, refundLimit, refundFilter, refundSearch);
      const data = await adminFetch("/api/admin/refunds?" + params);
      const nextPages = Math.max(1, Number(data.pages || 1));
      setRefundTotal(Number(data.total || 0));
      setRefundPages(nextPages);
      setRefundSummary({ pending: Number(data.summary?.pending || 0), approved: Number(data.summary?.approved || 0), rejected: Number(data.summary?.rejected || 0), processed: Number(data.summary?.processed || 0) });
      if (refundPage > nextPages) { setRefundPage(nextPages); return; }
      setRefunds(data.refunds || []);
    } catch (e) { setRefundError(e instanceof Error ? e.message : "Unable to load refund requests."); }
    finally { setRefundLoading(false); }
  }, [refundPage, refundLimit, refundFilter, refundSearch]);

  const loadPayments = useCallback(async () => {
    setPaymentLoading(true); setPaymentError("");
    try {
      const params = queryParams(paymentPage, paymentLimit, paymentStatus, paymentSearch);
      const data = await adminFetch("/api/admin/payments?" + params);
      const nextPages = Math.max(1, Number(data.pages || 1));
      setPaymentTotal(Number(data.total || 0));
      setPaymentPages(nextPages);
      setPaymentSummary({
        totalPayments: Number(data.summary?.totalPayments || 0),
        paidTotalsByCurrency: data.summary?.paidTotalsByCurrency && typeof data.summary.paidTotalsByCurrency === "object"
          ? data.summary.paidTotalsByCurrency
          : { INR: Number(data.summary?.paidTotal || 0) }
      });
      if (paymentPage > nextPages) { setPaymentPage(nextPages); return; }
      setPayments(data.payments || []);
    } catch (e) { setPaymentError(e instanceof Error ? e.message : "Unable to load payment records."); }
    finally { setPaymentLoading(false); }
  }, [paymentPage, paymentLimit, paymentStatus, paymentSearch]);

  const loadIssues = useCallback(async () => {
    setIssueLoading(true); setIssueError("");
    try {
      const params = queryParams(issuePage, issueLimit, issueFilter, issueSearch);
      const data = await adminFetch("/api/admin/payment-issues?" + params);
      const nextPages = Math.max(1, Number(data.pages || 1));
      setIssueTotal(Number(data.total || 0));
      setIssuePages(nextPages);
      if (issuePage > nextPages) { setIssuePage(nextPages); return; }
      setIssues(data.issues || []);
    } catch (e) { setIssueError(e instanceof Error ? e.message : "Unable to load payment issues."); }
    finally { setIssueLoading(false); }
  }, [issuePage, issueLimit, issueFilter, issueSearch]);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/access");
      setPermissions(data.access?.permissions || []);
      setPermissionWarning("");
    } catch {
      setPermissions([]);
      setPermissionWarning("Permissions could not be verified. Finance and support mutations are disabled until access can be verified.");
    }
  }, []);

  const loadAll = useCallback(async () => {
    setNotice("");
    await Promise.all([loadRefunds(), loadPayments(), loadIssues(), loadPermissions()]);
  }, [loadRefunds, loadPayments, loadIssues, loadPermissions]);

  useEffect(() => { void loadRefunds(); }, [loadRefunds]);
  useEffect(() => { void loadPayments(); }, [loadPayments]);
  useEffect(() => { void loadIssues(); }, [loadIssues]);
  useEffect(() => { void loadPermissions(); }, [loadPermissions]);

  function openRefundAction(item: Refund, status: "approved" | "rejected") {
    setActionError("");
    setActionReason("");
    setActionNote(item.adminNote || "");
    setActionConfirmText("");
    setPendingAction({ kind: "refund", item, status });
    setDetailDrawer(null);
  }

  function openIssueAction(item: PaymentIssue, status: "in_review" | "resolved" | "closed") {
    setActionError("");
    setActionReason("");
    setActionNote(item.adminNote || "");
    setActionConfirmText("");
    setPendingAction({ kind: "issue", item, status });
    setDetailDrawer(null);
  }

  async function submitAction() {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setActionError("Enter a reason between 10 and 500 characters.");
      return;
    }
    if (pendingAction.kind === "issue" && pendingAction.status === "resolved" && !actionNote.trim()) {
      setActionError("Add a learner-facing resolution message before resolving this case.");
      return;
    }
    const id = pendingAction.kind === "refund" ? pendingAction.item._id : pendingAction.item._id;
    setActionId(id); setActionError("");
    try {
      if (pendingAction.kind === "refund") {
        await adminFetch("/api/admin/refunds/" + id, { method: "PUT", body: JSON.stringify({ status: pendingAction.status, adminNote: actionNote.trim(), reason }) });
        setNotice(pendingAction.status === "approved" ? "Refund decision submitted. Verify provider status before any reconciliation." : "Refund request rejected and audited.");
        await Promise.all([loadRefunds(), loadPayments()]);
      } else {
        await adminFetch("/api/admin/payment-issues/" + id, { method: "PUT", body: JSON.stringify({ status: pendingAction.status, adminNote: actionNote.trim(), reason }) });
        setNotice("Payment issue updated.");
        setDetailDrawer((current) => current?.type === "issue" && current.item._id === id ? { type: "issue", item: { ...current.item, status: pendingAction.status, adminNote: actionNote.trim() } } : current);
        await loadIssues();
      }
      setPendingAction(null);
      setActionReason(""); setActionNote(""); setActionConfirmText("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to submit this billing action.");
    } finally { setActionId(null); }
  }

  async function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reconcileItem) return;
    const id = String(providerRefundId || "").trim();
    const reason = reconcileReason.trim();
    if (!/^rfnd_[A-Za-z0-9]+$/.test(id)) { setReconcileError("Enter a valid Razorpay refund ID, for example rfnd_123abc."); return; }
    if (reason.length < 10 || reason.length > 500) { setReconcileError("Enter a reconciliation reason between 10 and 500 characters."); return; }
    setReconciling(true); setReconcileError("");
    try {
      await adminFetch("/api/admin/refunds/" + reconcileItem._id + "/reconcile", { method: "POST", body: JSON.stringify({ providerRefundId: id, reason }) });
      setNotice("Provider refund reference verified and reconciliation completed.");
      setReconcileItem(null); setProviderRefundId(""); setReconcileReason("");
      await Promise.all([loadRefunds(), loadPayments()]);
    } catch (e) {
      setReconcileError(e instanceof Error ? e.message : "Unable to reconcile provider refund.");
    } finally { setReconciling(false); }
  }

  const canManageRefunds = permissions.includes("refunds.manage");
  const canManageIssues = permissions.includes("payment_issues.manage");
  const typedConfirmation = pendingAction?.kind === "refund"
    ? pendingAction.status === "approved" ? "APPROVE REFUND" : "REJECT REFUND"
    : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Revenue operations"
        title="Billing and refunds"
        description="Review provider-backed payments, refund requests and payment issue reports. Finance actions require a recorded reason and explicit confirmation."
        actions={<button type="button" aria-label="Refresh billing data" className="btn-secondary" onClick={() => void loadAll()} disabled={loading}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh</button>}
      />
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {permissionWarning && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{permissionWarning}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5"><IndianRupee className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{Object.entries(paymentSummary.paidTotalsByCurrency).sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => money(amount, currency)).join(" · ") || money(0)}</p><p className="text-sm text-slate-500">Recorded paid value · grouped by currency</p></div>
        <div className="card p-5"><CreditCard className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{paymentSummary.totalPayments.toLocaleString()}</p><p className="text-sm text-slate-500">Payment records · all statuses</p></div>
        <div className="card p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-2xl font-bold">{refundSummary.processed.toLocaleString()}</p><p className="text-sm text-slate-500">Processed refunds · all records</p></div>
        <div className="card p-5"><XCircle className="h-5 w-5 text-amber-600" /><p className="mt-3 text-2xl font-bold">{refundSummary.pending.toLocaleString()}</p><p className="text-sm text-slate-500">Pending refund decisions</p></div>
      </div>
      <AdminTabs ariaLabel="Billing work areas" value={activeSection} onChange={setActiveSection} items={[
        { value: "refunds", label: `Refunds · ${refundSummary.pending} pending` },
        { value: "issues", label: "Payment issues" },
        { value: "payments", label: "Payment ledger" },
      ]} />

      {activeSection === "refunds" && <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-semibold text-slate-950">Refund queue</h2><p className="mt-1 text-sm text-slate-500">Review each request, SLA deadline and provider reconciliation state.</p></div>
          <form className="grid gap-2 sm:grid-cols-[180px_minmax(220px,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); setRefundSearch(refundSearchInput.trim()); setRefundPage(1); }}>
            <select aria-label="Filter refunds by status" className="input-field" value={refundFilter} onChange={(event) => { setRefundFilter(event.target.value); setRefundPage(1); }}><option value="pending">Pending</option><option value="approved">Approved / reconcile</option><option value="processed">Processed</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select>
            <input aria-label="Search refund requests" className="input-field" maxLength={100} value={refundSearchInput} onChange={(event) => setRefundSearchInput(event.target.value)} placeholder="Learner, reason, refund/provider ID" />
            <button type="submit" className="btn-primary"><Search className="h-4 w-4" /> Search</button>
            <button type="button" className="btn-secondary" onClick={() => { setRefundSearchInput(""); setRefundSearch(""); setRefundFilter("pending"); setRefundPage(1); }}>Reset</button>
          </form>
        </div>
        {refundError && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{refundError}</div>}
        {refundLoading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading refund queue…</div> : refunds.length === 0 ? <div role="status" className="p-10 text-center text-sm text-slate-500">No refund requests match this view.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-4">Learner / reason</th><th scope="col" className="p-4">Amount</th><th scope="col" className="p-4">Status / SLA</th><th scope="col" className="p-4">Submitted</th><th scope="col" className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{refunds.map((item) => <tr key={item._id} className="hover:bg-slate-50/70">
            <td className="max-w-[360px] p-4"><button type="button" className="text-left font-semibold text-slate-900 hover:text-blue-700" onClick={() => setDetailDrawer({ type: "refund", item })}>{item.user?.name || "Unknown learner"}</button><p className="mt-1 text-xs text-slate-500">{item.user?.email || "No email"}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.reason || "No reason provided."}</p></td>
            <td className="whitespace-nowrap p-4 font-semibold">{money(item.amount, item.payment?.currency || "INR")}</td>
            <td className="p-4"><StatusLabel status={item.status} /><p className={"mt-2 text-xs " + (item.sla?.breached ? "font-semibold text-red-700" : "text-slate-500")}>{item.sla?.breached ? "SLA breached" : item.sla?.hoursRemaining != null ? `${item.sla.hoursRemaining}h remaining` : "SLA tracking"}<span className="mt-1 block">{item.sla?.dueAt ? new Date(item.sla.dueAt).toLocaleString() : "Due time unavailable"}</span></p></td>
            <td className="whitespace-nowrap p-4 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
            <td className="p-4"><div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setDetailDrawer({ type: "refund", item })}>Details</button>
              {item.status === "pending" && canManageRefunds && <><button type="button" className="btn-secondary text-xs" disabled={actionId === item._id} onClick={() => openRefundAction(item, "approved")}>Approve & refund</button><button type="button" className="btn-danger text-xs" disabled={actionId === item._id} onClick={() => openRefundAction(item, "rejected")}>Reject</button></>}
              {item.status === "approved" && canManageRefunds && <button type="button" className="btn-secondary text-xs" disabled={actionId === item._id} onClick={() => { setReconcileError(""); setProviderRefundId(""); setReconcileReason(""); setReconcileItem(item); setDetailDrawer(null); }}>Reconcile</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
        <AdminPagination page={refundPage} pages={refundPages} total={refundTotal} from={refundTotal ? (refundPage - 1) * refundLimit + 1 : 0} to={Math.min(refundPage * refundLimit, refundTotal)} limit={refundLimit} loading={refundLoading} onPageChange={setRefundPage} onLimitChange={(next) => { setRefundLimit(next); setRefundPage(1); }} />
      </section>}

      {activeSection === "issues" && <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-semibold text-slate-950">Payment issue reports</h2><p className="mt-1 text-sm text-slate-500">Access, failed-payment and duplicate-charge reports.</p></div>
          <form className="grid gap-2 sm:grid-cols-[180px_minmax(220px,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); setIssueSearch(issueSearchInput.trim()); setIssuePage(1); }}>
            <select aria-label="Filter payment issues by status" className="input-field" value={issueFilter} onChange={(event) => { setIssueFilter(event.target.value); setIssuePage(1); }}><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All statuses</option></select>
            <input aria-label="Search payment issues" className="input-field" maxLength={100} value={issueSearchInput} onChange={(event) => setIssueSearchInput(event.target.value)} placeholder="Learner, category or issue description" />
            <button type="submit" className="btn-primary"><Search className="h-4 w-4" /> Search</button>
            <button type="button" className="btn-secondary" onClick={() => { setIssueSearchInput(""); setIssueSearch(""); setIssueFilter("open"); setIssuePage(1); }}>Reset</button>
          </form>
        </div>
        {issueError && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{issueError}</div>}
        {issueLoading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading payment issues…</div> : issues.length === 0 ? <div role="status" className="p-10 text-center text-sm text-slate-500">No payment issues match this view.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-4">Learner / issue</th><th scope="col" className="p-4">Related payment</th><th scope="col" className="p-4">Status</th><th scope="col" className="p-4">Reported</th><th scope="col" className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{issues.map((item) => <tr key={item._id} className="hover:bg-slate-50/70">
            <td className="max-w-[380px] p-4"><button type="button" className="text-left font-semibold text-slate-900 hover:text-blue-700" onClick={() => setDetailDrawer({ type: "issue", item })}>{item.user?.name || "Unknown learner"}</button><p className="mt-1 text-xs text-slate-500">{item.user?.email || "No email"}</p><p className="mt-2 text-xs font-semibold capitalize text-slate-700">{String(item.category || "other").replace(/_/g, " ")}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p></td>
            <td className="p-4"><p className="font-semibold">{money(item.payment?.amount || 0, item.payment?.currency || "INR")}</p><p className="mt-1 text-xs text-slate-500">{item.payment?.course?.title || item.payment?.plan?.name || "Product not specified"}</p><p className="mt-1 text-xs text-slate-400">{item.payment?.status || "Unknown payment status"}</p></td>
            <td className="p-4"><StatusLabel status={String(item.status || "open")} /></td>
            <td className="whitespace-nowrap p-4 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
            <td className="p-4"><div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setDetailDrawer({ type: "issue", item })}>Details</button>
              {canManageIssues && ["open", "in_review"].includes(item.status) && <button type="button" className="btn-secondary text-xs" disabled={actionId === item._id} onClick={() => openIssueAction(item, item.status === "open" ? "in_review" : "closed")}>{item.status === "open" ? "Review" : "Close"}</button>}
              {canManageIssues && item.status === "in_review" && <button type="button" className="btn-primary text-xs" disabled={actionId === item._id} onClick={() => openIssueAction(item, "resolved")}>Resolve</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
        <AdminPagination page={issuePage} pages={issuePages} total={issueTotal} from={issueTotal ? (issuePage - 1) * issueLimit + 1 : 0} to={Math.min(issuePage * issueLimit, issueTotal)} limit={issueLimit} loading={issueLoading} onPageChange={setIssuePage} onLimitChange={(next) => { setIssueLimit(next); setIssuePage(1); }} />
      </section>}

      {activeSection === "payments" && <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-semibold text-slate-950">Payment ledger</h2><p className="mt-1 text-sm text-slate-500">{paymentTotal.toLocaleString()} records match the current ledger filters.</p></div>
          <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_auto_auto]" onSubmit={(event) => { event.preventDefault(); setPaymentSearch(paymentSearchInput.trim()); setPaymentPage(1); }}>
            <input aria-label="Search payments" className="input-field" maxLength={100} placeholder="Learner, course, plan, provider reference" value={paymentSearchInput} onChange={(event) => setPaymentSearchInput(event.target.value)} />
            <select aria-label="Filter payments by status" className="input-field" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPaymentPage(1); }}><option value="">All statuses</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="created">Created</option><option value="refunded">Refunded</option><option value="partially_refunded">Partially refunded</option><option value="cancelled">Cancelled</option></select>
            <button type="submit" className="btn-primary"><Search className="h-4 w-4" /> Search</button>
            <button type="button" className="btn-secondary" onClick={() => { setPaymentSearchInput(""); setPaymentSearch(""); setPaymentStatus(""); setPaymentPage(1); }}>Reset</button>
          </form>
        </div>
        {paymentError && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{paymentError}</div>}
        {paymentLoading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading payment ledger…</div> : payments.length === 0 ? <div role="status" className="p-10 text-center text-sm text-slate-500">No payment records match these filters.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-4">Learner</th><th scope="col" className="p-4">Product</th><th scope="col" className="p-4">Amount</th><th scope="col" className="p-4">Provider</th><th scope="col" className="p-4">Status</th><th scope="col" className="p-4 text-right">Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{payments.map((item) => <tr key={item._id} className="hover:bg-slate-50/70">
            <td className="p-4"><p className="font-semibold">{item.user?.name || "Unknown learner"}</p><p className="mt-1 text-xs text-slate-500">{item.user?.email || "No email"}</p></td>
            <td className="p-4 text-xs text-slate-600">{item.course?.title || item.plan?.name || "—"}</td>
            <td className="p-4 whitespace-nowrap font-semibold">{money(item.amount, item.currency || "INR")}</td>
            <td className="p-4 capitalize text-slate-600">{item.provider || "—"}</td>
            <td className="p-4"><StatusLabel status={String(item.status || "unknown")} /></td>
            <td className="p-4 text-right"><button type="button" className="btn-secondary text-xs" onClick={() => setDetailDrawer({ type: "payment", item })}>Open details</button></td>
          </tr>)}</tbody>
        </table></div>}
        <AdminPagination page={paymentPage} pages={paymentPages} total={paymentTotal} from={paymentTotal ? (paymentPage - 1) * paymentLimit + 1 : 0} to={Math.min(paymentPage * paymentLimit, paymentTotal)} limit={paymentLimit} loading={paymentLoading} onPageChange={setPaymentPage} onLimitChange={(next) => { setPaymentLimit(next); setPaymentPage(1); }} />
      </section>}

      <DetailDrawer
        open={Boolean(detailDrawer)}
        title={detailDrawer?.type === "payment" ? "Payment details" : detailDrawer?.type === "refund" ? "Refund evidence" : "Payment issue details"}
        subtitle={detailDrawer ? [detailDrawer.item.user?.name || "Unknown learner", detailDrawer.item.user?.email || "", detailDrawer.item.createdAt ? new Date(detailDrawer.item.createdAt).toLocaleString() : ""].filter(Boolean).join(" · ") : undefined}
        onClose={() => setDetailDrawer(null)}
        wide
      >
        {detailDrawer && (detailDrawer.type === "payment" ? <div className="space-y-4">
          <EvidenceRow label="Payment ID" value={detailDrawer.item._id} />
          <EvidenceRow label="Product" value={detailDrawer.item.course?.title || detailDrawer.item.plan?.name || "—"} />
          <EvidenceRow label="Amount / currency" value={money(detailDrawer.item.amount, detailDrawer.item.currency || "INR")} />
          <EvidenceRow label="Provider status" value={detailDrawer.item.status} />
          <EvidenceRow label="Provider" value={detailDrawer.item.provider || "—"} />
          <EvidenceRow label="Provider payment ID" value={detailDrawer.item.providerPaymentId || "—"} />
          <EvidenceRow label="Provider order ID" value={detailDrawer.item.providerOrderId || "—"} />
          <EvidenceRow label="Created" value={detailDrawer.item.createdAt ? new Date(detailDrawer.item.createdAt).toLocaleString() : "—"} />
          <p className="text-xs text-slate-500">Payment status is provider-derived. Reconcile through the verified billing workflow rather than editing ledger records directly.</p>
        </div> : detailDrawer.type === "refund" ? <div className="space-y-4">
          <EvidenceRow label="Refund request ID" value={detailDrawer.item._id} />
          <EvidenceRow label="Requested amount" value={money(detailDrawer.item.amount, detailDrawer.item.payment?.currency || "INR")} />
          <EvidenceRow label="Request status" value={detailDrawer.item.status} />
          <EvidenceRow label="Learner reason" value={detailDrawer.item.reason || "No reason provided"} />
          <EvidenceRow label="Decision reason" value={detailDrawer.item.decisionReason || "Not yet decided"} />
          <EvidenceRow label="SLA deadline" value={detailDrawer.item.sla?.dueAt ? new Date(detailDrawer.item.sla.dueAt).toLocaleString() : "Due time unavailable"} />
          <EvidenceRow label="Payment status" value={detailDrawer.item.payment?.status || "Unknown"} />
          <EvidenceRow label="Provider payment ID" value={detailDrawer.item.payment?.providerPaymentId || "—"} />
          <EvidenceRow label="Provider refund ID" value={detailDrawer.item.providerRefundId || "Not yet recorded"} />
          <EvidenceRow label="Submitted" value={detailDrawer.item.createdAt ? new Date(detailDrawer.item.createdAt).toLocaleString() : "—"} />
          <EvidenceRow label="Processed by" value={detailDrawer.item.processedBy?.name || "—"} />
          {detailDrawer.item.adminNote && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Finance note</p><p className="mt-1 whitespace-pre-wrap">{detailDrawer.item.adminNote}</p></div>}
        </div> : <div className="space-y-4">
          <EvidenceRow label="Issue ID" value={detailDrawer.item._id} />
          <EvidenceRow label="Issue category" value={String(detailDrawer.item.category || "other").replace(/_/g, " ")} />
          <EvidenceRow label="Status" value={String(detailDrawer.item.status || "open").replace(/_/g, " ")} />
          <EvidenceRow label="Related payment" value={detailDrawer.item.payment?.providerPaymentId || detailDrawer.item.payment?._id || "—"} />
          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Learner report</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detailDrawer.item.description || "No issue description recorded."}</p></section>
          {detailDrawer.item.adminNote && <section className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">Learner-facing update</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detailDrawer.item.adminNote}</p></section>}
          {canManageIssues && ["open", "in_review"].includes(detailDrawer.item.status) && <div className="flex flex-wrap gap-2">{detailDrawer.item.status === "open" && <button type="button" className="btn-secondary" onClick={() => openIssueAction(detailDrawer.item, "in_review")}>Mark in review</button>}{<button type="button" className="btn-primary" onClick={() => openIssueAction(detailDrawer.item, "resolved")}>Resolve case</button>}<button type="button" className="btn-secondary" onClick={() => openIssueAction(detailDrawer.item, "closed")}>Close case</button></div>}
        </div>)}
      </DetailDrawer>

      <DetailDrawer
        open={Boolean(reconcileItem)}
        title="Reconcile provider refund"
        subtitle={reconcileItem ? `Request ${reconcileItem._id} · ${money(reconcileItem.amount, reconcileItem.payment?.currency || "INR")}` : undefined}
        onClose={() => { if (!reconciling) { setReconcileItem(null); setProviderRefundId(""); setReconcileReason(""); setReconcileError(""); } }}
        footer={<div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" disabled={reconciling} onClick={() => { setReconcileItem(null); setProviderRefundId(""); setReconcileReason(""); setReconcileError(""); }}>Cancel</button><button type="submit" form="billing-reconcile-form" className="btn-primary" disabled={reconciling || !providerRefundId.trim() || reconcileReason.trim().length < 10}>{reconciling ? "Verifying provider…" : "Verify and reconcile"}</button></div>}
        wide
      >
        <form id="billing-reconcile-form" onSubmit={(event) => void submitReconciliation(event)} className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Enter the refund reference from the provider dashboard. The server verifies that the provider refund matches this payment, amount and currency before changing local state.</p>
          {reconcileError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{reconcileError}</p>}
          <label className="block text-sm font-semibold text-slate-800">Razorpay refund ID
            <input className="input-field mt-1.5 w-full" value={providerRefundId} maxLength={100} onChange={(event) => setProviderRefundId(event.target.value.trim())} placeholder="rfnd_..." pattern="rfnd_[A-Za-z0-9]+" required />
          </label>
          <label className="block text-sm font-semibold text-slate-800">Reconciliation reason (required)
            <textarea className="input-field mt-1.5 w-full" value={reconcileReason} minLength={10} maxLength={500} onChange={(event) => setReconcileReason(event.target.value)} placeholder="Why is manual provider reconciliation required?" required rows={4} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{reconcileReason.trim().length}/500 characters · minimum 10</span>
          </label>
        </form>
      </DetailDrawer>

      <AdminConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.kind === "refund" ? (pendingAction.status === "approved" ? "Approve and process refund" : "Reject refund request") : pendingAction?.status === "resolved" ? "Resolve payment issue" : pendingAction?.status === "closed" ? "Close payment issue" : "Move payment issue to review"}
        description={pendingAction?.kind === "refund"
          ? (pendingAction.status === "approved" ? "This calls the configured payment provider. Verify the amount and payment context before approving; uncertain provider outcomes require reconciliation." : "This is a terminal finance decision. The request cannot be reopened.")
          : "This change is audited. Resolved or closed cases are final and cannot be reopened."}
        confirmLabel={pendingAction?.kind === "refund" && pendingAction.status === "approved" ? "Approve & refund" : pendingAction?.kind === "refund" ? "Reject refund" : "Confirm update"}
        requiredText={typedConfirmation}
        value={actionConfirmText}
        onValueChange={setActionConfirmText}
        reason={actionReason}
        onReasonChange={setActionReason}
        requireReason
        note={actionNote}
        onNoteChange={setActionNote}
        noteLabel="Learner-facing note"
        notePlaceholder="Explain the decision or next step in clear language."
        error={actionError}
        loading={Boolean(pendingAction && actionId === pendingAction.item._id)}
        danger={pendingAction?.kind === "refund" && pendingAction.status === "rejected"}
        onClose={() => { if (!actionId) { setPendingAction(null); setActionError(""); setActionReason(""); setActionNote(""); setActionConfirmText(""); } }}
        onConfirm={() => void submitAction()}
      />
    </div>
  );
}

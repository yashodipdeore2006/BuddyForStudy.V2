import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, IndianRupee, RefreshCcw, Search, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader } from "@/components/admin/AdminUI";

function money(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}
function EvidenceRow({ label, value }: { label: string; value: unknown }) {
  return <div className="grid gap-1 border-b border-slate-100 pb-3 sm:grid-cols-[180px_minmax(0,1fr)]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="break-words text-sm text-slate-800">{String(value ?? "—")}</p></div>;
}

export default function AdminBilling() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [issueFilter, setIssueFilter] = useState("open");
  const [refundFilter, setRefundFilter] = useState("pending");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [detailDrawer, setDetailDrawer] = useState<{ type: "payment" | "refund"; item: any } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [refundData, paymentData, issueData, accessData] = await Promise.all([
        adminFetch("/api/admin/refunds"),
        adminFetch("/api/admin/payments?limit=200"),
        adminFetch("/api/admin/payment-issues?limit=200"),
        adminFetch("/api/admin/access"),
      ]);
      setRefunds(refundData.refunds || []);
      setPayments(paymentData.payments || []);
      setIssues(issueData.issues || []);
      setPermissions(accessData.access?.permissions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load billing data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, status: string) {
    const reason = window.prompt("Finance decision reason (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required for every finance decision.");
      return;
    }
    const note = window.prompt("Optional note for the learner:", reason) || "";

    setActionId(id);
    setError("");
    try {
      await adminFetch("/api/admin/refunds/" + id, {
        method: "PUT",
        body: JSON.stringify({ status, adminNote: note, reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update refund");
    } finally {
      setActionId(null);
    }
  }

  async function reconcileRefund(id: string) {
    const providerRefundId = window.prompt(
      "Enter the Razorpay refund ID from the provider dashboard. Verify it belongs to this payment before continuing."
    )?.trim();
    if (!providerRefundId) return;
    const reason = window.prompt("Reason for provider reconciliation (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required for reconciliation.");
      return;
    }

    setActionId(id);
    setError("");
    try {
      await adminFetch("/api/admin/refunds/" + id + "/reconcile", {
        method: "POST",
        body: JSON.stringify({ providerRefundId, reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reconcile provider refund");
    } finally {
      setActionId(null);
    }
  }

  async function updateIssue(issue: any, status: string) {
    const note = window.prompt("Support update for the user (optional)", issue.adminNote || "") || "";
    const reason = window.prompt("Reason for this support action (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required for support actions.");
      return;
    }
    setActionId(issue._id);
    setError("");
    try {
      await adminFetch("/api/admin/payment-issues/" + issue._id, { method: "PUT", body: JSON.stringify({ status, adminNote: note, reason }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update payment issue");
    } finally { setActionId(null); }
  }

  const filteredRefunds = useMemo(
    () => refunds.filter((item) => refundFilter === "all" || item.status === refundFilter),
    [refunds, refundFilter]
  );

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    return payments.filter((item) => {
      const matchesStatus = !paymentStatus || item.status === paymentStatus;
      const text = [
        item.user?.name,
        item.user?.email,
        item.provider,
        item.providerPaymentId,
        item.providerOrderId,
        item.course?.title,
        item.plan?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!q || text.includes(q));
    });
  }, [payments, paymentSearch, paymentStatus]);

  const paidTotal = payments
    .filter((item) => item.status === "paid" || item.status === "partially_refunded")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Revenue operations"
        title="Billing and refunds"
        description="Review payments, refund requests and payment-provider references without leaving the admin panel."
        actions={<button type="button" aria-label="Refresh billing data" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>}
      />

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5"><IndianRupee className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{money(paidTotal)}</p><p className="text-sm text-slate-500">Recorded paid value</p></div>
        <div className="card p-5"><CreditCard className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{payments.length}</p><p className="text-sm text-slate-500">Recent payment records</p></div>
        <div className="card p-5"><CheckCircle2 className="h-5 w-5 text-green-600" /><p className="mt-3 text-2xl font-bold">{refunds.filter((r) => r.status === "processed").length}</p><p className="text-sm text-slate-500">Processed refunds</p></div>
        <div className="card p-5"><XCircle className="h-5 w-5 text-amber-600" /><p className="mt-3 text-2xl font-bold">{refunds.filter((r) => r.status === "pending").length}</p><p className="text-sm text-slate-500">Pending refunds</p></div>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-slate-900">Refund queue</h2><p className="mt-1 text-xs text-slate-500">Every decision is recorded in the audit log.</p></div>
          <select aria-label="Filter refunds by status" className="input-field w-auto" value={refundFilter} onChange={(e) => setRefundFilter(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
            <option value="all">All statuses</option>
          </select>
        </div>
        {loading ? <div role="status" aria-live="polite" aria-label="Loading billing data" className="p-10 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /><span className="sr-only">Loading billing data</span></div> : (
          <div className="divide-y divide-slate-100">
            {!filteredRefunds.length && <p className="p-8 text-center text-sm text-slate-500">No refund requests match this filter.</p>}
            {filteredRefunds.map((item) => (
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center" key={item._id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.user?.name || "Unknown user"}</p><span className="badge bg-slate-100 text-slate-600">{item.status}</span></div>
                  <p className="text-sm text-slate-500">{item.user?.email}</p>
                  <p className="mt-2 text-sm text-slate-700">{item.reason || "No reason provided."}</p>{item.adminNote && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{item.adminNote}</p>}
                  <p className="mt-2 text-xs text-slate-400">{money(item.amount)} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</p><p className={"mt-2 text-xs font-semibold " + (item.sla?.breached ? "text-red-700" : "text-slate-500")}>SLA due {item.sla?.dueAt ? new Date(item.sla.dueAt).toLocaleString() : "24h from request"} · {item.sla?.breached ? "BREACHED" : item.sla?.hoursRemaining != null ? item.sla.hoursRemaining + "h remaining" : "tracking"}</p><button type="button" className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setDetailDrawer({ type: "refund", item })}>Evidence & details</button>
                </div>
                {item.status === "pending" && permissions.includes("refunds.manage") && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn-secondary" disabled={actionId === item._id} onClick={() => void act(item._id, "approved")}>
                      {actionId === item._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve & refund
                    </button>
                    <button type="button" className="btn-danger" disabled={actionId === item._id} onClick={() => void act(item._id, "rejected")}>
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </div>
                )}
                {item.status === "approved" && permissions.includes("refunds.manage") && (
                  <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                    <p className="max-w-xs text-xs text-amber-800">Provider response needs reconciliation. Do not retry the refund until the provider status is verified.</p>
                    <button type="button" className="btn-secondary" disabled={actionId === item._id} onClick={() => void reconcileRefund(item._id)}>
                      {actionId === item._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Reconcile provider refund
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Payment issue reports</h2><p className="mt-1 text-xs text-slate-500">Review failed payments and successful payments where the learner did not receive course or plan benefits.</p></div><select aria-label="Filter payment issues" className="input-field w-auto" value={issueFilter} onChange={(e) => setIssueFilter(e.target.value)}><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All statuses</option></select></div>
        <div className="divide-y divide-slate-100">
          {issues.filter((issue) => issueFilter === "all" || issue.status === issueFilter).map((issue) => <article key={issue._id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{issue.user?.name || "Unknown user"}</p><span className="badge bg-slate-100 text-slate-600">{String(issue.status || "open").replace(/_/g, " ")}</span></div><p className="text-xs text-slate-500">{issue.user?.email || "No email"} · {issue.payment?.course?.title || issue.payment?.plan?.name || "Payment"} · {money(issue.payment?.amount || 0)} · {issue.payment?.status || "unknown payment status"}</p><p className="mt-2 text-sm font-semibold text-violet-700">{String(issue.category || "other").replace(/_/g, " ")}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{issue.description}</p>{issue.adminNote && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Last support note: {issue.adminNote}</p>}<p className="mt-2 text-xs text-slate-400">Reported {issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "—"}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2">{permissions.includes("payment_issues.manage") && <>{issue.status !== "in_review" && issue.status !== "resolved" && issue.status !== "closed" && <button type="button" className="btn-secondary" disabled={actionId === issue._id} onClick={() => void updateIssue(issue, "in_review")}>Mark in review</button>}{issue.status !== "resolved" && <button type="button" className="btn-secondary" disabled={actionId === issue._id} onClick={() => void updateIssue(issue, "resolved")}>{actionId === issue._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Resolve</button>}{["open", "in_review"].includes(issue.status) && <button type="button" className="btn-secondary" disabled={actionId === issue._id} onClick={() => void updateIssue(issue, "closed")}>Close</button>}</>}</div>
          </article>)}
          {!issues.some((issue) => issueFilter === "all" || issue.status === issueFilter) && <p className="p-8 text-center text-sm text-slate-500">No payment issues match this filter.</p>}
        </div>
      </section>
      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="font-bold text-slate-900">Payment ledger</h2><p className="mt-1 text-xs text-slate-500">Search by user, course, plan or provider reference.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search payments" className="input-field pl-10" placeholder="Search payments" value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} /></div>
              <select aria-label="Filter payments by status" className="input-field w-auto" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="created">Created</option>
                <option value="refunded">Refunded</option>
                <option value="partially_refunded">Partially refunded</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">User</th><th className="p-4">Product</th><th className="p-4">Amount</th><th className="p-4">Provider</th><th className="p-4">Status</th><th className="p-4">Reference</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.map((item) => (
                <tr key={item._id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setDetailDrawer({ type: "payment", item })}>
                  <td className="p-4"><p className="font-semibold">{item.user?.name || "Unknown"}</p><p className="text-xs text-slate-500">{item.user?.email}</p></td>
                  <td className="p-4 text-xs text-slate-600">{item.course?.title || item.plan?.name || "—"}</td>
                  <td className="p-4 font-bold">{money(item.amount)}</td>
                  <td className="p-4 capitalize text-slate-600">{item.provider}</td>
                  <td className="p-4"><span className="badge bg-slate-100 text-slate-600">{item.status}</span></td>
                  <td className="max-w-xs truncate p-4 font-mono text-[11px] text-slate-500">{item.providerPaymentId || item.providerOrderId || "—"}<span className="mt-1 block font-sans text-xs font-semibold text-blue-600">Open details</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredPayments.length && <p className="p-8 text-center text-sm text-slate-500">No payment records match the filters.</p>}
        </div>
      </section>
    </div>
      {detailDrawer && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailDrawer(null); }}>
          <aside role="dialog" aria-modal="true" aria-label={detailDrawer.type === "payment" ? "Payment details" : "Refund evidence"} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{detailDrawer.type === "payment" ? "Payment ledger" : "Finance decision evidence"}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{detailDrawer.type === "payment" ? "Payment details" : "Refund request details"}</h2></div><button type="button" className="btn-secondary" onClick={() => setDetailDrawer(null)}>Close</button></div>
            {detailDrawer.type === "payment" ? <div className="mt-5 space-y-4">
              <EvidenceRow label="Payment ID" value={detailDrawer.item._id} />
              <EvidenceRow label="User" value={detailDrawer.item.user?.name + " · " + (detailDrawer.item.user?.email || "")} />
              <EvidenceRow label="Product" value={detailDrawer.item.course?.title || detailDrawer.item.plan?.name || "—"} />
              <EvidenceRow label="Amount" value={money(detailDrawer.item.amount) + " " + (detailDrawer.item.currency || "INR")} />
              <EvidenceRow label="Status (provider-derived)" value={detailDrawer.item.status} />
              <EvidenceRow label="Provider" value={detailDrawer.item.provider || "—"} />
              <EvidenceRow label="Provider payment ID" value={detailDrawer.item.providerPaymentId || "—"} />
              <EvidenceRow label="Provider order ID" value={detailDrawer.item.providerOrderId || "—"} />
              <EvidenceRow label="Created" value={detailDrawer.item.createdAt ? new Date(detailDrawer.item.createdAt).toLocaleString() : "—"} />
              <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Linked refund requests</h3>{refunds.filter((refund) => String(refund.payment?._id || refund.payment) === String(detailDrawer.item._id)).map((refund) => <div key={refund._id} className="mt-3 border-t border-slate-100 pt-3"><p className="font-semibold">{money(refund.amount)} · {refund.status}</p><p className="mt-1 text-sm text-slate-600">{refund.reason || "No learner reason"}</p><p className="mt-1 text-xs text-slate-500">SLA: {refund.sla?.dueAt ? new Date(refund.sla.dueAt).toLocaleString() : "24h from request"}</p></div>)}{!refunds.some((refund) => String(refund.payment?._id || refund.payment) === String(detailDrawer.item._id)) && <p className="mt-2 text-sm text-slate-500">No refund requests linked to this payment.</p>}</div>
            </div> : <div className="mt-5 space-y-4">
              <EvidenceRow label="Refund request ID" value={detailDrawer.item._id} />
              <EvidenceRow label="Learner" value={detailDrawer.item.user?.name + " · " + (detailDrawer.item.user?.email || "")} />
              <EvidenceRow label="Requested amount" value={money(detailDrawer.item.amount) + " " + (detailDrawer.item.payment?.currency || "INR")} />
              <EvidenceRow label="Request status" value={detailDrawer.item.status} />
              <EvidenceRow label="Learner reason" value={detailDrawer.item.reason || "No reason provided"} />
              <EvidenceRow label="Decision reason" value={detailDrawer.item.decisionReason || "Not yet decided"} />
              <EvidenceRow label="SLA deadline" value={detailDrawer.item.sla?.dueAt ? new Date(detailDrawer.item.sla.dueAt).toLocaleString() : "24h from request"} />
              <EvidenceRow label="Payment status" value={detailDrawer.item.payment?.status || "Unknown"} />
              <EvidenceRow label="Provider" value={detailDrawer.item.payment?.provider || "—"} />
              <EvidenceRow label="Provider payment ID" value={detailDrawer.item.payment?.providerPaymentId || "—"} />
              <EvidenceRow label="Provider order ID" value={detailDrawer.item.payment?.providerOrderId || "—"} />
              <EvidenceRow label="Provider refund ID" value={detailDrawer.item.providerRefundId || "Not yet recorded"} />
              <EvidenceRow label="Submitted" value={detailDrawer.item.createdAt ? new Date(detailDrawer.item.createdAt).toLocaleString() : "—"} />
              <EvidenceRow label="Processed by" value={detailDrawer.item.processedBy?.name || "—"} />
              {detailDrawer.item.adminNote && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Finance note</p><p className="mt-1 whitespace-pre-wrap">{detailDrawer.item.adminNote}</p></div>}
            </div>}
          </aside>
        </div>
      )}
  );
}

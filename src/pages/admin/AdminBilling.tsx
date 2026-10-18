import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, IndianRupee, RefreshCcw, Search, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader } from "@/components/admin/AdminUI";

function money(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
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
    const note = window.prompt("Admin note / reason") || "";
    if (status === "rejected" && !note.trim()) {
      setError("Add a reason before rejecting a refund.");
      return;
    }

    setActionId(id);
    setError("");
    try {
      await adminFetch("/api/admin/refunds/" + id, {
        method: "PUT",
        body: JSON.stringify({ status, adminNote: note }),
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

    setActionId(id);
    setError("");
    try {
      await adminFetch("/api/admin/refunds/" + id + "/reconcile", {
        method: "POST",
        body: JSON.stringify({ providerRefundId }),
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
    setActionId(issue._id);
    setError("");
    try {
      await adminFetch("/api/admin/payment-issues/" + issue._id, { method: "PUT", body: JSON.stringify({ status, adminNote: note }) });
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
                  <p className="mt-2 text-xs text-slate-400">{money(item.amount)} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</p>
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
                <tr key={item._id} className="hover:bg-slate-50/70">
                  <td className="p-4"><p className="font-semibold">{item.user?.name || "Unknown"}</p><p className="text-xs text-slate-500">{item.user?.email}</p></td>
                  <td className="p-4 text-xs text-slate-600">{item.course?.title || item.plan?.name || "—"}</td>
                  <td className="p-4 font-bold">{money(item.amount)}</td>
                  <td className="p-4 capitalize text-slate-600">{item.provider}</td>
                  <td className="p-4"><span className="badge bg-slate-100 text-slate-600">{item.status}</span></td>
                  <td className="max-w-xs truncate p-4 font-mono text-[11px] text-slate-500">{item.providerPaymentId || item.providerOrderId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredPayments.length && <p className="p-8 text-center text-sm text-slate-500">No payment records match the filters.</p>}
        </div>
      </section>
    </div>
  );
}

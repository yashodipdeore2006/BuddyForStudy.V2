import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { ArrowDownToLine, CreditCard, ReceiptText, Search, CalendarDays, ShieldCheck, Loader2, CheckCircle2, Clock3, XCircle, AlertCircle, ArrowUpRight, MessageSquareWarning } from "lucide-react";

type RefundRequest = {
  _id: string;
  amount: number;
  status: string;
  reason?: string;
  createdAt: string;
  processedAt?: string | null;
  adminNote?: string;
  payment?: { _id?: string; amount?: number; currency?: string; course?: { title?: string }; plan?: { name?: string } } | null;
};

type PaymentIssue = {
  _id: string; category: string; description: string; status: string; adminNote?: string; createdAt: string;
  payment?: { _id?: string; amount?: number; currency?: string; course?: { title?: string }; plan?: { name?: string } } | null;
};

type Payment = {
  _id: string;
  amount: number;
  currency?: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  provider?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  course?: { title?: string } | null;
  plan?: { name?: string; billingInterval?: string } | null;
};

function money(amount: number, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
  catch { return currency + " " + amount.toFixed(2); }
}
function date(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function statusClass(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    refunded: "bg-slate-100 text-slate-700 ring-slate-500/15",
    partially_refunded: "bg-amber-50 text-amber-700 ring-amber-600/15",
    failed: "bg-rose-50 text-rose-700 ring-rose-600/15",
    pending: "bg-blue-50 text-blue-700 ring-blue-600/15",
    created: "bg-blue-50 text-blue-700 ring-blue-600/15",
    cancelled: "bg-slate-100 text-slate-600 ring-slate-500/15",
  };
  return styles[status] || "bg-slate-100 text-slate-700 ring-slate-500/15";
}

export default function Billing() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundMessage, setRefundMessage] = useState("");
  const [issueId, setIssueId] = useState<string | null>(null);
  const [issueCategory, setIssueCategory] = useState("benefit_not_received");
  const [issueDescription, setIssueDescription] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadBilling() {
    setLoading(true);
    try {
      const [paymentData, subscriptionData, refundData, issueData] = await Promise.all([apiFetch("/api/billing/payments"), apiFetch("/api/billing/me"), apiFetch("/api/billing/refunds"), apiFetch("/api/billing/issues")]);
      setPayments(Array.isArray(paymentData.payments) ? paymentData.payments : []);
      setSubscription(subscriptionData.subscription || null);
      setRefunds(Array.isArray(refundData.refunds) ? refundData.refunds : []);
      setIssues(Array.isArray(issueData.issues) ? issueData.issues : []);
      setRefundMessage("");
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : "Unable to load billing");
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadBilling(); }, []);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((p) => {
      const title = p.course?.title || p.plan?.name || "BuddyForStudy payment";
      const matchesText = !query || [title, p.status, p.provider, p.providerPaymentId, p.providerOrderId, p._id].some((value) => String(value || "").toLowerCase().includes(query));
      return matchesText && (statusFilter === "all" || p.status === statusFilter);
    });
  }, [payments, search, statusFilter]);

  const paidTotal = payments.filter((p) => ["paid", "partially_refunded"].includes(p.status)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pendingCount = payments.filter((p) => ["created", "pending"].includes(p.status)).length;
  const failedCount = payments.filter((p) => ["failed", "cancelled"].includes(p.status)).length;

  async function submitRefund(paymentId: string) {
    if (submittingRefund) return;
    setSubmittingRefund(true);
    try {
      await apiFetch("/api/billing/refunds", { method: "POST", body: JSON.stringify({ paymentId, reason: refundReason }) });
      setRefundMessage("Your refund request has been submitted. You will receive an update when its status changes.");
      setRefundId(null);
      setRefundReason("");
      const refundData = await apiFetch("/api/billing/refunds");
      setRefunds(Array.isArray(refundData.refunds) ? refundData.refunds : []);
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : "Unable to submit refund request");
    } finally {
      setSubmittingRefund(false);
    }
  }

  async function submitIssue(paymentId: string) {
    if (issueDescription.trim().length < 5) { setRefundMessage("Please describe the payment issue in at least 5 characters."); return; }
    setSubmittingIssue(true);
    try {
      await apiFetch("/api/billing/issues", { method: "POST", body: JSON.stringify({ paymentId, category: issueCategory, description: issueDescription.trim() }) });
      setRefundMessage("Your payment issue has been reported. You can track its status below.");
      setIssueId(null); setIssueDescription("");
      const issueData = await apiFetch("/api/billing/issues");
      setIssues(Array.isArray(issueData.issues) ? issueData.issues : []);
    } catch (error) { setRefundMessage(error instanceof Error ? error.message : "Unable to report payment issue"); }
    finally { setSubmittingIssue(false); }
  }
  function exportCsv() {
    const escape = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const rows = [
      ["Transaction ID", "Item", "Amount", "Currency", "Status", "Provider", "Created At", "Paid At"],
      ...filteredPayments.map((p) => [p._id, p.plan?.name || p.course?.title || "BuddyForStudy payment", p.amount, p.currency || "INR", p.status, p.provider || "", p.createdAt, p.paidAt || ""])
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "buddyforstudy-transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Billing & transactions" subtitle="Manage your subscription, review every payment attempt, and track refund requests." />
        <Link to="/profile" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowUpRight className="h-4 w-4" />Back to profile</Link>
      </div>

      {refundMessage && <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{refundMessage}</div>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current plan</span><CreditCard className="h-5 w-5 text-blue-600" /></div><p className="mt-3 text-xl font-extrabold text-slate-950">{subscription?.plan?.name || "Free"}</p><p className="mt-1 text-xs capitalize text-slate-500">{subscription?.status ? subscription.status.replace(/_/g, " ") : "No paid subscription"}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid transactions</span><ReceiptText className="h-5 w-5 text-emerald-600" /></div><p className="mt-3 text-xl font-extrabold text-slate-950">{payments.filter((p) => ["paid", "partially_refunded", "refunded"].includes(p.status)).length}</p><p className="mt-1 text-xs text-slate-500">Recorded successful payments</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid amount</span><ShieldCheck className="h-5 w-5 text-violet-600" /></div><p className="mt-3 text-xl font-extrabold text-slate-950">{money(paidTotal)}</p><p className="mt-1 text-xs text-slate-500">Gross amount on paid records, before refunds</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Needs attention</span><Clock3 className="h-5 w-5 text-amber-600" /></div><p className="mt-3 text-xl font-extrabold text-slate-950">{pendingCount + failedCount}</p><p className="mt-1 text-xs text-slate-500">{pendingCount} pending · {failedCount} failed/cancelled</p></div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-extrabold text-slate-950">Subscription</h2><p className="mt-1 text-sm text-slate-500">Review plan status and renewal settings.</p></div>
          <Link to="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Compare plans <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        {subscription ? <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div><p className="font-bold text-slate-950">{subscription.plan?.name || "Subscription"}</p><p className="mt-1 text-sm capitalize text-slate-600">{subscription.status} · {subscription.plan?.billingInterval || "recurring"}</p>{subscription.currentPeriodEnd && <p className="mt-1 text-xs text-slate-500">Current period ends {date(subscription.currentPeriodEnd)}</p>}{subscription.cancelAtPeriodEnd && <p className="mt-1 text-xs font-semibold text-amber-700">Auto-renewal is scheduled to stop at period end.</p>}</div>
          <div className="flex flex-wrap items-center gap-2"><span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-bold capitalize " + (subscription.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>{subscription.status}</span>
          {["trialing", "active", "past_due"].includes(subscription.status) && !subscription.cancelAtPeriodEnd && <button className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={cancelling} onClick={async () => {
            if (!window.confirm("Cancel auto-renewal? Your plan access remains active through the current billing period.")) return;
            setCancelling(true);
            try { const data = await apiFetch("/api/billing/subscription/cancel", { method: "POST" }); setSubscription(data.subscription || subscription); setRefundMessage("Auto-renewal cancelled. Your access remains active through the current billing period."); }
            catch (error) { setRefundMessage(error instanceof Error ? error.message : "Unable to cancel subscription"); }
            finally { setCancelling(false); }
          }}>{cancelling ? "Cancelling…" : "Cancel auto-renewal"}</button>}</div>
        </div> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-4"><div><p className="font-bold text-slate-900">You are on the Free plan</p><p className="mt-1 text-sm text-slate-500">Compare subscription plans to unlock additional learning features.</p></div><Link to="/pricing" className="btn-primary">Explore plans</Link></div>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold text-slate-950">Reported payment issues</h2><p className="mt-1 text-sm text-slate-500">Track payment problems, including benefits that were not unlocked after a successful charge.</p></div>
        {issues.length ? <div className="divide-y divide-slate-100">{issues.map((issue) => {
          const title = issue.payment?.plan?.name || issue.payment?.course?.title || "BuddyForStudy payment";
          const status = String(issue.status || "open").toLowerCase();
          const styles: Record<string, string> = { open: "bg-amber-50 text-amber-700", in_review: "bg-blue-50 text-blue-700", resolved: "bg-emerald-50 text-emerald-700", closed: "bg-slate-100 text-slate-700" };
          const categoryLabels: Record<string, string> = { benefit_not_received: "Benefit not received", payment_failed: "Payment failed", duplicate_charge: "Duplicate charge", incorrect_amount: "Incorrect amount", refund_help: "Refund help", other: "Other issue" };
          return <article key={issue._id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-bold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{categoryLabels[issue.category] || "Payment issue"} · Reported {date(issue.createdAt)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{issue.description}</p>{issue.adminNote && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Support update: {issue.adminNote}</p>}</div><span className={"inline-flex h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize " + (styles[status] || styles.open)}>{status.replace(/_/g, " ")}</span></div></article>;
        })}</div> : <p className="p-6 text-sm text-slate-500">No payment issues reported. If a payment succeeds but your course or plan benefits do not appear, report the transaction from the history below.</p>}
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold text-slate-950">Refund requests</h2><p className="mt-1 text-sm text-slate-500">Track the review status of refunds you have requested.</p></div>
        {refunds.length ? <div className="divide-y divide-slate-100">{refunds.map((refund) => {
          const refundStatus = String(refund.status || "pending").toLowerCase();
          const refundTitle = refund.payment?.plan?.name || refund.payment?.course?.title || "Payment refund";
          const refundStyles: Record<string, string> = { pending: "bg-amber-50 text-amber-700", approved: "bg-blue-50 text-blue-700", processed: "bg-emerald-50 text-emerald-700", rejected: "bg-rose-50 text-rose-700" };
          return <article key={refund._id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-bold text-slate-900">{refundTitle}</p><p className="mt-1 text-xs text-slate-500">Requested {date(refund.createdAt)} · Ref {refund._id}</p>{refund.reason && <p className="mt-2 text-sm text-slate-600">Reason: {refund.reason}</p>}{refund.adminNote && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Update: {refund.adminNote}</p>}{refund.processedAt && <p className="mt-1 text-xs text-slate-500">Updated {date(refund.processedAt)}</p>}</div><div className="shrink-0 sm:text-right"><p className="font-extrabold text-slate-950">{money(Number(refund.amount || 0), refund.payment?.currency || "INR")}</p><span className={"mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize " + (refundStyles[refundStatus] || "bg-slate-100 text-slate-700")}>{refundStatus}</span></div></article>;
        })}</div> : <p className="p-6 text-sm text-slate-500">No refund requests yet. If you need help with an eligible payment, use Request refund in transaction history.</p>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div><h2 className="text-lg font-extrabold text-slate-950">Transaction history</h2><p className="mt-1 text-sm text-slate-500">Search by item, status, payment reference, or transaction ID.</p></div>
          <button type="button" onClick={exportCsv} disabled={!filteredPayments.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" />Export CSV</button>
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_190px] sm:p-5">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions…" aria-label="Search transactions" /></label>
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter transaction status"><option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="created">Created</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option><option value="partially_refunded">Partially refunded</option></select>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading transaction history…</div> : filteredPayments.length ? <div className="divide-y divide-slate-100">
          {filteredPayments.map((payment) => {
            const status = String(payment.status || "pending").toLowerCase();
            const StatusIcon = status === "paid" ? CheckCircle2 : ["failed", "cancelled"].includes(status) ? XCircle : Clock3;
            const itemTitle = payment.plan?.name || payment.course?.title || "BuddyForStudy payment";
            return <article key={payment._id} className="p-5 transition hover:bg-slate-50/70 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><CreditCard className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{itemTitle}</h3><span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset " + statusClass(status)}><StatusIcon className="h-3 w-3" />{status.replace(/_/g, " ")}</span></div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Created {date(payment.createdAt)}{payment.paidAt ? " · Paid " + date(payment.paidAt) : ""}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-400">Transaction: {payment._id}</p>
                  {payment.providerPaymentId && <p className="mt-1 break-all font-mono text-[11px] text-slate-400">Payment reference: {payment.providerPaymentId}</p>}
                  {payment.provider && <p className="mt-1 text-xs capitalize text-slate-500">Provider: {payment.provider}</p>}
                </div>
                <div className="sm:min-w-36 sm:text-right"><p className="text-lg font-extrabold text-slate-950">{money(Number(payment.amount || 0), payment.currency || "INR")}</p>
                  {["paid", "partially_refunded"].includes(status) && !refunds.some((refund) => String(refund.payment?._id || "") === payment._id && ["pending", "approved", "processed"].includes(String(refund.status).toLowerCase())) && <button type="button" className="mt-2 block text-xs font-bold text-rose-700 hover:underline" onClick={() => { setRefundId(refundId === payment._id ? null : payment._id); setIssueId(null); setRefundReason(""); setRefundMessage(""); }}>Request refund</button>}
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline" onClick={() => { setIssueId(issueId === payment._id ? null : payment._id); setRefundId(null); setIssueCategory(["paid", "partially_refunded"].includes(status) ? "benefit_not_received" : status === "failed" ? "payment_failed" : "other"); setIssueDescription(""); setRefundMessage(""); }}><MessageSquareWarning className="h-3.5 w-3.5" />Report issue</button>
                </div>
              </div>
              {issueId === payment._id && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                <div className="flex items-start gap-2"><MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" /><div><p className="text-sm font-bold text-slate-900">Report a transaction issue</p><p className="mt-1 text-xs text-slate-600">Use this if payment failed, you were charged incorrectly, or a completed payment did not unlock the course or plan benefits.</p></div></div>
                <label className="mt-3 block text-sm font-semibold text-slate-800">Issue type
                  <select className="input-field mt-2 bg-white" value={issueCategory} onChange={(e) => setIssueCategory(e.target.value)}>
                    <option value="benefit_not_received">Payment completed but benefit not received</option><option value="payment_failed">Payment failed or is stuck</option><option value="duplicate_charge">Duplicate charge</option><option value="incorrect_amount">Incorrect amount charged</option><option value="refund_help">Help with an existing refund</option><option value="other">Other transaction issue</option>
                  </select>
                </label>
                <label className="mt-3 block text-sm font-semibold text-slate-800">Describe the issue
                  <textarea className="input-field mt-2 min-h-24 bg-white" placeholder="Tell us what happened and what benefit you expected…" value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} maxLength={2000} required />
                </label>
                <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setIssueId(null)}>Cancel</button><button type="button" className="btn-primary" disabled={submittingIssue || issueDescription.trim().length < 5} onClick={() => void submitIssue(payment._id)}>{submittingIssue ? "Submitting…" : "Submit report"}</button></div>
              </div>}
              {refundId === payment._id && <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-4"><label className="block text-sm font-semibold text-slate-800">Why are you requesting a refund? <span className="font-normal text-slate-500">(optional)</span><textarea className="input-field mt-2 min-h-24 bg-white" placeholder="Tell us a little about the issue…" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={1000} /></label><div className="mt-3 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setRefundId(null)}>Keep payment</button><button type="button" className="btn-primary" disabled={submittingRefund} onClick={() => void submitRefund(payment._id)}>{submittingRefund ? "Submitting…" : "Submit request"}</button></div></div>}
            </article>;
          })}
        </div> : <div className="p-12 text-center"><ReceiptText className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-800">{payments.length ? "No matching transactions" : "No transactions yet"}</p><p className="mt-1 text-sm text-slate-500">{payments.length ? "Try a different search or status filter." : "Your subscription and payment activity will appear here."}</p>{!payments.length && <Link to="/pricing" className="btn-primary mt-4 inline-flex">Explore plans</Link>}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500"><span>Showing {filteredPayments.length} of {payments.length} records</span><span>Payment records are loaded securely for your account.</span></div>
      </section>
    </div>
  );
}

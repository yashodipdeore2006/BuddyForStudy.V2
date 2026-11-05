import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import AccountSettings from "@/pages/Settings";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";
import {
  UserRound, Mail, ShieldCheck, CreditCard, ArrowUpRight, Clock3,
  ReceiptText, BookOpen, Settings2, Bell, CheckCircle2, XCircle, AlertCircle, Loader2
} from "lucide-react";

type EnrollmentSummary = { _id?: string; id?: string; status?: string; course?: { _id?: string; title?: string } | string | null; course_id?: string; createdAt?: string };
type SubscriptionSummary = { status?: string; plan?: { name?: string; billingInterval?: string } | null };
type Payment = {
  _id: string;
  amount: number;
  currency?: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  provider?: string;
  providerPaymentId?: string;
  course?: { title?: string } | null;
  plan?: { name?: string; billingInterval?: string } | null;
};

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  refunded: "bg-slate-100 text-slate-700 ring-slate-500/15",
  partially_refunded: "bg-amber-50 text-amber-700 ring-amber-600/15",
  failed: "bg-rose-50 text-rose-700 ring-rose-600/15",
  pending: "bg-blue-50 text-blue-700 ring-blue-600/15",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-500/15",
};

function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Profile() {
  const { profile, session, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState("");

  useEffect(() => {
    setName(profile?.name || "");
  }, [profile?.name]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/enrollments").then((data) => {
      if (!cancelled) setEnrollments(Array.isArray(data.enrollments) ? data.enrollments : []);
    }).catch(() => {
      if (!cancelled) setEnrollments([]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch("/api/billing/payments"), apiFetch("/api/billing/me")])
      .then(([paymentData, subscriptionData]) => {
        if (cancelled) return;
        setPayments(Array.isArray(paymentData.payments) ? paymentData.payments : []);
        setSubscription(subscriptionData.subscription || null);
      })
      .catch((e) => {
        if (!cancelled) setBillingError(e instanceof Error ? e.message : "Unable to load billing overview.");
      })
      .finally(() => { if (!cancelled) setBillingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const latestPayments = payments.slice(0, 3);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch("/api/auth/profile", { method: "PUT", body: JSON.stringify({ name }) });
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "B";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Your profile" subtitle="Manage your account, learning preferences, subscription, and payments in one place." />
      <nav aria-label="Profile sections" className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <a href="#personal-information" className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Profile</a>
        <a href="#security" className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Security</a>
        <a href="#appearance" className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Appearance</a>
        <a href="#notifications" className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Notifications</a>
        <Link to={routes.billing()} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Billing</Link>
      </nav>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-slate-950 px-6 py-7 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-extrabold shadow-lg shadow-blue-950/30">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight">{profile.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {profile.is_active ? "Account active" : "Account inactive"}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-300"><Mail className="h-4 w-4" />{session?.user.email || "Email unavailable"}</p>
              <p className="mt-2 text-xs text-slate-400">{profile.role === "admin" ? "Administrator account" : "BuddyForStudy learner"} · ID {profile.id}</p>
            </div>
            <Link to="#security" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
              <Settings2 className="h-4 w-4" /> Account settings
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Current plan</p>
            <p className="mt-2 text-xl font-extrabold text-slate-950">{billingLoading ? "Loading…" : subscription?.plan?.name || "Free"}</p>
            <p className="mt-1 text-xs text-slate-500">{subscription?.status ? `Subscription ${subscription.status}` : "Explore plans to unlock more learning tools"}</p>
          </div>
          <div className="bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Courses in learning</p>
            <p className="mt-2 text-xl font-extrabold text-slate-950">{enrollments.filter((item) => ["active", "completed"].includes(String(item.status || "").toLowerCase())).length}</p>
            <p className="mt-1 text-xs text-slate-500">Courses you are enrolled in</p>
          </div>
          <div className="bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Completed courses</p>
            <p className="mt-2 text-xl font-extrabold text-slate-950">{enrollments.filter((item) => String(item.status || "").toLowerCase() === "completed").length}</p>
            <p className="mt-1 text-xs text-slate-500">Marked complete in your learning record</p>
          </div>
          <div className="bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment records</p>
            <p className="mt-2 text-xl font-extrabold text-slate-950">{billingLoading ? "—" : payments.length}</p>
            <p className="mt-1 text-xs text-slate-500">All recorded checkout attempts</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <form id="personal-information" onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><UserRound className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-extrabold text-slate-950">Personal information</h2><p className="mt-1 text-sm text-slate-500">Update the name displayed across your learning account.</p></div>
          </div>
          {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {success && <div role="status" className="mt-5 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />Profile updated successfully.</div>}
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Full name
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field mt-1.5" minLength={2} maxLength={100} required autoComplete="name" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Email address
              <input value={session?.user.email || ""} disabled className="input-field mt-1.5 bg-slate-50 text-slate-500" />
              <span className="mt-1 block text-xs font-normal text-slate-500">Your sign-in email is managed by account verification and cannot be edited here.</span>
            </label>
          </div>
          <div className="mt-6 flex justify-end"><button type="submit" disabled={saving || name.trim().length < 2 || name.trim() === profile.name} className="btn-primary disabled:opacity-50">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save profile"}</button></div>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><ShieldCheck className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-extrabold text-slate-950">Account & security</h2><p className="mt-1 text-sm text-slate-500">Manage access and communication preferences.</p></div>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            <Link to="#security" className="flex items-center gap-3 py-4 group">
              <LockIcon /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Password & sign-in</span><span className="mt-1 block text-xs text-slate-500">{profile.auth_provider === "google" ? "Managed by Google" : "Change your password"}</span></span><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
            </Link>
            <Link to="#notifications" className="flex items-center gap-3 py-4 group">
              <Bell className="h-5 w-5 text-slate-400" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Notifications</span><span className="mt-1 block text-xs text-slate-500">Email, in-app, push and study reminders</span></span><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
            </Link>
            <Link to={routes.myLearning()} className="flex items-center gap-3 py-4 group">
              <BookOpen className="h-5 w-5 text-slate-400" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">My learning</span><span className="mt-1 block text-xs text-slate-500">Continue your enrolled courses</span></span><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
            </Link>
          </div>
        </section>
      </div>

      <section aria-label="Account settings" className="mt-8">
        <div className="mb-4"><h2 className="text-xl font-extrabold text-slate-950">Account settings</h2><p className="mt-1 text-sm text-slate-500">Security, appearance, notification preferences and study reminders.</p></div>
        <AccountSettings embedded />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ReceiptText className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-slate-950">Recent transactions</h2><p className="mt-1 text-sm text-slate-500">Your latest subscription and course payment activity.</p></div></div>
        </div>
        {billingError && <p role="alert" className="m-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{billingError} You can retry from Billing & Payment History.</p>}
        {billingLoading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading transaction history…</div> : latestPayments.length ? (
          <div className="divide-y divide-slate-100">
            {latestPayments.map((payment) => {
              const status = String(payment.status || "pending").toLowerCase();
              const StatusIcon = status === "paid" ? CheckCircle2 : ["failed", "cancelled"].includes(status) ? XCircle : Clock3;
              return <div key={payment._id} className="flex flex-wrap items-center gap-3 p-5 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><CreditCard className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{payment.plan?.name || payment.course?.title || "BuddyForStudy payment"}</p><p className="mt-1 text-xs text-slate-500">{formatDate(payment.createdAt)}{payment.provider ? ` · ${payment.provider}` : ""}</p></div>
                <div className="text-right"><p className="text-sm font-extrabold text-slate-950">{formatMoney(Number(payment.amount || 0), payment.currency || "INR")}</p><span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold capitalize ring-1 ring-inset ${statusStyle[status] || statusStyle.pending}`}><StatusIcon className="h-3 w-3" />{status.replace(/_/g, " ")}</span></div>
              </div>;
            })}
          </div>
        ) : <div className="p-8 text-center"><ReceiptText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No transactions yet</p><p className="mt-1 text-xs text-slate-500">Your purchases and subscription payments will appear here.</p><Link to={routes.pricing()} className="btn-primary mt-4 inline-flex">Explore plans</Link></div>}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to={routes.notifications()} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40"><Bell className="h-5 w-5 text-blue-600" /><span className="flex-1"><span className="block text-sm font-bold text-slate-900">Notification center</span><span className="mt-1 block text-xs text-slate-500">View account and learning updates</span></span><ArrowUpRight className="h-4 w-4 text-slate-400" /></Link>
      </div>
    </div>
  );
}

function LockIcon() {
  return <ShieldCheck className="h-5 w-5 text-slate-400" />;
}

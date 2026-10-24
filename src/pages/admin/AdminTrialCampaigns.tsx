import { useCallback, useEffect, useState } from "react";
import { Gift, RefreshCcw, Users, ShieldCheck } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminBadge } from "@/components/admin/AdminUI";

type Plan = { _id: string; name: string; price: number; currency: string; billingInterval: string; isActive: boolean };
type AudienceUser = { id: string; name: string; email: string; createdAt?: string; authProvider?: string; emailVerified?: boolean; reason?: string };
type Grant = { _id: string; user?: { name?: string; email?: string }; plan?: { name?: string }; conversionPlan?: { name?: string; price?: number; currency?: string; billingInterval?: string }; campaignName: string; status: string; startsAt: string; endsAt: string; conversionConsentStatus: string; reason: string };
const defaultFilters = { createdAfter: "", createdBefore: "", authProvider: "any", emailVerified: "yes", phoneVerified: "any", marketingConsent: "any", profileSetup: "any", city: "", learningGoal: "", priorTrial: "never", subscriptionStatus: "none" };
const date = (value?: string) => value ? new Date(value).toLocaleString() : "—";

export default function AdminTrialCampaigns() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [planId, setPlanId] = useState("");
  const [conversionPlanId, setConversionPlanId] = useState("");
  const [campaignName, setCampaignName] = useState("New learner welcome trial");
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [filters, setFilters] = useState(defaultFilters);
  const [preview, setPreview] = useState<{ eligibleCount: number; totalEligibleBeforeLimit: number; skippedCount: number; eligible: AudienceUser[]; skipped: AudienceUser[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmGrant, setConfirmGrant] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [planData, grantData] = await Promise.all([
        adminFetch("/api/admin/plans"),
        adminFetch("/api/admin/trials/grants?limit=25")
      ]);
      const activePlans = (planData.plans || []).filter((p: Plan) => p.isActive);
      setPlans(activePlans);
      if (!planId && activePlans[0]) setPlanId(activePlans[0]._id);
      setGrants(grantData.grants || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load trial campaigns."); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { void load(); }, [load]);

  const payload = () => ({
    campaignName, reason, trialDays, planId, conversionPlanId,
    filters: {
      ...filters,
      createdAfter: filters.createdAfter ? new Date(filters.createdAfter).toISOString() : "",
      createdBefore: filters.createdBefore ? new Date(filters.createdBefore).toISOString() : ""
    }
  });
  async function runPreview() {
    setError(""); setMessage(""); setConfirmGrant(false); setLoading(true);
    try { setPreview(await adminFetch("/api/admin/trials/preview", { method: "POST", body: JSON.stringify(payload()) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to preview audience."); }
    finally { setLoading(false); }
  }
  async function applyGrant() {
    if (!preview || !confirmGrant) return;
    setError(""); setMessage(""); setLoading(true);
    try {
      const result = await adminFetch("/api/admin/trials/grant", { method: "POST", body: JSON.stringify({ ...payload(), confirm: true, idempotencyKey: globalThis.crypto?.randomUUID?.() || "trial-grant-" + Date.now() }) });
      setMessage(`Trial grants processed: ${result.granted || 0} granted, ${result.skipped || 0} skipped. No autopay was initiated.`);
      setPreview(null); setConfirmGrant(false); setReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to grant trials."); }
    finally { setLoading(false); }
  }
  function changeFilter<K extends keyof typeof defaultFilters>(key: K, value: typeof defaultFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value })); setPreview(null);
  }

  return <div className="mx-auto max-w-7xl">
    <AdminPageHeader eyebrow="Finance & learner growth" title="Free trial campaigns" description="Preview a filtered audience and grant a time-limited entitlement. Paid conversion always requires the learner’s explicit payment-provider authorization." actions={<button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>} />
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <section className="card p-5">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><Gift className="h-5 w-5" /></span><div><h2 className="font-bold">Configure trial</h2><p className="text-xs text-slate-500">Grant to all eligible accounts matching your filters. Preview shows a sample before confirmation.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Campaign name<input className="input-field mt-1" value={campaignName} maxLength={120} onChange={e=>{setCampaignName(e.target.value);setPreview(null);}} /></label>
          <label className="text-xs font-semibold text-slate-600">Trial entitlement plan<select className="input-field mt-1" value={planId} onChange={e=>{setPlanId(e.target.value);setPreview(null);}}>{plans.map(p=><option key={p._id} value={p._id}>{p.name} · {p.price===0?"Free":`₹${p.price}`}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Trial duration (days)<input className="input-field mt-1" type="number" min={1} max={30} value={trialDays} onChange={e=>{setTrialDays(Number(e.target.value));setPreview(null);}} /></label>
          <label className="text-xs font-semibold text-slate-600">Optional paid conversion plan<select className="input-field mt-1" value={conversionPlanId} onChange={e=>{setConversionPlanId(e.target.value);setPreview(null);}}><option value="">No conversion offer</option>{plans.filter(p=>p.price>0&&p.billingInterval!=="one_time").map(p=><option key={p._id} value={p._id}>{p.name} · ₹{p.price}/{p.billingInterval}</option>)}</select><span className="mt-1 block font-normal text-slate-400">Selecting a plan records an offer only. It does not set up autopay or charge users.</span></label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Internal reason (required)<textarea className="input-field mt-1 min-h-20" minLength={10} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);}} placeholder="Why are these users receiving a trial?" /></label>
        </div>
      </section>
      <section className="card p-5">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-700"><Users className="h-5 w-5" /></span><div><h2 className="font-bold">Audience filters</h2><p className="text-xs text-slate-500">Admin accounts are always excluded.</p></div></div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-slate-600">Authentication provider<select className="input-field mt-1" value={filters.authProvider} onChange={e=>changeFilter("authProvider",e.target.value)}><option value="any">Any provider</option><option value="local">Email/password</option><option value="google">Google</option><option value="local_google">Linked local + Google</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">Email verification<select className="input-field mt-1" value={filters.emailVerified} onChange={e=>changeFilter("emailVerified",e.target.value)}><option value="yes">Verified only</option><option value="no">Unverified only</option><option value="any">Any</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">Phone verification<select className="input-field mt-1" value={filters.phoneVerified} onChange={e=>changeFilter("phoneVerified",e.target.value)}><option value="any">Any</option><option value="yes">Verified phone only</option><option value="no">Unverified phone only</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">Marketing email consent<select className="input-field mt-1" value={filters.marketingConsent} onChange={e=>changeFilter("marketingConsent",e.target.value)}><option value="any">Any consent status</option><option value="yes">Consented only</option><option value="no">Not consented</option></select><span className="mt-1 block font-normal text-slate-400">This filter does not grant marketing permission.</span></label>
          <label className="block text-xs font-semibold text-slate-600">Profile setup<select className="input-field mt-1" value={filters.profileSetup} onChange={e=>changeFilter("profileSetup",e.target.value)}><option value="any">Any profile state</option><option value="complete">Setup not skipped</option><option value="skipped">Setup skipped</option><option value="incomplete">Incomplete profile</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">City contains<input className="input-field mt-1" maxLength={100} value={filters.city} onChange={e=>changeFilter("city",e.target.value)} placeholder="e.g. Nashik" /></label>
          <label className="block text-xs font-semibold text-slate-600">Learning goal contains<input className="input-field mt-1" maxLength={240} value={filters.learningGoal} onChange={e=>changeFilter("learningGoal",e.target.value)} placeholder="e.g. backend development" /></label>
          <label className="block text-xs font-semibold text-slate-600">Previous trial history<select className="input-field mt-1" value={filters.priorTrial} onChange={e=>changeFilter("priorTrial",e.target.value)}><option value="never">Never received a trial</option><option value="any">Allow previous trial recipients</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">Subscription status<select className="input-field mt-1" value={filters.subscriptionStatus} onChange={e=>changeFilter("subscriptionStatus",e.target.value)}><option value="none">No active subscription</option><option value="expired_or_cancelled">Expired or cancelled</option><option value="any">Any status (active users still excluded)</option></select></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Created after<input className="input-field mt-1" type="date" value={filters.createdAfter} onChange={e=>changeFilter("createdAfter",e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Created before<input className="input-field mt-1" type="date" value={filters.createdBefore} onChange={e=>changeFilter("createdBefore",e.target.value)} /></label></div>
        </div>
      </section>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className="btn-primary" onClick={()=>void runPreview()} disabled={loading||!planId||campaignName.trim().length<3||reason.trim().length<10||trialDays<1||trialDays>30}><Users className="h-4 w-4" /> {loading?"Working…":"Preview all eligible users"}</button><p className="text-xs text-slate-500">Preview does not grant access or create a payment.</p></div>
    {preview && <section className="card mt-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Audience preview</h2><p className="text-sm text-slate-500">Eligible: {preview.eligibleCount} · Skipped: {preview.skippedCount} · Eligible matching filters: {preview.totalEligibleBeforeLimit}</p></div><AdminBadge tone="warning">No autopay authorization</AdminBadge></div>
      {preview.eligible.length>0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Created</th><th className="p-3">Provider</th><th className="p-3">Verified</th></tr></thead><tbody className="divide-y">{preview.eligible.map(u=><tr key={u.id}><td className="p-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td><td className="p-3">{date(u.createdAt)}</td><td className="p-3">{u.authProvider || "—"}</td><td className="p-3">{u.emailVerified ? "Verified" : "Unverified"}</td></tr>)}</tbody></table></div>}
      {preview.skipped.length>0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Skipped users ({preview.skippedCount})</summary><div className="mt-2 space-y-2">{preview.skipped.map(u=><p key={u.id} className="text-xs text-slate-500">{u.name} · {u.email} — {u.reason}</p>)}</div></details>}
      <label className="mt-5 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmGrant} onChange={e=>setConfirmGrant(e.target.checked)} className="mt-1" /><span>I reviewed the audience and confirm granting a {trialDays}-day trial to {preview.eligibleCount} eligible user(s). No recurring payment will be initiated.</span></label>
      <button type="button" className="btn-primary mt-4" onClick={()=>void applyGrant()} disabled={loading||!confirmGrant||preview.eligibleCount===0}><ShieldCheck className="h-4 w-4" /> Confirm and grant trials</button>
    </section>}
    <section className="card mt-6 overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Recent trial grants</h2><p className="mt-1 text-xs text-slate-500">A conversion offer is not an autopay mandate. Users must separately authorize recurring billing.</p></div>{loading&&!grants.length?<p className="p-8 text-sm text-slate-500">Loading grants…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Learner</th><th className="p-3">Campaign / plan</th><th className="p-3">Trial period</th><th className="p-3">Conversion</th><th className="p-3">Reason</th></tr></thead><tbody className="divide-y divide-slate-100">{grants.map(g=><tr key={g._id}><td className="p-3"><p className="font-semibold">{g.user?.name||"Unknown user"}</p><p className="text-xs text-slate-500">{g.user?.email}</p></td><td className="p-3"><p>{g.campaignName}</p><p className="text-xs text-slate-500">{g.plan?.name||"Plan"}</p></td><td className="p-3 text-xs"><p>{date(g.startsAt)}</p><p>Ends {date(g.endsAt)}</p></td><td className="p-3">{g.conversionPlan?.name||"None"}<p className="text-xs text-slate-500">{g.conversionConsentStatus.replace(/_/g," ")}</p></td><td className="max-w-56 p-3 text-xs text-slate-500">{g.reason}</td></tr>)}</tbody></table>{!grants.length&&<p className="p-8 text-center text-sm text-slate-500">No trial grants yet.</p>}</div>}</section>
  </div>;
}

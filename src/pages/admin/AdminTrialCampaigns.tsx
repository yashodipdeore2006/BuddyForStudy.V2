import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Users, ShieldCheck, UserRound, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminBadge } from "@/components/admin/AdminUI";

type Plan = { _id: string; name: string; price: number; currency: string; billingInterval: string; isActive: boolean };
type AudienceUser = { id: string; name: string; email: string; createdAt?: string; authProvider?: string; emailVerified?: boolean; reason?: string };
type Grant = { _id: string; user?: { name?: string; email?: string }; plan?: { name?: string }; conversionPlan?: { name?: string; price?: number; currency?: string; billingInterval?: string }; campaignName: string; status: string; startsAt: string; endsAt: string; conversionConsentStatus: string; reason: string };
const initialFilters = { q: "", emailExact: "", status: "active", role: "user", createdAfter: "", createdBefore: "", registeredAfter: "", registeredBefore: "", authProvider: "any", emailVerified: "yes", planId: "", expiresWithinDays: "", courseId: "", enrollmentStatus: "", progressMin: "", progressMax: "", inactiveDays: "", totalSpendMin: "", courseCountMin: "", planSegment: "", courseSegment: "", phoneVerified: "any", marketingConsent: "any", profileSetup: "any", city: "", learningGoal: "", priorTrial: "never", subscriptionStatus: "none" };
type Filters = typeof initialFilters;
const date = (value?: string) => value ? new Date(value).toLocaleString("en-IN") : "—";

export default function AdminTrialCampaigns() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [planId, setPlanId] = useState("");
  const [conversionPlanId, setConversionPlanId] = useState("");
  const [campaignName, setCampaignName] = useState("Personal trial grant");
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [targetMode, setTargetMode] = useState<"single" | "group">("single");
  const [singleEmail, setSingleEmail] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState<{ eligibleCount: number; totalEligibleBeforeLimit: number; skippedCount: number; eligible: AudienceUser[]; skipped: AudienceUser[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmGrant, setConfirmGrant] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [planData, grantData] = await Promise.all([adminFetch("/api/admin/plans"), adminFetch("/api/admin/trials/grants?limit=25")]);
      const activePlans = (planData.plans || []).filter((p: Plan) => p.isActive);
      setPlans(activePlans);
      if (!planId && activePlans[0]) setPlanId(activePlans[0]._id);
      setGrants(grantData.grants || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load trial campaigns."); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { void load(); }, [load]);

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(current => ({ ...current, [key]: value }));
    setPreview(null); setConfirmGrant(false);
  }
  const payload = () => {
    const next: Record<string, unknown> = {};
    if (targetMode === "single") {
      next.emailExact = singleEmail.trim().toLowerCase();
      next.emailVerified = "any";
    } else {
      for (const [key, value] of Object.entries(filters)) {
        if (value === "" || (value === "any" && key !== "emailVerified") || key === "emailExact" || key === "q") continue;
        if (key === "emailVerified") next[key] = value;
        else if (["expiresWithinDays", "progressMin", "progressMax", "inactiveDays", "totalSpendMin", "courseCountMin"].includes(key)) next[key] = Number(value);
        else if (key === "createdAfter" || key === "createdBefore") next[key] = value ? new Date(value).toISOString() : "";
        else next[key] = value;
      }
      if (filters.q.trim()) next.q = filters.q.trim();
      next.priorTrial = filters.priorTrial;
      next.subscriptionStatus = filters.subscriptionStatus;
    }
    return { campaignName, reason, trialDays, planId, conversionPlanId, filters: next };
  };
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
  const valid = Boolean(planId) && campaignName.trim().length >= 3 && reason.trim().length >= 10 && trialDays >= 1 && trialDays <= 30 && (targetMode === "single" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(singleEmail.trim()) : true);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
  const labelClass = "block text-xs font-semibold text-slate-600";
  const selectClass = inputClass;
  const selectField = (label: string, key: keyof Filters, options: Array<[string,string]>) => <label className={labelClass}>{label}<select className={selectClass} value={filters[key] as string} onChange={e => changeFilter(key, e.target.value as never)}>{options.map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select></label>;

  return <div className="mx-auto max-w-6xl pb-12">
    <AdminPageHeader eyebrow="Learner access" title="Grant a free trial" description="Choose a learner or audience, select the plan and duration, then review before granting access." actions={<button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>} />
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">1</span><div><p className="text-sm font-semibold text-slate-900">Choose learner(s)</p><p className="text-xs text-slate-500">One account or a group</p></div></div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">2</span><div><p className="text-sm font-semibold text-slate-900">Set trial access</p><p className="text-xs text-slate-500">Plan and number of days</p></div></div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">3</span><div><p className="text-sm font-semibold text-slate-900">Review and grant</p><p className="text-xs text-slate-500">Confirm before applying</p></div></div>
    </div>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">1. Who should receive the trial?</h2><p className="mt-1 text-sm text-slate-500">For one learner, use their exact account email. Choose a group to target many accounts with filters.</p></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <button type="button" onClick={() => {setTargetMode("single");setPreview(null);setConfirmGrant(false);}} className={`rounded-xl border p-4 text-left transition ${targetMode==="single" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center gap-3"><span className="rounded-lg bg-white p-2 text-violet-700"><UserRound className="h-5 w-5"/></span><span><span className="block text-sm font-semibold text-slate-900">One specific learner</span><span className="mt-1 block text-xs text-slate-500">Grant access to one registered account</span></span></span></button>
        <button type="button" onClick={() => {setTargetMode("group");setPreview(null);setConfirmGrant(false);}} className={`rounded-xl border p-4 text-left transition ${targetMode==="group" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center gap-3"><span className="rounded-lg bg-white p-2 text-violet-700"><Users className="h-5 w-5"/></span><span><span className="block text-sm font-semibold text-slate-900">A filtered group</span><span className="mt-1 block text-xs text-slate-500">Grant to all matching eligible learners</span></span></span></button>
      </div>
      {targetMode === "single" ? <div className="px-5 pb-6 sm:px-6"><label className={labelClass}>Learner’s registered email address<input className={inputClass} type="email" autoComplete="email" maxLength={254} value={singleEmail} onChange={e=>{setSingleEmail(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="learner@example.com" /><span className="mt-1 block font-normal text-slate-500">Exact match only. The preview will show if the account is eligible. Admin and disabled accounts cannot receive trials.</span></label></div> : <div className="px-5 pb-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>Name or email contains<input className={inputClass} maxLength={100} value={filters.q} onChange={e=>changeFilter("q",e.target.value)} placeholder="Search by name or email"/></label>
          {selectField("Authentication provider","authProvider",[["any","Any provider"],["local","Email/password"],["google","Google"],["local_google","Linked email + Google"]])}
          {selectField("Email verification","emailVerified",[["yes","Verified only"],["no","Unverified only"],["any","Any status"]])}
          {selectField("Previous trial","priorTrial",[["never","Never received a trial"],["any","Allow previous recipients"]])}
          {selectField("Subscription eligibility","subscriptionStatus",[["none","No active subscription"],["expired_or_cancelled","Expired or cancelled"],["any","Any (active still excluded)"]])}
          <label className={labelClass}>Registered after<input className={inputClass} type="date" value={filters.registeredAfter} onChange={e=>changeFilter("registeredAfter",e.target.value)}/></label>
          <label className={labelClass}>Registered before<input className={inputClass} type="date" value={filters.registeredBefore} onChange={e=>changeFilter("registeredBefore",e.target.value)}/></label>
        </div>
        <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900" onClick={()=>setShowAdvanced(v=>!v)}><SlidersHorizontal className="h-4 w-4"/>{showAdvanced ? "Hide advanced filters" : "More audience filters"}<span className="text-slate-400">{showAdvanced ? "−" : "+"}</span></button>
        {showAdvanced && <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><strong>Account eligibility</strong><p className="mt-1">Active learner accounts only. Disabled accounts and administrators are always excluded.</p></div>
          <label className={labelClass}>Specific subscription plan<select className={selectClass} value={filters.planId} onChange={e=>changeFilter("planId",e.target.value)}><option value="">Any plan</option>{plans.map(p=><option key={p._id} value={p._id}>{p.name} · {p.currency} {p.price}</option>)}</select></label>
          {selectField("Plan segment","planSegment",[["","Any plan type"],["premium","Highest-priced"],["popular","Popular"],["paid","Paid"],["free","Free"]])}
          {selectField("Subscription expires within","expiresWithinDays",[["","Any expiry"],["7","7 days"],["14","14 days"],["30","30 days"],["60","60 days"],["90","90 days"]])}
          {selectField("Inactive for","inactiveDays",[["","Any activity"],["7","7+ days"],["14","14+ days"],["30","30+ days"],["60","60+ days"],["90","90+ days"]])}
          <label className={labelClass}>Specific course ID<input className={inputClass} value={filters.courseId} onChange={e=>changeFilter("courseId",e.target.value)} placeholder="Paste course ID"/></label>
          {selectField("Enrollment status","enrollmentStatus",[["","Any enrollment"],["active","Active"],["completed","Completed"],["cancelled","Cancelled"]])}
          {selectField("Minimum progress","progressMin",[["","Any progress"],["25","25%+"],["50","50%+"],["75","75%+"],["90","90%+"],["100","100%"]])}
          {selectField("Maximum progress","progressMax",[["","Any progress"],["25","Up to 25%"],["50","Up to 50%"],["75","Up to 75%"],["90","Up to 90%"],["100","Up to 100%"]])}
          {selectField("Minimum paid spend","totalSpendMin",[["","Any spend"],["500","₹500+"],["1000","₹1,000+"],["2500","₹2,500+"],["5000","₹5,000+"],["10000","₹10,000+"],["25000","₹25,000+"]])}
          {selectField("Minimum courses enrolled","courseCountMin",[["","Any count"],["1","1+"],["2","2+"],["3","3+"],["4","4+"],["5","5+"],["10","10+"]])}
          {selectField("Course segment","courseSegment",[["","Any course"],["popular","Top 5 popular"],["paid","Paid courses"],["free","Free courses"],["featured","Featured courses"]])}
          {selectField("Phone verification","phoneVerified",[["any","Any status"],["yes","Verified"],["no","Not verified"]])}
          {selectField("Marketing email consent","marketingConsent",[["any","Any consent"],["yes","Consented"],["no","Not consented"]])}
          {selectField("Profile setup","profileSetup",[["any","Any profile"],["complete","Not skipped"],["skipped","Skipped"],["incomplete","Incomplete"]])}
          <label className={labelClass}>City contains<input className={inputClass} maxLength={100} value={filters.city} onChange={e=>changeFilter("city",e.target.value)} placeholder="e.g. Nashik"/></label>
          <label className={labelClass}>Learning goal contains<input className={inputClass} maxLength={240} value={filters.learningGoal} onChange={e=>changeFilter("learningGoal",e.target.value)} placeholder="e.g. backend development"/></label>
        </div>}
        <p className="mt-3 text-xs text-slate-500">Filters combine together. Admin accounts and learners with an active subscription are always excluded.</p>
      </div>}
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">2. What access should they receive?</h2><p className="mt-1 text-sm text-slate-500">Choose the entitlement plan and enter exactly how many days the trial should last.</p></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className={labelClass}>Trial plan<select className={inputClass} value={planId} onChange={e=>{setPlanId(e.target.value);setPreview(null);setConfirmGrant(false);}}><option value="">Select a plan…</option>{plans.map(p=><option key={p._id} value={p._id}>{p.name} · {p.price===0 ? "Free" : `${p.currency} ${p.price}`} / ${p.billingInterval}</option>)}</select><span className="mt-1 block font-normal text-slate-500">This is the plan the learner will access during the trial.</span></label>
        <label className={labelClass}>Trial duration<input className={inputClass} type="number" min={1} max={30} step={1} value={trialDays} onChange={e=>{setTrialDays(Number(e.target.value));setPreview(null);setConfirmGrant(false);}}/><span className="mt-1 block font-normal text-slate-500">Choose 1–30 days. Access starts when the grant is applied.</span></label>
        <label className={labelClass}>Campaign label<input className={inputClass} value={campaignName} minLength={3} maxLength={120} onChange={e=>{setCampaignName(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="e.g. Support exception — learner trial"/></label>
        <label className={labelClass}>Optional paid conversion offer<select className={inputClass} value={conversionPlanId} onChange={e=>{setConversionPlanId(e.target.value);setPreview(null);setConfirmGrant(false);}}><option value="">No conversion offer</option>{plans.filter(p=>p.price>0&&p.billingInterval!=="one_time").map(p=><option key={p._id} value={p._id}>{p.name} · {p.currency} {p.price}/{p.billingInterval}</option>)}</select><span className="mt-1 block font-normal text-slate-500">Offer only; it never enables autopay or charges the learner.</span></label>
        <label className={`${labelClass} sm:col-span-2`}>Internal reason (required)<textarea className={inputClass} rows={2} minLength={10} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="Record why this learner or group is receiving a trial."/></label>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs text-slate-500">Nothing is granted until you preview and confirm. No payment is initiated.</p><button type="button" className="btn-primary justify-center" onClick={()=>void runPreview()} disabled={loading||!valid}><Users className="h-4 w-4"/>{loading ? "Checking eligibility…" : "Review eligible learner(s)"}</button></div>
    </section>

    {preview && <section className="mt-5 rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-violet-700"/><h2 className="font-bold text-slate-900">3. Review before granting</h2></div><p className="mt-1 text-sm text-slate-500">{targetMode==="single" ? singleEmail.trim() : "Filtered learner group"} · {plans.find(p=>p._id===planId)?.name} · {trialDays} days</p></div><AdminBadge tone="warning">No autopay</AdminBadge></div>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 sm:px-6"><div className="rounded-xl bg-violet-50 p-4"><p className="text-xs font-medium text-violet-700">Eligible</p><p className="mt-1 text-2xl font-bold text-violet-950">{preview.eligibleCount}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-600">Skipped</p><p className="mt-1 text-2xl font-bold text-slate-900">{preview.skippedCount}</p></div><div className="col-span-2 rounded-xl bg-slate-50 p-4 sm:col-span-1"><p className="text-xs font-medium text-slate-600">Duration</p><p className="mt-1 text-2xl font-bold text-slate-900">{trialDays} days</p></div></div>
      {preview.eligible.length>0 && <div className="overflow-x-auto px-5 pb-4 sm:px-6"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="border-b p-3">Learner</th><th className="border-b p-3">Registered</th><th className="border-b p-3">Provider</th><th className="border-b p-3">Email</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.eligible.map(u=><tr key={u.id}><td className="p-3 font-semibold text-slate-900">{u.name||"Learner"}</td><td className="p-3 text-slate-600">{date(u.createdAt)}</td><td className="p-3 text-slate-600">{u.authProvider||"—"}</td><td className="p-3">{u.email}</td></tr>)}</tbody></table></div>}
      {preview.skipped.length>0 && <details className="mx-5 mb-4 rounded-lg border border-slate-200 p-3 sm:mx-6"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Why learners were skipped ({preview.skippedCount})</summary><div className="mt-3 space-y-2">{preview.skipped.map(u=><p key={u.id} className="text-xs text-slate-500">{u.name} · {u.email} — {u.reason}</p>)}</div></details>}
      <div className="border-t border-slate-100 p-5 sm:px-6"><label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmGrant} onChange={e=>setConfirmGrant(e.target.checked)} className="mt-1 h-4 w-4 accent-violet-600"/><span>I confirm granting the <strong>{plans.find(p=>p._id===planId)?.name}</strong> plan for <strong>{trialDays} days</strong> to <strong>{preview.eligibleCount} eligible learner(s)</strong>. This does not authorize recurring payments.</span></label><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-primary" onClick={()=>void applyGrant()} disabled={loading||!confirmGrant||preview.eligibleCount===0}><ShieldCheck className="h-4 w-4"/>Confirm and grant trial</button><button type="button" className="btn-secondary" onClick={()=>{setPreview(null);setConfirmGrant(false);}}>Back to edit</button></div></div>
    </section>}

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Recent trial grants</h2><p className="mt-1 text-sm text-slate-500">Review the latest grants and their conversion-consent state.</p></div>{loading&&!grants.length?<p className="p-8 text-sm text-slate-500">Loading grants…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Learner</th><th className="p-3">Campaign / plan</th><th className="p-3">Trial period</th><th className="p-3">Conversion</th><th className="p-3">Reason</th></tr></thead><tbody className="divide-y divide-slate-100">{grants.map(g=><tr key={g._id}><td className="p-3"><p className="font-semibold">{g.user?.name||"Unknown user"}</p><p className="text-xs text-slate-500">{g.user?.email}</p></td><td className="p-3"><p>{g.campaignName}</p><p className="text-xs text-slate-500">{g.plan?.name||"Plan"}</p></td><td className="p-3 text-xs"><p>{date(g.startsAt)}</p><p>Ends {date(g.endsAt)}</p></td><td className="p-3">{g.conversionPlan?.name||"None"}<p className="text-xs text-slate-500">{g.conversionConsentStatus.replace(/_/g," ")}</p></td><td className="max-w-56 p-3 text-xs text-slate-500">{g.reason}</td></tr>)}</tbody></table>{!grants.length&&<p className="p-8 text-center text-sm text-slate-500">No trial grants yet.</p>}</div>}</section>
  </div>;
}

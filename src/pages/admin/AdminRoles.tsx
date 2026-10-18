import { useEffect, useState } from "react";
import { RefreshCcw, ShieldCheck, Users, Save, LockKeyhole, AlertTriangle } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type AdminRole = { key: string; label: string; description: string; permissions: string[] };
type Administrator = {
  _id: string;
  name: string;
  email: string;
  adminRole: string;
  isActive: boolean;
  emailVerified: boolean;
  effectivePermissions?: string[];
};

export default function AdminRoles() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roleData, adminData] = await Promise.all([
        adminFetch("/api/admin/roles"),
        adminFetch("/api/admin/administrators"),
      ]);
      const roleList = roleData.roles || [];
      const adminList = adminData.administrators || [];
      setRoles(roleList);
      setAdministrators(adminList);
      setSelectedRoles(Object.fromEntries(adminList.map((admin: Administrator) => [
        admin._id,
        selectedRoles[admin._id] || admin.adminRole || "platform_admin",
      ])));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load administrator access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveRole(admin: Administrator) {
    const adminRole = selectedRoles[admin._id] || admin.adminRole;
    if (adminRole === admin.adminRole) return;
    const reason = (reasonById[admin._id] || "").trim();
    if (!reason) {
      setError("Add a reason before changing an administrator role.");
      return;
    }
    setSavingId(admin._id);
    setError("");
    setNotice("");
    try {
      await adminFetch("/api/admin/administrators/" + admin._id + "/role", {
        method: "PUT",
        body: JSON.stringify({ adminRole, reason }),
      });
      setNotice("Role updated for " + admin.email + ".");
      setReasonById((current) => ({ ...current, [admin._id]: "" }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update administrator role.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Access governance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Administrator roles</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Assign least-privilege role profiles. Changes are enforced by the API and recorded in the audit log.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Available administrator role profiles">
        {roles.map((role) => (
          <article key={role.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><LockKeyhole className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900">{role.label}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">{role.description}</p>
              </div>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{role.permissions.length} permissions</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {role.permissions.slice(0, 5).map((permission) => (
                <span key={permission} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{permission}</span>
              ))}
              {role.permissions.length > 5 && <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">+{role.permissions.length - 5} more</span>}
            </div>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="rounded-xl bg-slate-100 p-2"><Users className="h-5 w-5 text-slate-700" /></div>
          <div>
            <h2 className="font-semibold text-slate-950">Administrator directory</h2>
            <p className="text-sm text-slate-500">Only existing admin accounts can be assigned a profile. This screen does not promote students to administrators.</p>
          </div>
        </div>
        {loading ? (
          <div role="status" className="p-8 text-center text-sm text-slate-500">Loading administrator access…</div>
        ) : administrators.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No administrator accounts found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {administrators.map((admin) => {
              const selected = selectedRoles[admin._id] || admin.adminRole || "platform_admin";
              const changed = selected !== (admin.adminRole || "platform_admin");
              return (
                <article key={admin._id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_minmax(220px,1fr)_auto] lg:items-end">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{admin.name}</p>
                    <p className="truncate text-sm text-slate-500">{admin.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={"rounded-full px-2 py-1 font-medium " + (admin.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{admin.isActive ? "Active" : "Inactive"}</span>
                      <span className={"rounded-full px-2 py-1 font-medium " + (admin.emailVerified ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>{admin.emailVerified ? "Email verified" : "Email unverified"}</span>
                    </div>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    Role profile
                    <select value={selected} onChange={(event) => setSelectedRoles((current) => ({ ...current, [admin._id]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                      {roles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Change reason
                    <input value={reasonById[admin._id] || ""} onChange={(event) => setReasonById((current) => ({ ...current, [admin._id]: event.target.value }))} maxLength={500} placeholder="Why is this access changing?" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                  </label>
                  <button type="button" onClick={() => void saveRole(admin)} disabled={!changed || !reasonById[admin._id]?.trim() || savingId === admin._id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">
                    <Save className="h-4 w-4" /> {savingId === admin._id ? "Saving…" : "Save role"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Role changes take effect on the next API request. The last active Super Admin cannot be demoted, and administrators cannot change their own role from this screen.</p>
      </div>
    </div>
  );
}

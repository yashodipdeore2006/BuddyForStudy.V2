import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCcw,
  Search,
  Shield,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

const pageSize = 20;

function statusClass(active: boolean) {
  return active
    ? "bg-green-50 text-green-700"
    : "bg-red-50 text-red-700";
}

export default function AdminUsersPro() {
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, pages: 1, total: 0 });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [authProvider, setAuthProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load(page = 1) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (role) params.set("role", role);
      if (authProvider) params.set("authProvider", authProvider);

      const data = await adminFetch("/api/admin/users?" + params.toString());
      setUsers(data.users || []);
      setPagination(data.pagination || { page, pages: 1, total: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function toggleUser(user: any) {
    setSavingId(user._id);
    setError("");
    try {
      await adminFetch("/api/admin/users/" + user._id, {
        method: "PUT",
        body: JSON.stringify({
          isActive: !user.isActive,
          reason: user.isActive ? "Admin disabled account" : "Admin re-enabled account",
        }),
      });
      await load(pagination.page || 1);
      if (selected?._id === user._id) {
        setSelected({ ...selected, isActive: !user.isActive });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user");
    } finally {
      setSavingId(null);
    }
  }

  async function openUser(userId: string) {
    setDetailLoading(true);
    setSelected(null);
    try {
      const data = await adminFetch("/api/admin/users/" + userId);
      setSelected(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load user details");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Identity & access</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">User Management</h1>
          <p className="mt-2 text-slate-500">
            Search, inspect and control accounts, roles, verification and access status.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load(pagination.page || 1)}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="card mt-6 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input-field pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load(1)}
              placeholder="Search name or email"
            />
          </div>
          <select className="input-field" value={status} onChange={(e) => { setStatus(e.target.value); void load(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <select className="input-field" value={role} onChange={(e) => { setRole(e.target.value); void load(1); }}>
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <select className="input-field" value={authProvider} onChange={(e) => { setAuthProvider(e.target.value); void load(1); }}>
            <option value="">All sign-in methods</option>
            <option value="local">Email & password</option>
            <option value="google">Google</option>
            <option value="local_google">Email + Google</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{pagination.total || 0} users</span>
          <span>Page {pagination.page || 1} of {pagination.pages || 1}</span>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="card mt-6 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-5 py-3 text-left">Access</th>
                  <th className="px-5 py-3 text-left">Verification</th>
                  <th className="px-5 py-3 text-left">Provider</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                          {user.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{user.name}</p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={"badge " + statusClass(Boolean(user.isActive))}>
                          {user.isActive ? "Active" : "Disabled"}
                        </span>
                        {user.role === "admin" && (
                          <span className="badge bg-purple-50 text-purple-700"><Shield className="mr-1 h-3 w-3 inline" />Admin</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold capitalize text-slate-600">
                      {user.authProvider === "local_google" ? "Email + Google" : user.authProvider === "google" ? "Google" : "Email + password"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-secondary text-xs" onClick={() => void openUser(user._id)}>
                          <Eye className="h-4 w-4" /> View
                        </button>
                        <button
                          type="button"
                          className={user.isActive ? "btn-secondary text-xs" : "btn-primary text-xs"}
                          onClick={() => void toggleUser(user)}
                          disabled={savingId === user._id || user.role === "admin"}
                        >
                          {savingId === user._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={5} className="p-12 text-center text-sm text-slate-500">No users match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={(pagination.page || 1) <= 1 || loading}
            onClick={() => void load((pagination.page || 1) - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-xs font-semibold text-slate-500">Page {pagination.page || 1} / {pagination.pages || 1}</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={(pagination.page || 1) >= (pagination.pages || 1) || loading}
            onClick={() => void load((pagination.page || 1) + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-8 shadow-xl"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/30 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">User details</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-950">{selected.user?.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.user?.email}</p>
              </div>
              <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Role</p><p className="mt-1 font-bold capitalize">{selected.user?.role}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Sign-in</p><p className="mt-1 font-bold">{selected.user?.authProvider}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-bold">{selected.user?.isActive ? "Active" : "Disabled"}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Email</p><p className="mt-1 font-bold">{selected.user?.emailVerified ? "Verified" : "Unverified"}</p></div>
            </div>

            <section className="mt-6">
              <h3 className="font-bold text-slate-900">Subscription</h3>
              <div className="mt-2 rounded-xl border border-slate-200 p-4 text-sm">
                {selected.subscription ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>{selected.subscription.plan?.name || "Plan"}</span>
                    <span className="badge bg-blue-50 text-blue-700">{selected.subscription.status}</span>
                  </div>
                ) : <p className="text-slate-500">No active subscription.</p>}
              </div>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Enrollments</h3>
                <span className="text-xs font-semibold text-slate-400">{selected.enrollments?.length || 0}</span>
              </div>
              <div className="mt-2 space-y-2">
                {(selected.enrollments || []).slice(0, 10).map((enrollment: any) => (
                  <div key={enrollment._id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold">{enrollment.course?.title || "Course"}</p>
                    <p className="mt-1 text-xs text-slate-500">{enrollment.status}</p>
                  </div>
                ))}
                {!selected.enrollments?.length && <p className="text-sm text-slate-500">No enrollments.</p>}
              </div>
            </section>

            <section className="mt-6">
              <h3 className="font-bold text-slate-900">Recent payments</h3>
              <div className="mt-2 space-y-2">
                {(selected.payments || []).slice(0, 8).map((payment: any) => (
                  <div key={payment._id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                    <div><p className="text-sm font-semibold">₹{Number(payment.amount || 0).toLocaleString("en-IN")}</p><p className="text-xs text-slate-500">{payment.provider}</p></div>
                    <span className="text-xs font-bold uppercase text-slate-500">{payment.status}</span>
                  </div>
                ))}
                {!selected.payments?.length && <p className="text-sm text-slate-500">No payments.</p>}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

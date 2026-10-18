import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ArrowUpDown,
  Eye,
  RefreshCcw,
  Search,
  Shield,
  UserCheck,
  UserX,
  Users,
  X,
  BookOpen,
  Plus,
  Minus,
  ShieldCheck,
  Save,
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { useAuth } from "@/context/AuthContext";
import { AdminConfirmDialog, AdminEmptyState, AdminFilterBar, AdminPageHeader, AdminPagination, AdminSkeleton, AdminTableContainer } from "@/components/admin/AdminUI";

type SavedUserView = { id: string; name: string; q: string; status: string; role: string; authProvider: string; pageSize: number; density: "compact" | "comfortable"; sortBy: string; sortOrder: "asc" | "desc" };

function statusClass(active: boolean) {
  return active
    ? "bg-green-50 text-green-700"
    : "bg-red-50 text-red-700";
}

export default function AdminUsersPro() {
  const { session } = useAuth();
  const savedViewStorageKey = "bfs-admin-users-views:" + (session?.user.email || "administrator");
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: Number(searchParams.get("page")) || 1, pages: 1, total: 0 });
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [role, setRole] = useState(searchParams.get("role") || "");
  const [authProvider, setAuthProvider] = useState(searchParams.get("authProvider") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(searchParams.get("sortOrder") === "desc" ? "desc" : "asc");
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("limit") || 25);
    return [25, 50, 100].includes(value) ? value : 25;
  });
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [savedViews, setSavedViews] = useState<SavedUserView[]>(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(savedViewStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item): item is SavedUserView => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.q === "string" && typeof item.status === "string" && typeof item.role === "string" && typeof item.authProvider === "string" && [25, 50, 100].includes(item.pageSize) && ["compact", "comfortable"].includes(item.density) && ["asc", "desc"].includes(item.sortOrder) && typeof item.sortBy === "string") : [];
    } catch {
      return [];
    }
  });
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const userDrawerRef = useRef<HTMLElement>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [courseAccess, setCourseAccess] = useState<any[]>([]);
  const [courseAccessLoading, setCourseAccessLoading] = useState(false);
  const [courseActionId, setCourseActionId] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseReason, setCourseReason] = useState("");
  const [pendingCourseAction, setPendingCourseAction] = useState<any>(null);
  const [confirmationValue, setConfirmationValue] = useState("");
  const [featureOverrides, setFeatureOverrides] = useState<any[]>([]);
  const [featureChoices, setFeatureChoices] = useState<Record<string, string>>({});
  const [featureOverrideReason, setFeatureOverrideReason] = useState("");
  const [featureOverrideExpiresAt, setFeatureOverrideExpiresAt] = useState("");
  const [savingFeatureKey, setSavingFeatureKey] = useState<string | null>(null);

  async function load(page = 1, filters = { q: debouncedQ, status, role, authProvider, sortBy, sortOrder }, limit = pageSize) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);
      if (filters.role) params.set("role", filters.role);
      if (filters.authProvider) params.set("authProvider", filters.authProvider);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      const detailId = searchParams.get("id");
      if (detailId) params.set("id", detailId);
      setSearchParams(params, { replace: true });

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
    try {
      window.localStorage.setItem(savedViewStorageKey, JSON.stringify(savedViews));
    } catch {
      // Saved views remain usable for this session when storage is unavailable.
    }
  }, [savedViewStorageKey, savedViews]);

  function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = viewName.trim();
    if (!name) {
      setError("Enter a name for this saved view.");
      return;
    }
    if (savedViews.some((view) => view.name.toLowerCase() === name.toLowerCase())) {
      setError("A saved view with that name already exists.");
      return;
    }
    if (savedViews.length >= 8) {
      setError("You can save up to 8 user views. Remove one before saving another.");
      return;
    }
    const saved: SavedUserView = {
      id: String(Date.now()),
      name,
      q: debouncedQ,
      status,
      role,
      authProvider,
      pageSize,
      density,
      sortBy,
      sortOrder,
    };
    setSavedViews((current) => [...current, saved]);
    setViewName("");
    setShowSaveView(false);
    setError("");
  }

  function applySavedView(view: SavedUserView) {
    setQ(view.q);
    setDebouncedQ(view.q);
    setStatus(view.status);
    setRole(view.role);
    setAuthProvider(view.authProvider);
    setPageSize(view.pageSize);
    setDensity(view.density);
    setSortBy(view.sortBy || "createdAt");
    setSortOrder(view.sortOrder === "asc" ? "asc" : "desc");
    setPage(1);
  }

  function removeSavedView(id: string) {
    setSavedViews((current) => current.filter((view) => view.id !== id));
  }

  function toggleSort(field: string) {
    if (sortBy === field) setSortOrder((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = q.trim();
      if (nextQuery !== debouncedQ) setPage(1);
      setDebouncedQ(nextQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, debouncedQ]);

  useEffect(() => {
    void load(page, { q: debouncedQ, status, role, authProvider, sortBy, sortOrder }, pageSize);
  }, [page, debouncedQ, status, role, authProvider, pageSize, sortBy, sortOrder]);

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
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("id", userId);
    setSearchParams(nextParams, { replace: true });
    setDetailLoading(true);
    setSelected(null);
    setCourseAccess([]);
    setCourseAccessLoading(true);
    setCourseSearch("");
    setCourseReason("");
    try {
      const [data, courseData, overrideData] = await Promise.all([
        adminFetch("/api/admin/users/" + userId),
        adminFetch("/api/admin/users/" + userId + "/courses"),
        adminFetch("/api/admin/users/" + userId + "/feature-overrides"),
      ]);
      setSelected(data);
      setCourseAccess(courseData.courses || []);
      setFeatureOverrides(overrideData.features || []);
      setFeatureChoices({});
      setFeatureOverrideReason("");
      setFeatureOverrideExpiresAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load user details");
    } finally {
      setDetailLoading(false);
      setCourseAccessLoading(false);
    }
  }

  function closeUserDrawer() {
    setSelected(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("id");
    setSearchParams(nextParams, { replace: true });
  }

  const selectedUserId = selected?.user?._id as string | undefined;
  useEffect(() => {
    if (!selectedUserId) return;
    const container = userDrawerRef.current;
    if (!container) return;
    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeUserDrawer(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedUserId]);

  useEffect(() => {
    const requestedUserId = searchParams.get("id");
    if (requestedUserId) void openUser(requestedUserId);
  }, []);

  async function saveFeatureOverride(feature: any) {
    if (!selected?.user?._id) return;
    const choice = featureChoices[feature.key] ?? (feature.override ? (feature.override.allowed ? "allow" : "deny") : "plan");
    if ((choice !== "plan" || feature.override) && !featureOverrideReason.trim()) {
      setError("Enter a reason before changing feature access.");
      return;
    }
    setSavingFeatureKey(feature.key);
    setError("");
    try {
      const endpoint = `/api/admin/users/${selected.user._id}/feature-overrides/${feature.key}`;
      if (choice === "plan") {
        if (!feature.override) {
          return;
        }
        await adminFetch(endpoint, {
          method: "DELETE",
          body: JSON.stringify({ reason: featureOverrideReason.trim() })
        });
      } else {
        await adminFetch(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            allowed: choice === "allow",
            expiresAt: featureOverrideExpiresAt ? new Date(featureOverrideExpiresAt + "T23:59:59.999Z").toISOString() : null,
            reason: featureOverrideReason.trim()
          })
        });
      }
      const refreshed = await adminFetch(`/api/admin/users/${selected.user._id}/feature-overrides`);
      setFeatureOverrides(refreshed.features || []);
      setFeatureChoices((current) => ({ ...current, [feature.key]: choice }));
      setFeatureOverrideReason("");
      setFeatureOverrideExpiresAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update feature access");
    } finally {
      setSavingFeatureKey(null);
    }
  }

  async function changeCourseAccess(course: any, confirmed = false) {
    if (!selected?.user?._id || !course?._id) return;
    const currentlyHasAccess = ["active", "completed"].includes(course.enrollment?.status);
    const reason = courseReason.trim();
    if (!reason) {
      setError("Enter a reason before changing course access.");
      return;
    }
    const action = currentlyHasAccess ? "remove" : "grant";
    if (!confirmed) {
      setPendingCourseAction(course);
      setConfirmationValue("");
      return;
    }
    setCourseActionId(String(course._id));
    setError("");
    try {
      const endpoint = `/api/admin/users/${selected.user._id}/courses/${course._id}`;
      if (currentlyHasAccess) {
        await adminFetch(endpoint, { method: "DELETE", body: JSON.stringify({ reason }) });
      } else {
        await adminFetch(endpoint, { method: "POST", body: JSON.stringify({ reason }) });
      }
      const refreshed = await adminFetch(`/api/admin/users/${selected.user._id}/courses`);
      setCourseAccess(refreshed.courses || []);
      const detail = await adminFetch(`/api/admin/users/${selected.user._id}`);
      setSelected(detail);
      setCourseReason("");
      setPendingCourseAction(null);
      setConfirmationValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : `Unable to ${action} course access`);
    } finally {
      setCourseActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Identity and access"
        title="Users"
        description="Search, inspect and control accounts, roles, verification and access status."
        actions={<button type="button" aria-label="Refresh users" className="btn-secondary" onClick={() => void load(pagination.page || 1)} disabled={loading}>
          <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </button>}
      />

      <div className="admin-saved-views" aria-label="Quick and saved user views">
        <button type="button" className="admin-saved-view" aria-pressed={!status && !role && !authProvider && !debouncedQ} onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setPage(1); }}>All users</button>
        <button type="button" className="admin-saved-view" aria-pressed={status === "active" && !role && !authProvider} onClick={() => { setStatus("active"); setRole(""); setAuthProvider(""); setPage(1); }}>Active</button>
        <button type="button" className="admin-saved-view" aria-pressed={status === "disabled" && !role && !authProvider} onClick={() => { setStatus("disabled"); setRole(""); setAuthProvider(""); setPage(1); }}>Disabled</button>
        <button type="button" className="admin-saved-view" aria-pressed={role === "admin"} onClick={() => { setRole("admin"); setStatus(""); setPage(1); }}>Administrators</button>
        {savedViews.map((view) => <span className="admin-saved-view-item" key={view.id}>
          <button type="button" className="admin-saved-view" aria-pressed={q === view.q && status === view.status && role === view.role && authProvider === view.authProvider && pageSize === view.pageSize && density === view.density} onClick={() => applySavedView(view)}>{view.name}</button>
          <button type="button" className="admin-saved-view-remove" aria-label={"Delete saved view " + view.name} title={"Delete saved view " + view.name} onClick={() => removeSavedView(view.id)}><X size={12} /></button>
        </span>)}
        <button type="button" className="admin-saved-view admin-saved-view--action" onClick={() => setShowSaveView((value) => !value)}>+ Save current view</button>
        <button type="button" className="admin-saved-view" aria-pressed={Boolean(debouncedQ || status || role || authProvider)} onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setPage(1); }}>Clear filters</button>
      </div>
      {showSaveView && <form className="admin-save-view-form" onSubmit={saveCurrentView}>
        <label htmlFor="admin-save-user-view">View name</label>
        <input id="admin-save-user-view" className="input-field" value={viewName} maxLength={40} onChange={(event) => setViewName(event.target.value)} placeholder="e.g. Unverified administrators" required />
        <button type="submit" className="btn-primary">Save view</button>
        <button type="button" className="btn-secondary" onClick={() => { setShowSaveView(false); setViewName(""); }}>Cancel</button>
      </form>}
      <AdminFilterBar className="card mt-6 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search users by name or email"
              type="search"
              className="input-field pl-10"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
            />
          </div>
          <select aria-label="Filter users by account status" className="input-field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <select aria-label="Filter users by role" className="input-field" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <select aria-label="Filter users by sign-in method" className="input-field" value={authProvider} onChange={(e) => { setAuthProvider(e.target.value); setPage(1); }}>
            <option value="">All sign-in methods</option>
            <option value="local">Email & password</option>
            <option value="google">Google</option>
            <option value="local_google">Email + Google</option>
          </select>
        </div>
        <div className="admin-filter-toolbar">
          {(q || status || role || authProvider) && <button type="button" className="admin-filter-reset" onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setPage(1); }}>Reset filters</button>}
          <span className="admin-filter-toolbar-spacer" />
          <label className="admin-page-size">Density
            <select aria-label="Table density" className="input-field" value={density} onChange={(event) => setDensity(event.target.value as "compact" | "comfortable")}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select>
          </label>
        </div>
        <div className="admin-filter-summary">
          <div className="admin-active-filter-chips" aria-label="Active filters">
            {debouncedQ && <button type="button" className="admin-filter-chip" onClick={() => setQ("")}>Search: {debouncedQ}<X size={13} aria-hidden="true" /></button>}
            {status && <button type="button" className="admin-filter-chip" onClick={() => setStatus("")}>Status: {status}<X size={13} aria-hidden="true" /></button>}
            {role && <button type="button" className="admin-filter-chip" onClick={() => setRole("")}>Role: {role}<X size={13} aria-hidden="true" /></button>}
            {authProvider && <button type="button" className="admin-filter-chip" onClick={() => setAuthProvider("")}>Provider: {authProvider}<X size={13} aria-hidden="true" /></button>}
          </div>
          <span>{pagination.total || 0} results</span>
        </div>
      </AdminFilterBar>

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="card mt-6 overflow-hidden">
        {loading ? (
          <div className="admin-table-skeleton" role="status" aria-live="polite" aria-label="Loading users"><AdminSkeleton rows={8} /></div>
        ) : (
          <AdminTableContainer>
            <table className={"w-full text-sm admin-users-table admin-users-table--" + density}>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" aria-sort={sortBy === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-3 text-left"><button type="button" className="admin-sort-button" onClick={() => toggleSort("name")}>User <span aria-hidden="true">{sortBy === "name" ? (sortOrder === "asc" ? "↑" : "↓") : <ArrowUpDown size={13} />}</span></button></th>
                  <th scope="col" aria-sort={sortBy === "status" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-3 text-left"><button type="button" className="admin-sort-button" onClick={() => toggleSort("status")}>Access <span aria-hidden="true">{sortBy === "status" ? (sortOrder === "asc" ? "↑" : "↓") : <ArrowUpDown size={13} />}</span></button></th>
                  <th scope="col" aria-sort={sortBy === "verification" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-3 text-left"><button type="button" className="admin-sort-button" onClick={() => toggleSort("verification")}>Verification <span aria-hidden="true">{sortBy === "verification" ? (sortOrder === "asc" ? "↑" : "↓") : <ArrowUpDown size={13} />}</span></button></th>
                  <th scope="col" aria-sort={sortBy === "authProvider" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-3 text-left"><button type="button" className="admin-sort-button" onClick={() => toggleSort("authProvider")}>Provider <span aria-hidden="true">{sortBy === "authProvider" ? (sortOrder === "asc" ? "↑" : "↓") : <ArrowUpDown size={13} />}</span></button></th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
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
                {!users.length && <tr><td role="status" aria-live="polite" colSpan={5} className="p-0"><AdminEmptyState title={pagination.total ? "No users match these filters" : "No users yet"} description={pagination.total ? "Clear one or more filters and try again." : "User accounts will appear here after people register."} action={Boolean(debouncedQ || status || role || authProvider) ? <button type="button" className="btn-secondary" onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); }}>Clear filters</button> : undefined} icon={<Users size={28} />} /></td></tr>}
              </tbody>
            </table>
          </AdminTableContainer>
        )}

        <AdminPagination
          page={pagination.page || 1}
          pages={pagination.pages || 1}
          total={pagination.total || 0}
          from={users.length ? ((pagination.page || 1) - 1) * pageSize + 1 : 0}
          to={Math.min((pagination.page || 1) * pageSize, pagination.total || 0)}
          limit={pageSize}
          loading={loading}
          onPageChange={setPage}
          onLimitChange={(limit) => { setPageSize(limit); setPage(1); }}
        />
      </div>

      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-8 shadow-xl"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/30 backdrop-blur-sm" onClick={closeUserDrawer}>
          <aside ref={userDrawerRef} role="dialog" aria-modal="true" aria-labelledby="admin-user-detail-title" className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">User details</p>
                <h2 id="admin-user-detail-title" className="mt-1 text-2xl font-extrabold text-slate-950">{selected.user?.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.user?.email}</p>
              </div>
              <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={closeUserDrawer}><X className="h-5 w-5" /></button>
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
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900">Feature access overrides</h3>
                  <p className="mt-1 text-xs text-slate-500">Temporarily or indefinitely allow/deny subscription features for this learner. Paid-course purchase checks remain separate.</p>
                </div>
              </div>
              <label className="mb-1 mt-3 block text-xs font-semibold text-slate-600" htmlFor="feature-override-reason">Reason required for audit</label>
              <textarea id="feature-override-reason" className="input-field min-h-20 w-full" maxLength={500} value={featureOverrideReason} onChange={(e) => setFeatureOverrideReason(e.target.value)} placeholder="e.g. Support-approved access while a billing issue is investigated" />
              <label className="mb-1 mt-3 block text-xs font-semibold text-slate-600" htmlFor="feature-override-expiry">Override expiry (optional)</label>
              <input id="feature-override-expiry" type="date" className="input-field w-full" min={new Date().toISOString().slice(0, 10)} value={featureOverrideExpiresAt} onChange={(e) => setFeatureOverrideExpiresAt(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Leave blank for no expiry. Expired overrides automatically stop applying.</p>
              <div className="mt-3 space-y-2">
                {featureOverrides.map((feature: any) => {
                  const choice = featureChoices[feature.key] ?? (feature.override ? (feature.override.allowed ? "allow" : "deny") : "plan");
                  return <div key={feature.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{feature.key}{feature.override ? ` · Override ${feature.override.allowed ? "allows" : "denies"} access${feature.override.expiresAt ? ` until ${new Date(feature.override.expiresAt).toLocaleDateString()}` : " · no expiry"}` : " · Plan default"}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <select aria-label={`Feature access for ${feature.label}`} className="input-field w-auto text-xs" value={choice} onChange={(e) => setFeatureChoices((current) => ({ ...current, [feature.key]: e.target.value }))}>
                          <option value="plan">Use plan</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                        <button type="button" className="btn-secondary text-xs" disabled={savingFeatureKey === feature.key || (choice === "plan" && !feature.override)} onClick={() => void saveFeatureOverride(feature)}>
                          {savingFeatureKey === feature.key ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>;
                })}
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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">Individual course access</h3>
                  <p className="mt-1 text-xs text-slate-500">Grant or remove a specific course for this user. Changes are recorded in the audit log.</p>
                </div>
                <span className="badge bg-blue-50 text-blue-700">{courseAccess.filter((course) => ["active", "completed"].includes(course.enrollment?.status)).length} active</span>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="course-access-reason">Reason required for audit</label>
                <textarea id="course-access-reason" className="input-field min-h-20 w-full" maxLength={500} value={courseReason} onChange={(e) => setCourseReason(e.target.value)} placeholder="e.g. Support-approved complimentary access" />
                <label className="sr-only" htmlFor="course-access-search">Search courses</label>
                <div className="relative mt-3"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="course-access-search" className="input-field pl-10" value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} placeholder="Search published courses" /></div>
              </div>
              <div className="mt-3 space-y-2">
                {courseAccessLoading ? <div className="p-5 text-center text-sm text-slate-500"><RefreshCcw className="mx-auto animate-spin" /></div> : courseAccess.filter((course) => `${course.title} ${course.category} ${course.slug}`.toLowerCase().includes(courseSearch.toLowerCase())).map((course) => {
                  const hasAccess = ["active", "completed"].includes(course.enrollment?.status);
                  const isPaid = course.pricing?.mode === "paid";
                  return <div key={course._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{course.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{course.category || "Course"} · {isPaid ? "Paid course" : "Free course"} · {course.enrollment?.accessSource === "admin" ? "Admin grant" : course.hasVerifiedPayment ? "Payment verified" : course.enrollment ? "Enrollment" : "Not assigned"}</p>
                      {course.enrollment?.status === "completed" && <p className="mt-1 text-xs text-emerald-700">Completed enrollment</p>}
                    </div>
                    <button type="button" className={hasAccess ? "btn-secondary shrink-0 text-xs" : "btn-primary shrink-0 text-xs"} disabled={courseActionId === course._id} onClick={() => void changeCourseAccess(course)}>
                      {courseActionId === course._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : hasAccess ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {hasAccess ? "Remove" : "Grant"}
                    </button>
                  </div>;
                })}
                {!courseAccessLoading && !courseAccess.filter((course) => `${course.title} ${course.category} ${course.slug}`.toLowerCase().includes(courseSearch.toLowerCase())).length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No published courses match this search.</p>}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Removing access cancels this enrollment only. It does not delete the course or alter payment/refund records. Granting access does not create a purchase or receipt.</p>
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
      <AdminConfirmDialog
        open={Boolean(pendingCourseAction)}
        title={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status) ? "Remove course access?" : "Grant course access?") : "Confirm course access"}
        description={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status)
          ? `This removes ${pendingCourseAction.title} from ${selected?.user?.name || "this user"}. Payment and refund records remain unchanged.`
          : `This grants ${pendingCourseAction.title} to ${selected?.user?.name || "this user"} without creating a payment or receipt.`) : ""}
        confirmLabel={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status) ? "Remove course access" : "Grant course access") : "Confirm"}
        requiredText={pendingCourseAction?.title}
        value={confirmationValue}
        onValueChange={setConfirmationValue}
        onConfirm={() => { if (pendingCourseAction) void changeCourseAccess(pendingCourseAction, true); }}
        onClose={() => { setPendingCourseAction(null); setConfirmationValue(""); }}
        loading={Boolean(pendingCourseAction && courseActionId === String(pendingCourseAction._id))}
        danger={Boolean(pendingCourseAction && ["active", "completed"].includes(pendingCourseAction.enrollment?.status))}
      />
    </div>
  );
}

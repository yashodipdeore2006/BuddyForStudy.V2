import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Eye,
  RefreshCcw,
  Search,
  UserCheck,
  UserX,
  Users,
  Plus,
  Minus,
  ShieldCheck,
  Save,
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { useAuth } from "@/context/AuthContext";
import { AdminBadge, AdminButton, AdminEmptyState, AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { SavedViews, type SavedViewRecord } from "@/components/admin/SavedViews";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { TypedConfirmDialog } from "@/components/admin/TypedConfirmDialog";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { MoneyCell } from "@/components/admin/MoneyCell";
import { PiiCell } from "@/components/admin/PiiCell";

function csvCell(value: unknown) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function AdminUsersPro() {
  const { session } = useAuth();
  const savedViewStorageKey = "bfs-admin-users-views:" + (session?.user.email || "administrator");
  const [searchParams, setSearchParams] = useSearchParams();
  const usersRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportReason, setExportReason] = useState("");
  const [exportConfirmationValue, setExportConfirmationValue] = useState("");
  const [exportError, setExportError] = useState("");
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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["access", "verification", "provider"]);
  const [savedViews, setSavedViews] = useState<SavedViewRecord[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const canManageUsers = permissions.includes("users.manage");
  const canRevealPii = permissions.includes("users.pii.reveal");
  const canManageSavedViews = permissions.includes("saved_views.manage");
  const [savedViewsLoading, setSavedViewsLoading] = useState(false);
  const [savedViewsError, setSavedViewsError] = useState("");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingUserAction, setPendingUserAction] = useState<any>(null);
  const [adminActionReason, setAdminActionReason] = useState("");
  const [userConfirmationValue, setUserConfirmationValue] = useState("");
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
    const requestId = ++usersRequestId.current;
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
      if (requestId !== usersRequestId.current) return;
      setUsers(data.users || []);
      setPagination(data.pagination || { page, pages: 1, total: 0 });
    } catch (e) {
      if (requestId === usersRequestId.current) {
        setError(e instanceof Error ? e.message : "Unable to load users");
      }
    } finally {
      if (requestId === usersRequestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void adminFetch("/api/admin/access").then((data) => {
      if (!cancelled) setPermissions(Array.isArray(data.access?.permissions) ? data.access.permissions : []);
    }).catch(() => { if (!cancelled) setPermissions([]); })
      .finally(() => { if (!cancelled) setPermissionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function revealUserEmail(userId: string, reason: string): Promise<string> {
    const data = await adminFetch("/api/admin/users/" + userId + "/pii-reveal", {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (typeof data.email !== "string" || !data.email) throw new Error("The server did not return an email address.");
    return data.email;
  }

  async function refreshSavedViews() {
    setSavedViewsLoading(true);
    setSavedViewsError("");
    try {
      const data = await adminFetch("/api/admin/saved-views?pageKey=users&page=1&limit=100");
      setSavedViews((data.items || []) as SavedViewRecord[]);
    } catch (e) {
      setSavedViewsError(e instanceof Error ? e.message : "Unable to load saved views.");
    } finally {
      setSavedViewsLoading(false);
    }
  }

  async function loadAndImportSavedViews() {
    await refreshSavedViews();
    try {
      const raw = window.localStorage.getItem(savedViewStorageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const current = await adminFetch("/api/admin/saved-views?pageKey=users&page=1&limit=100");
      const names = new Set<string>((current.items || []).map((view: SavedViewRecord) => view.name.toLowerCase()));
      let importFailed = false;
      for (const legacy of parsed) {
        if (!legacy || typeof legacy !== "object") continue;
        const view = legacy as Record<string, unknown>;
        if (typeof view.name !== "string" || !view.name.trim() || typeof view.q !== "string" ||
          typeof view.status !== "string" || typeof view.role !== "string" || typeof view.authProvider !== "string" ||
          ![25, 50, 100].includes(Number(view.pageSize)) ||
          !["compact", "comfortable"].includes(String(view.density)) ||
          !["asc", "desc"].includes(String(view.sortOrder)) || typeof view.sortBy !== "string" ||
          !Array.isArray(view.columns)) continue;
        const name = view.name.trim();
        if (names.has(name.toLowerCase())) continue;
        const payload = {
          page: "users",
          name,
          filters: { q: view.q, status: view.status, role: view.role, authProvider: view.authProvider, pageSize: Number(view.pageSize) },
          columns: view.columns.filter((column): column is string => typeof column === "string" && ["access", "verification", "provider"].includes(column)),
          sort: { sortBy: view.sortBy, sortOrder: view.sortOrder },
          density: view.density,
          shared: false
        };
        try {
          await adminFetch("/api/admin/saved-views", { method: "POST", body: JSON.stringify(payload) });
          names.add(name.toLowerCase());
        } catch {
          importFailed = true;
        }
      }
      if (!importFailed) window.localStorage.removeItem(savedViewStorageKey);
      await refreshSavedViews();
      if (importFailed) setSavedViewsError("Some saved views could not be imported. Existing browser-saved views have been kept.");
    } catch {
      setSavedViewsError("Some saved views could not be imported. Existing browser-saved views have been kept.");
    }
  }

  useEffect(() => {
    if (!permissionsLoading && canManageSavedViews) void loadAndImportSavedViews();
  }, [savedViewStorageKey, permissionsLoading, canManageSavedViews]);

  async function createSavedView(payload: Omit<SavedViewRecord, "id" | "owner" | "canManage" | "createdAt" | "updatedAt">) {
    setSavedViewsError("");
    try {
      await adminFetch("/api/admin/saved-views", { method: "POST", body: JSON.stringify(payload) });
      await refreshSavedViews();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save this view.";
      setSavedViewsError(message);
      throw e;
    }
  }

  async function removeSavedView(view: SavedViewRecord) {
    if (view.canManage === false) return;
    setSavedViewsError("");
    try {
      await adminFetch("/api/admin/saved-views/" + view.id, { method: "DELETE" });
      setSavedViews((current) => current.filter((item) => item.id !== view.id));
      if (activeSavedViewId === view.id) setActiveSavedViewId(null);
    } catch (e) {
      setSavedViewsError(e instanceof Error ? e.message : "Unable to delete this view.");
    }
  }

  function applySavedView(view: SavedViewRecord) {
    const filters = view.filters || {};
    const sort = view.sort || {};
    setQ(String(filters.q || ""));
    setDebouncedQ(String(filters.q || ""));
    setStatus(String(filters.status || ""));
    setRole(String(filters.role || ""));
    setAuthProvider(String(filters.authProvider || ""));
    const savedLimit = Number(filters.pageSize || 25);
    setPageSize([25, 50, 100].includes(savedLimit) ? savedLimit : 25);
    setDensity(view.density === "compact" ? "compact" : "comfortable");
    setSortBy(String(sort.sortBy || "name"));
    setSortOrder(sort.sortOrder === "desc" ? "desc" : "asc");
    setVisibleColumns(Array.isArray(view.columns) ? view.columns.filter((column) => ["access", "verification", "provider"].includes(column)) : ["access", "verification", "provider"]);
    setActiveSavedViewId(view.id);
    setPage(1);
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

  useEffect(() => {
    // Bulk selection is scoped to the visible result page. Clear it when
    // pagination or the result shape changes so stale IDs cannot be exported.
    setSelectedIds([]);
  }, [page, pageSize, debouncedQ, status, role, authProvider, sortBy, sortOrder]);

  useEffect(() => {
    const urlPage = Number(searchParams.get("page") || 1);
    const urlLimit = Number(searchParams.get("limit") || 25);
    setPage(Number.isInteger(urlPage) && urlPage > 0 ? urlPage : 1);
    setQ(searchParams.get("q") || "");
    setDebouncedQ(searchParams.get("q") || "");
    setStatus(searchParams.get("status") || "");
    setRole(searchParams.get("role") || "");
    setAuthProvider(searchParams.get("authProvider") || "");
    setSortBy(searchParams.get("sortBy") || "name");
    setSortOrder(searchParams.get("sortOrder") === "desc" ? "desc" : "asc");
    setPageSize([25, 50, 100].includes(urlLimit) ? urlLimit : 25);
  }, [searchParams]);

  async function toggleUser(user: any, confirmed = false, reason = "") {
    if (!canManageUsers) {
      setError("You do not have permission to change user accounts.");
      return;
    }
    if (!confirmed) {
      setPendingUserAction(user);
      setAdminActionReason("");
      setUserConfirmationValue("");
      return;
    }
    setSavingId(user._id);
    setError("");
    try {
      await adminFetch("/api/admin/users/" + user._id, {
        method: "PUT",
        body: JSON.stringify({
          isActive: !user.isActive,
          reason: reason.trim(),
        }),
      });
      await load(pagination.page || 1);
      if (selected?.user?._id === user._id) {
        setSelected({ ...selected, user: { ...selected.user, isActive: !user.isActive } });
      }
      setPendingUserAction(null);
      setAdminActionReason("");
      setUserConfirmationValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user");
    } finally {
      setSavingId(null);
    }
  }

  async function exportSelectedUsers(confirmed = false) {
    if (!canRevealPii) {
      setError("Exporting full email addresses requires PII access permission.");
      return;
    }
    if (!selectedIds.length || exporting) return;
    if (!confirmed) {
      setExportDialogOpen(true);
      setExportReason("");
      setExportConfirmationValue("");
      setExportError("");
      return;
    }
    const reason = exportReason.trim();
    const confirmationPhrase = "EXPORT " + selectedIds.length + " USERS";
    if (reason.length < 10 || reason.length > 500) {
      setExportError("Enter an export reason between 10 and 500 characters.");
      return;
    }
    if (exportConfirmationValue.trim() !== confirmationPhrase) {
      setExportError("Type the exact export confirmation phrase to continue.");
      return;
    }

    setExporting(true);
    setError("");
    setExportError("");
    try {
      const result = await adminFetch("/api/admin/users/export", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, sortBy, sortOrder, reason }),
      });
      const fields = ["name", "email", "role", "isActive", "emailVerified", "authProvider", "createdAt"] as const;
      const headings = ["Name", "Email", "Role", "Active", "Email verified", "Authentication provider", "Created at"];
      const rows = [headings, ...((result.users || []) as any[]).map((user) => fields.map((field) => user[field]))];
      const csv = rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "buddyforstudy-users-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSelectedIds([]);
      setExportDialogOpen(false);
      setExportReason("");
      setExportConfirmationValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to export selected users.";
      setExportError(message);
      setError(message);
    } finally {
      setExporting(false);
    }
  }

  async function openUser(userId: string) {
    const requestId = ++detailRequestId.current;
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
      if (requestId !== detailRequestId.current) return;
      setSelected(data);
      setCourseAccess(courseData.courses || []);
      setFeatureOverrides(overrideData.features || []);
      setFeatureChoices({});
      setFeatureOverrideReason("");
      setFeatureOverrideExpiresAt("");
    } catch (e) {
      if (requestId === detailRequestId.current) {
        setError(e instanceof Error ? e.message : "Unable to load user details");
      }
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false);
        setCourseAccessLoading(false);
      }
    }
  }

  useEffect(() => {
    const detailId = searchParams.get("id");
    if (detailId && selected?.user?._id !== detailId && !detailLoading) {
      void openUser(detailId);
    }
  }, [searchParams, selected?.user?._id, detailLoading]);

  function closeUserDrawer() {
    detailRequestId.current += 1;
    setDetailLoading(false);
    setCourseAccessLoading(false);
    setSelected(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("id");
    setSearchParams(nextParams, { replace: true });
  }

  async function saveFeatureOverride(feature: any) {
    if (!canManageUsers) {
      setError("You do not have permission to change feature access.");
      return;
    }
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
    if (!canManageUsers) {
      setError("You do not have permission to change individual course access.");
      return;
    }
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

  const userColumns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      render: (user) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="admin-user-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            {user.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.name || "Unnamed user"}</p>
            <p className="admin-user-email truncate"><PiiCell value={undefined} maskedValue={user.emailMasked} identityKey={String(user._id)} kind="email" canReveal={canRevealPii} onReveal={(reason) => revealUserEmail(String(user._id), reason)} /></p>
          </div>
        </div>
      ),
    },
    ...(visibleColumns.includes("access") ? [{
      key: "status",
      header: "Access",
      sortable: true,
      render: (user: any) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="user" value={Boolean(user.isActive)} />
          {user.role === "admin" && <StatusBadge domain="enrollmentSource" value="admin" label="Admin" />}
        </div>
      ),
    } satisfies DataTableColumn<any>] : []),
    ...(visibleColumns.includes("verification") ? [{
      key: "verification",
      header: "Verification",
      sortable: true,
      render: (user: any) => <AdminBadge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Verified" : "Pending"}</AdminBadge>,
    } satisfies DataTableColumn<any>] : []),
    ...(visibleColumns.includes("provider") ? [{
      key: "authProvider",
      header: "Provider",
      sortable: true,
      render: (user: any) => (
        <span className="admin-user-provider capitalize">
          {user.authProvider === "local_google" ? "Email + Google" : user.authProvider === "google" ? "Google" : "Email + password"}
        </span>
      ),
    } satisfies DataTableColumn<any>] : []),
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (user) => (
        <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <AdminButton size="sm" variant="secondary" onClick={() => void openUser(user._id)}>
            <Eye className="h-4 w-4" /> View
          </AdminButton>
          {canManageUsers && <AdminButton
            size="sm"
            variant={user.isActive ? "secondary" : "primary"}
            onClick={() => void toggleUser(user)}
            disabled={savingId === user._id || user.role === "admin"}
            loading={savingId === user._id}
            title={user.role === "admin" ? "Administrator accounts cannot be disabled here" : undefined}
          >
            {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {user.isActive ? "Disable" : "Enable"}
          </AdminButton>}
        </div>
      ),
    },
  ];

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
      {!permissionsLoading && !canManageUsers && <div role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Read-only user access. Account status, feature overrides and individual course-access changes are hidden because your role does not have user-management permission.</div>}

      <div className="admin-saved-views" aria-label="Quick and saved user views">
        <button type="button" className="admin-saved-view" aria-pressed={!status && !role && !authProvider && !debouncedQ} onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}>All users</button>
        <button type="button" className="admin-saved-view" aria-pressed={status === "active" && !role && !authProvider} onClick={() => { setStatus("active"); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}>Active</button>
        <button type="button" className="admin-saved-view" aria-pressed={status === "disabled" && !role && !authProvider} onClick={() => { setStatus("disabled"); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}>Disabled</button>
        <button type="button" className="admin-saved-view" aria-pressed={role === "admin"} onClick={() => { setRole("admin"); setStatus(""); setActiveSavedViewId(null); setPage(1); }}>Administrators</button>
        <button type="button" className="admin-saved-view" aria-pressed={Boolean(debouncedQ || status || role || authProvider)} onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}>Clear filters</button>
        {canManageSavedViews && <SavedViews
          page="users"
          views={savedViews}
          activeId={activeSavedViewId}
          loading={savedViewsLoading}
          error={savedViewsError}
          currentView={{ filters: { q: debouncedQ, status, role, authProvider, pageSize }, columns: visibleColumns, sort: { sortBy, sortOrder }, density }}
          onApply={applySavedView}
          onCreate={createSavedView}
          onDelete={removeSavedView}
        />}
      </div>
      <FilterBar
        className="admin-card mt-6 p-4"
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search users by name or email"
        debounceMs={0}
        chips={[
          ...(debouncedQ ? [{ key: "q", label: "Search: " + debouncedQ, onRemove: () => setQ("") }] : []),
          ...(status ? [{ key: "status", label: "Status: " + status, onRemove: () => { setStatus(""); setPage(1); } }] : []),
          ...(role ? [{ key: "role", label: "Role: " + role, onRemove: () => { setRole(""); setPage(1); } }] : []),
          ...(authProvider ? [{ key: "authProvider", label: "Provider: " + authProvider, onRemove: () => { setAuthProvider(""); setPage(1); } }] : []),
        ]}
        onReset={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}
        resultCount={pagination.total || 0}
      >
        <div className="admin-filter-toolbar">
          <label className="admin-page-size">Status
            <select aria-label="Filter users by account status" className="input-field" value={status} onChange={(event) => { setStatus(event.target.value); setActiveSavedViewId(null); setPage(1); }}>
              <option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="admin-page-size">Role
            <select aria-label="Filter users by role" className="input-field" value={role} onChange={(event) => { setRole(event.target.value); setActiveSavedViewId(null); setPage(1); }}>
              <option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option>
            </select>
          </label>
          <label className="admin-page-size">Sign-in method
            <select aria-label="Filter users by sign-in method" className="input-field" value={authProvider} onChange={(event) => { setAuthProvider(event.target.value); setActiveSavedViewId(null); setPage(1); }}>
              <option value="">All sign-in methods</option><option value="local">Email &amp; password</option><option value="google">Google</option><option value="local_google">Email + Google</option>
            </select>
          </label>
          <span className="admin-filter-toolbar-spacer" />
          <label className="admin-page-size">Density
            <select aria-label="Table density" className="input-field" value={density} onChange={(event) => setDensity(event.target.value as "compact" | "comfortable")}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select>
          </label>
          <details className="admin-column-chooser">
            <summary>Columns</summary>
            <div className="admin-column-chooser-menu">
              {[
                ["access", "Access"],
                ["verification", "Verification"],
                ["provider", "Provider"],
              ].map(([key, label]) => <label key={key} className="admin-column-choice"><input type="checkbox" checked={visibleColumns.includes(key)} onChange={(event) => setVisibleColumns((current) => event.target.checked ? [...current, key] : current.filter((column) => column !== key))} />{label}</label>)}
            </div>
          </details>
        </div>
      </FilterBar>

      {canRevealPii && selectedIds.length > 0 && <div className="admin-bulk-action-bar" role="toolbar" aria-label="Selected user actions">
        <span><strong>{selectedIds.length}</strong> selected on this page</span>
        <div className="admin-bulk-action-buttons">
          <AdminButton variant="ghost" onClick={() => setSelectedIds([])} disabled={exporting}>Clear selection</AdminButton>
          <AdminButton variant="primary" loading={exporting} onClick={() => void exportSelectedUsers()}>Export selected ({selectedIds.length})</AdminButton>
        </div>
      </div>}

      <DataTable<any>
        rows={users}
        columns={userColumns}
        tableProps={{ "aria-label": "Users" }}
        rowKey={(user) => String(user._id)}
        onRowClick={(user) => void openUser(String(user._id))}
        selectedIds={canRevealPii ? selectedIds : []}
        onSelectionChange={canRevealPii ? setSelectedIds : undefined}
        density={density}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={toggleSort}
        loading={loading && users.length === 0}
        refreshing={loading && users.length > 0}
        error={error ? <span>{error}</span> : undefined}
        empty={<AdminEmptyState
          title={debouncedQ || status || role || authProvider ? "No users match these filters" : "No users yet"}
          description={debouncedQ || status || role || authProvider ? "Clear one or more filters and try again." : "User accounts will appear here after people register."}
          action={debouncedQ || status || role || authProvider ? <AdminButton variant="secondary" onClick={() => { setQ(""); setDebouncedQ(""); setStatus(""); setRole(""); setAuthProvider(""); setActiveSavedViewId(null); setPage(1); }}>Clear filters</AdminButton> : undefined}
          icon={<Users size={28} />}
        />}
        pagination={<AdminPagination
          page={pagination.page || 1}
          pages={pagination.pages || 1}
          total={pagination.total || 0}
          from={users.length ? ((pagination.page || 1) - 1) * pageSize + 1 : 0}
          to={Math.min((pagination.page || 1) * pageSize, pagination.total || 0)}
          limit={pageSize}
          loading={loading}
          onPageChange={setPage}
          onLimitChange={(limit) => { setPageSize(limit); setPage(1); }}
        />}
      />

      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-8 shadow-xl"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div>
        </div>
      )}

      {selected && (
        <DetailDrawer open={Boolean(selected)} title={selected.user?.name || "User details"} subtitle={<PiiCell key={String(selected.user?._id || "selected-user-email")} value={undefined} maskedValue={selected.user?.emailMasked} identityKey={String(selected.user?._id || "selected-user-email")} kind="email" canReveal={canRevealPii} onReveal={(reason) => revealUserEmail(String(selected.user?._id), reason)} />} onClose={closeUserDrawer}>
            {!canManageUsers && <div role="status" className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Read-only view. You can inspect account, subscription, feature and course-access records, but cannot change them with your current role.</div>}
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
                    <StatusBadge domain="subscription" value={selected.subscription.status} />
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
              {canManageUsers && <>
              <label className="mb-1 mt-3 block text-xs font-semibold text-slate-600" htmlFor="feature-override-reason">Reason required for audit</label>
              <textarea id="feature-override-reason" className="input-field min-h-20 w-full" maxLength={500} value={featureOverrideReason} onChange={(e) => setFeatureOverrideReason(e.target.value)} placeholder="e.g. Support-approved access while a billing issue is investigated" />
              <label className="mb-1 mt-3 block text-xs font-semibold text-slate-600" htmlFor="feature-override-expiry">Override expiry (optional)</label>
              <input id="feature-override-expiry" type="date" className="input-field w-full" min={new Date().toISOString().slice(0, 10)} value={featureOverrideExpiresAt} onChange={(e) => setFeatureOverrideExpiresAt(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Leave blank for no expiry. Expired overrides automatically stop applying.</p>
              </>}
              <div className="mt-3 space-y-2">
                {featureOverrides.map((feature: any) => {
                  const choice = featureChoices[feature.key] ?? (feature.override ? (feature.override.allowed ? "allow" : "deny") : "plan");
                  return <div key={feature.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{feature.key}{feature.override ? ` · Override ${feature.override.allowed ? "allows" : "denies"} access${feature.override.expiresAt ? ` until ${new Date(feature.override.expiresAt).toLocaleDateString()}` : " · no expiry"}` : " · Plan default"}</p>
                      </div>
                      {canManageUsers ? <div className="flex shrink-0 gap-2">
                        <select aria-label={`Feature access for ${feature.label}`} className="input-field w-auto text-xs" value={choice} onChange={(e) => setFeatureChoices((current) => ({ ...current, [feature.key]: e.target.value }))}>
                          <option value="plan">Use plan</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                        <button type="button" className="btn-secondary text-xs" disabled={savingFeatureKey === feature.key || (choice === "plan" && !feature.override)} onClick={() => void saveFeatureOverride(feature)}>
                          {savingFeatureKey === feature.key ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                      </div> : <span className="text-xs text-slate-500">Read only</span>}
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
                    <p className="mt-1 text-xs text-slate-500"><StatusBadge domain="enrollment" value={enrollment.status} /></p>
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
                {canManageUsers && <>
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="course-access-reason">Reason required for audit</label>
                <textarea id="course-access-reason" className="input-field min-h-20 w-full" maxLength={500} value={courseReason} onChange={(e) => setCourseReason(e.target.value)} placeholder="e.g. Support-approved complimentary access" />
                </>}
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
                    {canManageUsers && <button type="button" className={hasAccess ? "btn-secondary shrink-0 text-xs" : "btn-primary shrink-0 text-xs"} disabled={courseActionId === course._id} onClick={() => void changeCourseAccess(course)}>
                      {courseActionId === course._id ? <RefreshCcw className="h-4 w-4 animate-spin" /> : hasAccess ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {hasAccess ? "Remove" : "Grant"}
                    </button>}
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
                    <div><p className="text-sm font-semibold"><MoneyCell amount={payment.amount} currency={payment.currency || "INR"} /></p><p className="text-xs text-slate-500">{payment.provider}</p></div>
                    <StatusBadge domain="payment" value={payment.status} />
                  </div>
                ))}
                {!selected.payments?.length && <p className="text-sm text-slate-500">No payments.</p>}
              </div>
            </section>
        </DetailDrawer>
      )}
      <TypedConfirmDialog
        open={Boolean(exportDialogOpen && canRevealPii && selectedIds.length)}
        title="Export selected user records?"
        description={`This creates a CSV containing full email addresses and account metadata for ${selectedIds.length} selected user(s). The export is recorded in the audit log.`}
        consequence={exportError ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p> : "Treat the downloaded file as confidential personal data and store it only in an approved location."}
        confirmLabel="Export user CSV"
        requiredText={"EXPORT " + selectedIds.length + " USERS"}
        value={exportConfirmationValue}
        onValueChange={setExportConfirmationValue}
        reason={exportReason}
        onReasonChange={(value) => { setExportReason(value); setExportError(""); }}
        reasonRequired
        onConfirm={() => { void exportSelectedUsers(true); }}
        onClose={() => {
          if (!exporting) {
            setExportDialogOpen(false);
            setExportReason("");
            setExportConfirmationValue("");
            setExportError("");
          }
        }}
        loading={exporting}
        danger={false}
      />
      <TypedConfirmDialog
        open={Boolean(canManageUsers && pendingUserAction)}
        title={pendingUserAction?.isActive ? "Disable user account?" : "Re-enable user account?"}
        description={pendingUserAction?.isActive
          ? "This blocks the user from accessing BuddyForStudy. The action and your reason will be written to the audit log."
          : "This restores the user’s account access. The action and your reason will be written to the audit log."}
        confirmLabel={pendingUserAction?.isActive ? "Disable account" : "Re-enable account"}
        requiredText={pendingUserAction?.isActive ? pendingUserAction.email : undefined}
        value={userConfirmationValue}
        onValueChange={setUserConfirmationValue}
        reason={adminActionReason}
        onReasonChange={setAdminActionReason}
        reasonRequired
        onConfirm={() => { if (pendingUserAction) void toggleUser(pendingUserAction, true, adminActionReason); }}
        onClose={() => { setPendingUserAction(null); setAdminActionReason(""); setUserConfirmationValue(""); }}
        loading={Boolean(pendingUserAction && savingId === String(pendingUserAction._id))}
        danger={Boolean(pendingUserAction?.isActive)}
      />
      <TypedConfirmDialog
        open={Boolean(canManageUsers && pendingCourseAction)}
        title={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status) ? "Remove course access?" : "Grant course access?") : "Confirm course access"}
        description={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status)
          ? `This removes ${pendingCourseAction.title} from ${selected?.user?.name || "this user"}. Payment and refund records remain unchanged.`
          : `This grants ${pendingCourseAction.title} to ${selected?.user?.name || "this user"} without creating a payment or receipt.`) : ""}
        confirmLabel={pendingCourseAction ? (["active", "completed"].includes(pendingCourseAction.enrollment?.status) ? "Remove course access" : "Grant course access") : "Confirm"}
        requiredText={pendingCourseAction?.title}
        value={confirmationValue}
        onValueChange={setConfirmationValue}
        reason={courseReason}
        onReasonChange={setCourseReason}
        onConfirm={() => { if (pendingCourseAction) void changeCourseAccess(pendingCourseAction, true); }}
        onClose={() => { setPendingCourseAction(null); setConfirmationValue(""); }}
        loading={Boolean(pendingCourseAction && courseActionId === String(pendingCourseAction._id))}
        danger={Boolean(pendingCourseAction && ["active", "completed"].includes(pendingCourseAction.enrollment?.status))}
      />
    </div>
  );
}

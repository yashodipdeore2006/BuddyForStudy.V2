import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowUpRight, Bell, BookOpen, ChevronDown, CircleHelp,
  CreditCard, ExternalLink, LayoutDashboard, LogOut, Menu,
  Megaphone, Moon, Plus, Search, Settings, ShieldCheck, Sun, Tag,
  Users, X, BrainCircuit, Headset, ScrollText, PanelLeftClose, PanelLeftOpen, ServerCog,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminFetch } from "@/lib/adminApi";
import { AdminButton, AdminIconButton } from "@/components/admin/AdminUI";

type Permission = { adminRole: string; roleLabel: string; permissions: string[] };
type AdminLink = {
  to: string;
  label: string;
  permission: string;
  group: "Overview" | "Manage" | "Insights" | "Settings";
  icon: typeof LayoutDashboard;
  description: string;
};
type CommandItem = { to: string; label: string; description: string; icon: typeof LayoutDashboard; kind: "Recent" | "Page" | "Action" };

const links: AdminLink[] = [
  { to: "/admin", label: "Dashboard", permission: "dashboard.read", group: "Overview", icon: LayoutDashboard, description: "Platform overview and operations" },
  { to: "/admin/users", label: "Users", permission: "users.read", group: "Manage", icon: Users, description: "Accounts, roles and access" },
  { to: "/admin/courses", label: "Courses", permission: "courses.read", group: "Manage", icon: BookOpen, description: "Courses and learning content" },
  { to: "/admin/content-quality", label: "Content quality", permission: "courses.read", group: "Manage", icon: BookOpen, description: "AI review, revisions, moderation and link health" },
  { to: "/admin/support", label: "Support cases", permission: "payment_issues.manage", group: "Manage", icon: Headset, description: "Resolve learner support issues" },
  { to: "/admin/operations", label: "System operations", permission: "operations.read", group: "Manage", icon: ServerCog, description: "Health, queues, webhooks, alerts and delivery logs" },
  { to: "/admin/analytics", label: "Analytics", permission: "analytics.read", group: "Insights", icon: Activity, description: "Platform performance and revenue" },
  { to: "/admin/plans", label: "Plans and pricing", permission: "plans.read", group: "Settings", icon: CreditCard, description: "Subscription plans and entitlements" },
  { to: "/admin/billing", label: "Billing and refunds", permission: "refunds.manage", group: "Settings", icon: CreditCard, description: "Payments, refunds and disputes" },
  { to: "/admin/subscriptions", label: "Subscriptions", permission: "billing.read", group: "Settings", icon: CreditCard, description: "Subscriber status and billing periods" },
  { to: "/admin/ai-content", label: "AI and content", permission: "ai.manage", group: "Settings", icon: BrainCircuit, description: "AI content controls" },
  { to: "/admin/communications", label: "Communications", permission: "communications.send", group: "Settings", icon: Megaphone, description: "Announcements and notifications" },
  { to: "/admin/coupons", label: "Coupons", permission: "coupons.read", group: "Settings", icon: Tag, description: "Promotions and coupon rules" },
  { to: "/admin/audit", label: "Audit log", permission: "audit.read", group: "Settings", icon: ScrollText, description: "Sensitive actions and accountability" },
  { to: "/admin/settings", label: "Platform settings", permission: "settings.read", group: "Settings", icon: Settings, description: "Platform configuration" },
  { to: "/admin/roles", label: "Administrator roles", permission: "admin_roles.manage", group: "Settings", icon: ShieldCheck, description: "Administrator access and invitations" },
];

const groupOrder: AdminLink["group"][] = ["Overview", "Manage", "Insights", "Settings"];
const routeLabels: Record<string, string> = { ...Object.fromEntries(links.map((item) => [item.to, item.label])), "/admin/design-system": "Admin design system" };
const quickActions = [
  { to: "/admin/courses", label: "Open course management", description: "Create and update learning content", permission: "courses.read", icon: BookOpen },
  { to: "/admin/plans", label: "Open subscription plans", description: "Manage pricing and entitlements", permission: "plans.read", icon: CreditCard },
  { to: "/admin/coupons", label: "Open coupons and promotions", description: "Manage discount rules", permission: "coupons.read", icon: Tag },
  { to: "/admin/communications", label: "Compose communication", description: "Create an announcement or message", permission: "communications.send", icon: Megaphone },
  { to: "/admin/roles", label: "Invite administrator", description: "Invite a teammate with scoped access", permission: "admin_roles.manage", icon: Users },
];

function savedBoolean(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function savedTheme() {
  try {
    const value = window.localStorage.getItem("bfs-admin-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    // Use the system preference when storage is unavailable.
  }
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initials(name?: string) {
  return (name || "Administrator").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center">
        <div role="status" aria-live="polite" className="flex items-center gap-3">
          <span className="admin-loading-spinner" aria-hidden="true" />
          <span>Checking administrator access…</span>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const { session, signOut } = useAuth();
  const userKey = session?.user.email || "administrator";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [access, setAccess] = useState<Permission | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [recentPaths, setRecentPaths] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem("bfs-admin-recent-pages:" + userKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === "string").slice(0, 5) : [];
    } catch { return []; }
  });
  const [collapsed, setCollapsed] = useState(() => savedBoolean("bfs-admin-sidebar-collapsed:" + userKey, false));
  const [theme, setTheme] = useState<"light" | "dark">(savedTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const commandInput = useRef<HTMLInputElement>(null);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const commandWasOpen = useRef(false);
  const commandDialog = useRef<HTMLDivElement>(null);
  const helpDialog = useRef<HTMLElement>(null);
  const mobileSidebar = useRef<HTMLElement>(null);
  const gShortcutAt = useRef(0);
  const userMenu = useRef<HTMLDivElement>(null);
  const quickMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setAccessLoading(true);
    void adminFetch("/api/admin/access")
      .then((data) => { if (!cancelled) setAccess(data.access || null); })
      .catch(() => { if (!cancelled) setAccess(null); })
      .finally(() => { if (!cancelled) setAccessLoading(false); });
    return () => { cancelled = true; };
  }, [userKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem("bfs-admin-sidebar-collapsed:" + userKey, String(collapsed));
      window.localStorage.setItem("bfs-admin-theme", theme);
    } catch {
      // Preferences remain active for this session if storage is unavailable.
    }
  }, [collapsed, theme]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const permissions = access?.permissions || [];
  const visibleLinks = useMemo(() => links.filter((item) => permissions.includes(item.permission)), [permissions]);
  const visibleQuickActions = useMemo(() => quickActions.filter((item) => permissions.includes(item.permission)), [permissions]);
  const matchingCommands = useMemo<CommandItem[]>(() => {
    const recentItems = visibleLinks.filter((item) => recentPaths.includes(item.to));
    const recentCommands: CommandItem[] = query.trim() ? [] : recentPaths.flatMap((path) => {
      const item = recentItems.find((candidate) => candidate.to === path);
      return item ? [{ to: item.to, label: item.label, description: item.description, icon: item.icon, kind: "Recent" as const }] : [];
    });
    const commands: CommandItem[] = [
      ...recentCommands,
      ...visibleLinks.filter((item) => query.trim() || !recentPaths.includes(item.to)).map((item) => ({ to: item.to, label: item.label, description: item.description, icon: item.icon, kind: "Page" as const })),
      ...(permissions.includes("settings.read") && (query.trim() || !recentPaths.includes("/admin/design-system")) ? [{ to: "/admin/design-system", label: "Admin design system", description: "Preview tokens and shared components", icon: Settings, kind: "Page" as const }] : []),
      ...visibleQuickActions.map((item) => ({ to: item.to, label: item.label, description: item.description, icon: item.icon, kind: "Action" as const })),
    ];
    const search = query.trim().toLowerCase();
    return commands.filter((item) => (item.label + " " + item.description + " " + item.to).toLowerCase().includes(search));
  }, [query, visibleLinks, visibleQuickActions, permissions, recentPaths]);

  useEffect(() => {
    setActiveResult(0);
  }, [query]);

  useEffect(() => {
    if (commandOpen) {
      commandWasOpen.current = true;
      window.requestAnimationFrame(() => commandInput.current?.focus());
    } else if (commandWasOpen.current) {
      commandWasOpen.current = false;
      commandTrigger.current?.focus();
    }
  }, [commandOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        setHelpOpen(false);
        setQuickOpen(false);
        setUserMenuOpen(false);
        return;
      }
      if (event.key === "Escape") {
        setMobileOpen(false);
        setCommandOpen(false);
        setHelpOpen(false);
        setQuickOpen(false);
        setUserMenuOpen(false);
        return;
      }
      if (commandOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveResult((index) => matchingCommands.length ? (index + 1) % matchingCommands.length : 0);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveResult((index) => matchingCommands.length ? (index - 1 + matchingCommands.length) % matchingCommands.length : 0);
        } else if (event.key === "Enter" && matchingCommands[activeResult]) {
          event.preventDefault();
          nav(matchingCommands[activeResult].to);
          setCommandOpen(false);
          setQuery("");
        } else if (event.key === "Tab" && commandDialog.current) {
          const focusable = Array.from(commandDialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        return;
      }
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "/" && !typing) {
        const search = document.querySelector<HTMLElement>(".admin-content input[type='search'], .admin-content input[placeholder*='Search'], .admin-content input[aria-label*='Search']");
        if (search) { event.preventDefault(); search.focus(); }
      }
      if (event.key.toLowerCase() === "g") {
        gShortcutAt.current = Date.now();
      } else if (Date.now() - gShortcutAt.current < 1200) {
        const destinations: Record<string, string> = { d: "/admin", u: "/admin/users", c: "/admin/courses", o: "/admin/billing" };
        const destination = destinations[event.key.toLowerCase()];
        if (destination && visibleLinks.some((item) => item.to === destination)) {
          event.preventDefault();
          nav(destination);
        }
        gShortcutAt.current = 0;
      } else if (event.key.toLowerCase() === "n") {
        setQuickOpen(true);
        setUserMenuOpen(false);
      } else if (event.key === "?" && !typing) {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandOpen, helpOpen, quickOpen, userMenuOpen, matchingCommands, activeResult, nav, visibleLinks]);

  useEffect(() => {
    try {
      window.localStorage.setItem("bfs-admin-recent-pages:" + userKey, JSON.stringify(recentPaths.slice(0, 5)));
    } catch {
      // Recent-page history is an optional convenience.
    }
  }, [recentPaths, userKey]);

  useEffect(() => {
    if (!visibleLinks.some((item) => item.to === location.pathname)) return;
    setRecentPaths((current) => [location.pathname, ...current.filter((path) => path !== location.pathname)].slice(0, 5));
  }, [location.pathname, visibleLinks]);

  useEffect(() => {
    setMobileOpen(false);
    setQuickOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const container = mobileOpen ? mobileSidebar.current : helpOpen ? helpDialog.current : null;
    if (!container) return;
    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobileOpen) setMobileOpen(false);
        if (helpOpen) setHelpOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [mobileOpen, helpOpen]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (quickMenu.current && !quickMenu.current.contains(target)) setQuickOpen(false);
      if (userMenu.current && !userMenu.current.contains(target)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const pathEntry = visibleLinks.find((item) => item.to === location.pathname)
    || links.find((item) => item.to === location.pathname)
    || visibleLinks.find((item) => item.to !== "/admin" && location.pathname.startsWith(item.to + "/"));
  const currentLabel = pathEntry?.label || routeLabels[location.pathname] || "Admin";
  const requiredPermission = links.find((item) => item.to === location.pathname)?.permission
    || (location.pathname === "/admin/roles" ? "admin_roles.manage" : location.pathname === "/admin/design-system" ? "settings.read" : undefined);
  const production = import.meta.env.MODE === "production";

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    nav("/login", { replace: true });
  };

  const renderNavigation = (mobile = false) => (
    <nav aria-label="Admin navigation" className="admin-nav-scroll">
      {groupOrder.map((group) => {
        const groupLinks = visibleLinks.filter((item) => item.group === group);
        if (!groupLinks.length) return null;
        return (
          <div className="admin-nav-group" key={group}>
            <p className="admin-nav-heading">{group}</p>
            {groupLinks.map(({ to, label, icon: Icon, description }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/admin"}
                onClick={() => { setMobileOpen(false); setCommandOpen(false); }}
                title={collapsed && !mobile ? label : undefined}
                className="admin-nav-link"
                aria-label={collapsed && !mobile ? label : undefined}
              >
                <Icon aria-hidden="true" />
                <span className="admin-nav-link-label">{label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
      {mobile && (
        <div className="admin-nav-group">
          <p className="admin-nav-heading">Workspace</p>
          <Link to="/" className="admin-nav-link" onClick={() => setMobileOpen(false)}><ExternalLink aria-hidden="true" /><span className="admin-nav-link-label">View learner site</span></Link>
          <button type="button" className="admin-nav-link w-full" onClick={() => void handleSignOut()}><LogOut aria-hidden="true" /><span className="admin-nav-link-label">Sign out</span></button>
        </div>
      )}
    </nav>
  );

  return (
    <div className={["admin-shell", collapsed ? "admin-shell--collapsed" : ""].filter(Boolean).join(" ")} data-admin-theme={theme}>
      <a href="#admin-main-content" className="admin-skip-link">Skip to main content</a>

      <aside className="admin-sidebar" aria-label="Administrator workspace">
        <Link to="/admin" className="admin-brand" aria-label="BuddyForStudy admin home">
          <span className="admin-brand-mark"><ShieldCheck size={18} aria-hidden="true" /></span>
          <span className="admin-brand-copy">
            <span className="admin-brand-title">BuddyForStudy</span>
            <span className="admin-brand-caption">Admin control center</span>
          </span>
        </Link>
        {renderNavigation()}
        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <span className="admin-avatar" aria-hidden="true">{initials(session?.user.name)}</span>
            <span className="admin-sidebar-user-copy">
              <strong>{session?.user.name || "Administrator"}</strong>
              <span>{access?.roleLabel || "Administrator"}</span>
            </span>
          </div>
          <div className="admin-sidebar-footer-actions">
            <AdminIconButton label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </AdminIconButton>
            <Link to="/" className="admin-icon-button" aria-label="Open learner site" title="Open learner site"><ExternalLink size={16} /></Link>
            <AdminIconButton label="Sign out" onClick={() => void handleSignOut()}><LogOut size={16} /></AdminIconButton>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <AdminIconButton className="admin-mobile-menu" label="Open admin navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></AdminIconButton>
            <AdminIconButton className="admin-desktop-sidebar-toggle" label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </AdminIconButton>
            <button ref={commandTrigger} type="button" className="admin-search-trigger" onClick={() => setCommandOpen(true)} aria-label="Search pages and actions">
              <Search size={16} aria-hidden="true" /><span>Search pages and actions</span><kbd>Ctrl K</kbd>
            </button>
          </div>
          <div className="admin-topbar-actions">
            <span className={"admin-env-label " + (production ? "" : "admin-env-label--staging")}>{production ? "Production" : "Staging"}</span>
            {access?.roleLabel && <span className="admin-role-label"><ShieldCheck size={13} aria-hidden="true" />{access.roleLabel}</span>}
            <div className="admin-popover-anchor" ref={quickMenu}>
              <AdminIconButton label="Quick actions" aria-expanded={quickOpen} onClick={() => { setQuickOpen((value) => !value); setUserMenuOpen(false); }}><Plus size={18} /></AdminIconButton>
              {quickOpen && <div className="admin-popover" role="menu" aria-label="Quick actions">
                <p className="admin-popover-heading">Quick actions</p>
                {visibleQuickActions.map(({ to, label, icon: Icon }) => <Link key={to} to={to} role="menuitem" className="admin-popover-item" onClick={() => setQuickOpen(false)}><Icon size={16} /><span>{label}</span><ArrowUpRight size={13} className="admin-popover-trailing" /></Link>)}
                {!visibleQuickActions.length && <p className="admin-popover-empty">No quick actions are available for your role.</p>}
              </div>}
            </div>
            <AdminIconButton label="Keyboard shortcuts and help" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></AdminIconButton>
            <Link to="/admin/audit" className="admin-icon-button" aria-label="Review audit activity" title="Review audit activity"><Bell size={17} /></Link>
            <AdminIconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </AdminIconButton>
            <div className="admin-popover-anchor" ref={userMenu}>
              <button type="button" className="admin-topbar-user" aria-expanded={userMenuOpen} onClick={() => { setUserMenuOpen((value) => !value); setQuickOpen(false); }}>
                <span className="admin-avatar" aria-hidden="true">{initials(session?.user.name)}</span>
                <span className="admin-topbar-user-name">{session?.user.name || "Administrator"}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {userMenuOpen && <div className="admin-popover" role="menu" aria-label="Administrator menu">
                <div className="admin-popover-profile"><strong>{session?.user.name || "Administrator"}</strong><span>{session?.user.email || ""}</span><span>{access?.roleLabel || "Administrator"}</span></div>
                <div className="admin-popover-divider" />
                <Link to="/admin/settings" role="menuitem" className="admin-popover-item" onClick={() => setUserMenuOpen(false)}><Settings size={16} />Platform settings</Link>
                <button type="button" role="menuitem" className="admin-popover-item admin-popover-item--danger" onClick={() => void handleSignOut()}><LogOut size={16} />Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        {!online && <div className="admin-offline-banner" role="status"><Activity size={16} />You’re offline. Changes may not save until you reconnect.</div>}

        <div className="admin-content">
          <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/admin">Admin</Link>
            {location.pathname !== "/admin" && <><span aria-hidden="true">/</span><span aria-current="page">{currentLabel}</span></>}
          </nav>

          {accessLoading ? (
            <div role="status" aria-live="polite" className="admin-shell-status"><span className="admin-loading-spinner" aria-hidden="true" />Loading administrator permissions…</div>
          ) : !access ? (
            <div role="alert" className="admin-shell-error"><h1>Unable to load administrator access</h1><p>Refresh the page or sign in again. No admin navigation is available until permissions are confirmed.</p><AdminButton variant="secondary" onClick={() => window.location.reload()}>Retry access check</AdminButton></div>
          ) : requiredPermission && !permissions.includes(requiredPermission) ? (
            <div className="admin-shell-error" role="alert">
              <ShieldCheck size={32} aria-hidden="true" />
              <h1>Access restricted</h1>
              <p>Your current role ({access.roleLabel}) does not have permission to access this section.</p>
              <AdminButton variant="primary" onClick={() => nav("/admin")}>Return to dashboard</AdminButton>
            </div>
          ) : children}
        </div>
      </main>

      {mobileOpen && <div className="admin-mobile-layer">
        <button type="button" className="admin-overlay" aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} />
        <aside ref={mobileSidebar} className="admin-mobile-sidebar" aria-label="Mobile admin navigation">
          <div className="admin-brand"><span className="admin-brand-mark"><ShieldCheck size={18} /></span><span className="admin-brand-copy"><span className="admin-brand-title">BuddyForStudy</span><span className="admin-brand-caption">Admin control center</span></span><AdminIconButton label="Close navigation" onClick={() => setMobileOpen(false)}><X size={17} /></AdminIconButton></div>
          {renderNavigation(true)}
        </aside>
      </div>}

      {commandOpen && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCommandOpen(false); setQuery(""); } }}>
        <section ref={commandDialog} className="admin-command-modal" role="dialog" aria-modal="true" aria-labelledby="admin-command-title" onMouseDown={(event) => event.stopPropagation()}>
          <h2 id="admin-command-title" className="admin-visually-hidden">Search pages and actions</h2>
          <div className="admin-command-search"><Search size={19} aria-hidden="true" /><input ref={commandInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions…" aria-label="Search pages and actions" /><kbd>ESC</kbd></div>
          <div className="admin-command-results" role="listbox" aria-label="Search results">
            {matchingCommands.some((item) => item.kind === "Recent") && <p className="admin-command-group-label">Recent</p>}
            {matchingCommands.map((item, index) => item.kind === "Recent" ? <button type="button" key={item.kind + item.to} role="option" aria-selected={activeResult === index} className="admin-command-result" onMouseEnter={() => setActiveResult(index)} onClick={() => { nav(item.to); setCommandOpen(false); setQuery(""); }}><item.icon size={17} /><span className="admin-command-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="admin-command-enter">{activeResult === index ? "↵" : ""}</span></button> : null)}
            {matchingCommands.some((item) => item.kind === "Page") && <p className="admin-command-group-label">Pages</p>}
            {matchingCommands.map((item, index) => item.kind === "Page" ? <button type="button" key={item.kind + item.to} role="option" aria-selected={activeResult === index} className="admin-command-result" onMouseEnter={() => setActiveResult(index)} onClick={() => { nav(item.to); setCommandOpen(false); setQuery(""); }}><item.icon size={17} /><span className="admin-command-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="admin-command-enter">{activeResult === index ? "↵" : ""}</span></button> : null)}
            {matchingCommands.some((item) => item.kind === "Action") && <p className="admin-command-group-label">Quick actions</p>}
            {matchingCommands.map((item, index) => item.kind === "Action" ? <button type="button" key={item.kind + item.to} role="option" aria-selected={activeResult === index} className="admin-command-result" onMouseEnter={() => setActiveResult(index)} onClick={() => { nav(item.to); setCommandOpen(false); setQuery(""); }}><item.icon size={17} /><span className="admin-command-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="admin-command-enter">{activeResult === index ? "↵" : ""}</span></button> : null)}
            {!matchingCommands.length && <div className="admin-command-empty">No pages or actions match “{query}”. Try another search.</div>}
          </div>
          <footer className="admin-modal-footer"><span>↑ ↓ Navigate</span><span>Enter Open</span><span>Esc Close</span></footer>
        </section>
      </div>}

      {helpOpen && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
        <section ref={helpDialog} className="admin-help-modal" role="dialog" aria-modal="true" aria-labelledby="admin-help-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="admin-help-header"><div><p className="admin-page-header__eyebrow">Help and productivity</p><h2 id="admin-help-title">Keyboard shortcuts</h2></div><AdminIconButton label="Close shortcuts" onClick={() => setHelpOpen(false)}><X size={17} /></AdminIconButton></header>
          <div className="admin-shortcut-list">
            {[
              ["Ctrl / Cmd + K", "Open command palette"],
              ["/", "Focus page search when available"],
              ["G then D", "Go to dashboard"],
              ["G then U", "Go to users"],
              ["G then C", "Go to courses"],
              ["N", "Open quick actions"],
              ["?", "Show keyboard shortcuts"],
              ["Esc", "Close menu or dialog"],
            ].map(([shortcut, label]) => <div className="admin-shortcut-row" key={shortcut}><span>{label}</span><kbd>{shortcut}</kbd></div>)}
          </div>
          <footer className="admin-help-footer"><AdminButton variant="primary" onClick={() => setHelpOpen(false)}>Close help</AdminButton></footer>
        </section>
      </div>}
    </div>
  );
}

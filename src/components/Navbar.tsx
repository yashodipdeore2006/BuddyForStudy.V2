import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, BarChart3, BookOpen, Bookmark, Compass, GraduationCap, Home,
  LayoutDashboard, LogOut, Moon, Search, Settings2, Sun, UserRound, Users
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import NotificationMenu from "@/components/NotificationMenu";
import CommandPalette from "@/components/CommandPalette";
import ShortcutsDialog from "@/components/ShortcutsDialog";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";

type ThemeMode = "light" | "dark" | "system";

const learnerLinks = [
  { to: routes.home(), label: "Home", icon: Home },
  { to: routes.explore(), label: "Explore", icon: Compass },
  { to: routes.myLearning(), label: "My learning", icon: GraduationCap },
  { to: routes.saved(), label: "Saved", icon: Bookmark },
];

const adminLinks = [
  { to: routes.adminHome(), label: "Dashboard", icon: LayoutDashboard },
  { to: routes.adminUsers(), label: "Users", icon: Users },
  { to: routes.adminCourses(), label: "Courses", icon: BookOpen },
  { to: routes.adminAnalytics(), label: "Analytics", icon: BarChart3 },
];

function readThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem("bfs-theme");
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Navbar() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const lastGPressed = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [courseDetailIsEnrolled, setCourseDetailIsEnrolled] = useState<boolean | null>(null);
  const isAdmin = profile?.role === "admin";
  const isLearner = Boolean(profile) && !isAdmin;
  const links = isAdmin ? adminLinks : learnerLinks;
  const profilePath = isAdmin ? routes.adminSettings() : routes.profile();
  const avatarName = session?.user?.name || profile?.name || "Learner";
  const avatarInitial = avatarName.trim().charAt(0).toUpperCase() || "L";

  const closeOverlay = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(false);
    setPaletteQuery("");
  }, []);

  const openPalette = useCallback((initial = "") => {
    setPaletteQuery(initial);
    setPaletteOpen(true);
    setMenuOpen(false);
    setShortcutsOpen(false);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("bfs-has-bottom-tabs", isLearner);
    return () => document.body.classList.remove("bfs-has-bottom-tabs");
  }, [isLearner]);

  useEffect(() => {
    const applyTheme = () => {
      const resolved = resolveTheme(themeMode);
      if (resolved === "dark") document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = resolved;
      try { window.localStorage.setItem("bfs-theme", themeMode); } catch { /* Current page theme remains applied. */ }
    };
    applyTheme();
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", applyTheme);
    return () => media.removeEventListener?.("change", applyTheme);
  }, [themeMode]);

  useEffect(() => {
    setMenuOpen(false);
    closeOverlay();
  }, [location.pathname, closeOverlay]);

  useEffect(() => {
    const match = location.pathname.match(/^\/courses\/([^/]+)\/?$/);
    if (!match || !session?.user?.id) {
      setCourseDetailIsEnrolled(false);
      return;
    }
    let active = true;
    setCourseDetailIsEnrolled(null);
    apiFetch('/api/enrollments/course/' + encodeURIComponent(match[1]))
      .then((data) => {
        if (!active) return;
        const status = String(data.enrollment?.status ?? '').toLowerCase();
        setCourseDetailIsEnrolled(status === 'active' || status === 'completed');
      })
      .catch(() => { if (active) setCourseDetailIsEnrolled(false); });
    return () => { active = false; };
  }, [location.pathname, session?.user?.id]);

  useEffect(() => {
    const onEnrollmentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ courseId?: string; status?: string }>).detail;
    const match = location.pathname.match(/^\/courses\/([^/]+)\/?$/);
      if (!match || !detail?.courseId || decodeURIComponent(match[1]) !== String(detail.courseId)) return;
      const status = String(detail.status || "").toLowerCase();
      setCourseDetailIsEnrolled(status === "active" || status === "completed");
    };
    window.addEventListener("bfs:course-enrollment-updated", onEnrollmentUpdated);
    return () => window.removeEventListener("bfs:course-enrollment-updated", onEnrollmentUpdated);
  }, [location.pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };
    const continueLastCourse = async () => {
      if (!session) {
        navigate(routes.login());
        return;
      }
      try {
        const data = await apiFetch("/api/enrollments");
        const active = (data.enrollments ?? []).filter((item: any) => String(item.status).toLowerCase() === "active" && item.course);
        if (!active.length) {
          navigate(routes.home());
          return;
        }
        const candidates = await Promise.all(active.map(async (item: any) => {
          const courseId = String(item.course?._id ?? item.course?.id ?? item.course_id ?? "");
          if (!courseId) return null;
          try {
            const result = await apiFetch("/api/progress/" + courseId);
            const progress = result.progress ?? {};
            const completed = new Set((progress.completedLessons ?? []).map((entry: any) => String(entry.lessonId)));
            const modules = (item.course.modules ?? []).map((module: any) => ({
              ...module,
              id: String(module._id ?? module.id ?? ""),
              lessons: (module.lessons ?? []).map((lesson: any) => ({ ...lesson, id: String(lesson._id ?? lesson.id ?? "") })),
            }));
            const nextLesson = modules.flatMap((module: any) => module.lessons).find((lesson: any) => !completed.has(lesson.id));
            return {
              courseId,
              nextLessonId: nextLesson?.id ?? "",
              lastAccessedAt: String(progress.lastAccessedAt ?? ""),
            };
          } catch {
            return { courseId, nextLessonId: "", lastAccessedAt: "" };
          }
        }));
        const mostRecent = candidates.filter(Boolean).sort((a: any, b: any) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0] as { courseId: string; nextLessonId: string } | undefined;
        if (mostRecent) navigate(routes.learn(mostRecent.courseId, mostRecent.nextLessonId));
        else navigate(routes.home());
      } catch {
        navigate(routes.home());
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (paletteOpen || shortcutsOpen) return;
      if (isTypingTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setMenuOpen(false);
        setPaletteOpen(false);
        setShortcutsOpen(true);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        lastGPressed.current = Date.now();
        return;
      }
      if (Date.now() - lastGPressed.current < 1200) {
        const destinations: Record<string, string> = { h: "/home", e: "/explore", l: "/my-learning", s: "/saved" };
        const destination = destinations[event.key.toLowerCase()];
        if (destination) {
          event.preventDefault();
          navigate(destination);
          lastGPressed.current = 0;
          return;
        }
      }
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        void continueLastCourse();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate, openPalette, session, paletteOpen, shortcutsOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate(routes.landing());
  };

  const isActive = (to: string) => {
    const pathname = location.pathname;
    if (to === routes.home()) return pathname === "/" || pathname === routes.home() || pathname === "/dashboard";
    if (to === routes.explore()) return pathname === routes.explore() || pathname === "/courses" || (pathname.startsWith("/courses/") && courseDetailIsEnrolled !== true);
    if (to === routes.myLearning()) return pathname === routes.myLearning() || pathname === "/my-courses" || (pathname.startsWith("/courses/") && courseDetailIsEnrolled === true);
    if (to === routes.saved()) return pathname === routes.saved() || pathname === "/saved-courses";
    return pathname === to || pathname.startsWith(to + "/");
  };

  return (
    <>
      <header className="bfs-user-header">
        <nav className="bfs-user-header__inner" aria-label="Primary navigation">
          <Link to={isLearner ? "/home" : "/"} className="bfs-user-brand" aria-label="BuddyForStudy home">
            <span className="bfs-user-brand__mark"><img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" /></span>
            <span className="bfs-user-brand__wordmark">Buddy<span>For</span>Study</span>
          </Link>

          {profile && (
            <div className="bfs-user-primary-nav">
              {links.map((link) => {
                const active = isActive(link.to);
                const Icon = link.icon;
                return <Link key={link.to} to={link.to} aria-current={active ? "page" : undefined} className={active ? "bfs-user-nav-link bfs-user-nav-link--active" : "bfs-user-nav-link"}>
                  <Icon size={18} aria-hidden="true" /><span>{link.label}</span>
                </Link>;
              })}
            </div>
          )}

          <div className="bfs-user-header__actions">
            <button type="button" className="bfs-icon-control" onClick={() => openPalette()} aria-label="Search" title="Search (Ctrl/Cmd + K)">
              <Search size={20} aria-hidden="true" />
            </button>
            {profile && !isAdmin && <NotificationMenu />}
            {profile ? (
              <div className="bfs-avatar-menu" ref={menuRef}>
                <button type="button" className={menuOpen ? "bfs-avatar-trigger bfs-avatar-trigger--open" : "bfs-avatar-trigger"} onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={"Open account menu for " + avatarName}>
                  <span className="bfs-avatar">{avatarInitial}</span>
                  <span className="bfs-avatar-trigger__name">{avatarName}</span>
                </button>
                {menuOpen && (
                  <div className="bfs-avatar-popover" role="menu" aria-label="Account menu">
                    <div className="bfs-avatar-popover__identity"><strong>{avatarName}</strong><span>{session?.user?.email || ""}</span></div>
                    <Link role="menuitem" to={profilePath} onClick={() => setMenuOpen(false)}><UserRound size={17} />{isAdmin ? "Admin settings" : "Profile"}</Link>
                    {!isAdmin && <Link role="menuitem" to={routes.settings()} onClick={() => setMenuOpen(false)}><Settings2 size={17} />Settings</Link>}
                    <div className="bfs-avatar-popover__separator" />
                    <div className="bfs-avatar-popover__theme" aria-label="Theme">
                      <span>Theme</span>
                      <div role="group" aria-label="Choose theme">
                        {(["light", "dark", "system"] as ThemeMode[]).map((mode) => <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}>{mode === "light" ? <Sun size={14} /> : mode === "dark" ? <Moon size={14} /> : <Activity size={14} />}{mode[0].toUpperCase() + mode.slice(1)}</button>)}
                      </div>
                    </div>
                    {!isAdmin && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setShortcutsOpen(true); }}><Search size={17} />Help and shortcuts</button>}
                    <div className="bfs-avatar-popover__separator" />
                    <button type="button" role="menuitem" onClick={() => void handleSignOut()}><LogOut size={17} />Sign out</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bfs-public-actions">
                <Link to={routes.explore()} className="bfs-public-link">Explore</Link>
                <Link to={routes.login()} className="bfs-public-link">Sign in</Link>
                <Link to={routes.register()} className="bfs-user-primary-button">Get started</Link>
              </div>
            )}
          </div>
        </nav>
      </header>

      {isLearner && (
        <nav className="bfs-bottom-tabs" aria-label="Learner navigation">
          {learnerLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return <Link key={link.to} to={link.to} aria-current={active ? "page" : undefined} className={active ? "bfs-bottom-tab bfs-bottom-tab--active" : "bfs-bottom-tab"}>
              <Icon size={19} aria-hidden="true" /><span>{link.label}</span>
            </Link>;
          })}
        </nav>
      )}

      <CommandPalette open={paletteOpen} onClose={closeOverlay} initialQuery={paletteQuery} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

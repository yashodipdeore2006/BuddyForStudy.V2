import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, GraduationCap, Home, LoaderCircle, Search, Sparkles, Bookmark, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Course } from "@/types";
import { routes } from "@/lib/routes";
import { USER_INTENTS } from "@/lib/intents";

type CommandItem = {
  id: string;
  title: string;
  description: string;
  icon: typeof Search;
  kind: "route" | "build";
  href?: string;
};

const PAGE_COMMANDS: CommandItem[] = [
  { id: "home", title: "Home", description: "Your learning overview", icon: Home, kind: "route", href: routes.home() },
  { id: "explore", title: "Explore", description: "Find a course or topic", icon: Compass, kind: "route", href: routes.explore() },
  { id: "learning", title: "My learning", description: "Continue enrolled courses", icon: GraduationCap, kind: "route", href: routes.myLearning() },
  { id: "saved", title: "Saved", description: "Courses saved for later", icon: Bookmark, kind: "route", href: routes.saved() },
  { id: "build", title: "Build my path", description: "Create a learning path with AI", icon: Sparkles, kind: "build", href: routes.buildPath() },
];

function mapCourse(raw: any): Course {
  return {
    ...raw,
    id: String(raw?._id ?? raw?.id ?? ""),
    title: String(raw?.title ?? "Untitled course"),
    description: String(raw?.description ?? ""),
    category: String(raw?.category ?? ""),
    duration: String(raw?.duration ?? ""),
    thumbnail: raw?.thumbnail ?? null,
    modules: Array.isArray(raw?.modules) ? raw.modules : [],
    learning_outcomes: raw?.learningOutcomes ?? raw?.learning_outcomes ?? [],
    is_published: raw?.isPublished ?? raw?.is_published ?? true,
  } as Course;
}

export default function CommandPalette({ open, onClose, initialQuery = "" }: { open: boolean; onClose: () => void; initialQuery?: string }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setQuery(initialQuery);
    setActiveIndex(0);
    const focusId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (!text) {
      setCourses([]);
      setError("");
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/api/courses?q=" + encodeURIComponent(text) + "&limit=8");
        if (!active) return;
        setCourses((data.courses ?? data.items ?? []).map(mapCourse).filter((course: Course) => course.id));
      } catch (err) {
        if (active) {
          setCourses([]);
          setError(err instanceof Error ? err.message : "Search is temporarily unavailable. Try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query, retryKey]);

  const commands = useMemo(() => query.trim() ? [] : PAGE_COMMANDS, [query]);
  const itemCount = commands.length + courses.length;

  useEffect(() => {
    setActiveIndex((current) => itemCount ? Math.min(current, itemCount - 1) : 0);
  }, [itemCount]);

  const activate = (index: number) => {
    if (index < commands.length) {
      const command = commands[index];
      onClose();
      navigate(command.href || routes.home());
      return;
    }
    const course = courses[index - commands.length];
    if (!course) return;
    onClose();
    navigate(routes.course(course.id));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => itemCount ? (index + 1) % itemCount : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => itemCount ? (index - 1 + itemCount) % itemCount : 0);
      return;
    }
    if (event.key === "Enter" && itemCount) {
      event.preventDefault();
      activate(activeIndex);
      return;
    }
    if (event.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="bfs-command-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bfs-command-title" className="bfs-command-dialog" onKeyDown={handleKeyDown}>
        <h2 id="bfs-command-title" className="bfs-sr-only">Search BuddyForStudy</h2>
        <div className="bfs-command-search">
          <Search size={20} aria-hidden="true" />
          <input ref={inputRef} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search courses or jump to a page" aria-label="Search courses and pages" />
          <kbd>Esc</kbd>
          <button type="button" className="bfs-icon-control" onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="bfs-command-results" role="listbox" aria-label="Search results">
          {!query.trim() && <p className="bfs-command-group-label">Pages and actions</p>}
          {commands.map((command, index) => {
            const Icon = command.icon;
            return <button key={command.id} type="button" role="option" aria-selected={activeIndex === index} className="bfs-command-item" onMouseEnter={() => setActiveIndex(index)} onClick={() => activate(index)}>
              <span className="bfs-command-item-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="bfs-command-item-copy"><strong>{command.title}</strong><small>{command.description}</small></span>
              {activeIndex === index && <ArrowRight size={16} aria-hidden="true" />}
            </button>;
          })}
          {query.trim() && courses.length > 0 && <p className="bfs-command-group-label">Courses</p>}
          {courses.map((course, courseIndex) => {
            const index = commands.length + courseIndex;
            return <button key={course.id} type="button" role="option" aria-selected={activeIndex === index} className="bfs-command-item" onMouseEnter={() => setActiveIndex(index)} onClick={() => activate(index)}>
              <span className="bfs-command-item-icon">{course.thumbnail ? <img src={course.thumbnail} alt="" /> : <BookOpen size={18} aria-hidden="true" />}</span>
              <span className="bfs-command-item-copy"><strong>{course.title}</strong><small>{[course.category, course.level, course.duration].filter(Boolean).join(" · ") || "Open course details"}</small></span>
              {activeIndex === index && <ArrowRight size={16} aria-hidden="true" />}
            </button>;
          })}
          {loading && <p className="bfs-command-message" role="status"><LoaderCircle className="bfs-spin" size={16} /> Searching courses…</p>}
          {error && <div className="bfs-command-message bfs-command-message--error" role="alert"><span>{error}</span><button type="button" className="bfs-command-retry" onClick={() => setRetryKey((value) => value + 1)}>{USER_INTENTS.retry.label}</button></div>}
          {!loading && query.trim() && !error && !courses.length && <p className="bfs-command-message">No courses found. Try another search.</p>}
        </div>
        <footer className="bfs-command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span><span><kbd>Enter</kbd> to open</span><span><kbd>Ctrl</kbd> <kbd>K</kbd> to search</span></footer>
      </div>
    </div>
  );
}

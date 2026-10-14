import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, BookOpen, Clock, Trash2, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

type Saved = {
  _id: string;
  savedAt: string;
  course: {
    _id: string;
    title: string;
    slug: string;
    description: string;
    category: string;
    level: string;
    duration: string;
    thumbnail?: string;
    isPublished: boolean;
  };
};

export default function SavedCourses() {
  const [savedCourses, setSavedCourses] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/saved-courses");
      setSavedCourses((data.savedCourses || []).filter((item: Saved) => item.course));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(courseId: string) {
    setRemoving(courseId);
    try {
      await apiFetch(`/api/saved-courses/${courseId}`, { method: "DELETE" });
      setSavedCourses((current) => current.filter((item) => item.course._id !== courseId));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Saved Courses"
        subtitle="Courses you saved to come back to later."
      />

      {loading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : savedCourses.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title="No saved courses"
            description="Use Save Course on a course you want to learn later."
            action={<Link to="/courses" className="btn-primary">Browse Courses</Link>}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {savedCourses.map((saved) => {
            const course = saved.course;
            return (
              <div
                key={saved._id}
                className="bfs-course-card group flex h-full min-h-[400px] flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50"
              >
                <Link to={`/courses/${course._id}`} className="relative h-[138px] shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white">
                      <BookOpen className="h-12 w-12 text-slate-300" />
                    </div>
                  )}
                </Link>

                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[11px] font-bold uppercase tracking-[.14em] text-blue-600">
                    {course.category}
                  </span>
                  <Link to={`/courses/${course._id}`}>
                    <h3 className="mt-2 line-clamp-2 min-h-[2.65rem] text-[15px] font-extrabold leading-[1.32] tracking-[-.02em] text-slate-900 hover:text-blue-700">
                      {course.title}
                    </h3>
                  </Link>
                  <p className="mt-2 line-clamp-2 min-h-[2.5rem] flex-1 text-xs leading-5 text-slate-500">
                    {course.description}
                  </p>

                  <div className="mt-3 flex min-h-[42px] items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>{course.level}</span>
                    {course.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {course.duration}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-3">
                    <Link to={`/courses/${course._id}`} className="btn-primary justify-center">
                      Open Course
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(course._id)}
                      disabled={removing === course._id}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Remove saved course"
                      title="Remove saved course"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

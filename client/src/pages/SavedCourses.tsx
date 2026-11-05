import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { CourseLevel } from "@/types";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import CourseCard from "@/components/CourseCard";
import { routes } from "@/lib/routes";

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

async function requestSavedCourses(): Promise<Saved[]> {
  const data = await apiFetch<{ savedCourses?: Saved[] }>("/api/saved-courses");
  return (data.savedCourses || []).filter((item) => item.course);
}

export default function SavedCourses() {
  const [savedCourses, setSavedCourses] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError("");
    void requestSavedCourses()
      .then((items) => { setSavedCourses(items); setLoadError(""); })
      .catch((error) => { setLoadError(error instanceof Error ? error.message : "Unable to load saved courses. Please try again."); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    requestSavedCourses()
      .then((items) => { if (active) { setSavedCourses(items); setLoadError(""); } })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : "Unable to load saved courses. Please try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);


  return (
    <div className="bfs-shell py-8 sm:py-10">
      <PageHeader
        title="Saved Courses"
        subtitle="Courses you saved to come back to later."
      />

      {loading ? (
        <div className="bfs-course-grid mt-8">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : loadError ? (
        <div className="mt-8"><ErrorState title="Couldn’t load saved courses" description={loadError} onRetry={retryLoad} /></div>
      ) : savedCourses.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title="No saved courses"
            description="Use Save Course on a course you want to learn later."
            action={<Link to={routes.explore()} className="btn-primary">Explore</Link>}
          />
        </div>
      ) : (
        <div className="bfs-course-grid mt-8">
          {savedCourses.map((saved) => (
            <div key={saved._id} className="relative min-w-0">
              <CourseCard course={{
                id: saved.course._id,
                title: saved.course.title,
                slug: saved.course.slug,
                description: saved.course.description,
                category: saved.course.category,
                level: saved.course.level as CourseLevel,
                duration: saved.course.duration,
                thumbnail: saved.course.thumbnail || null,
                learning_outcomes: [],
                modules: [],
                is_published: saved.course.isPublished,
                created_by: null,
                created_at: "",
                updated_at: ""
              }} showActions initiallySaved onSavedChange={(courseId, isSaved) => {
                if (!isSaved) {
                  setSavedCourses((current) => current.filter((item) => item.course._id !== courseId));
                }
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

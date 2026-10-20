import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAllLessonsFlat } from "@/lib/courseUtils";
import type { Course } from "@/types";

export type CourseState = {
  loading: boolean;
  isEnrolled: boolean;
  isCompleted: boolean;
  progressPct: number;
  completedLessons: number;
  totalLessons: number;
  nextLessonId: string | null;
  hasRoadmap: boolean;
  hasPreview: boolean;
  isPublished: boolean;
  error: string | null;
};

const initialState: CourseState = {
  loading: true, isEnrolled: false, isCompleted: false, progressPct: 0,
  completedLessons: 0, totalLessons: 0, nextLessonId: null, hasRoadmap: false,
  hasPreview: false, isPublished: true, error: null,
};

export function useCourseState(courseId: string | undefined, course?: Course | null, enabled = true): CourseState {
  const [remote, setRemote] = useState<CourseState>(initialState);
  const lessons = useMemo(() => course ? getAllLessonsFlat(course.modules) : [], [course]);
  const lessonKey = lessons.map((lesson) => String(lesson.id)).join("|");
  const hasRoadmap = lessons.length > 0;

  useEffect(() => {
    let current = true;
    if (!enabled) {
      setRemote({ ...initialState, loading: false, hasRoadmap, isPublished: course?.is_published !== false, error: null });
      return () => { current = false; };
    }
    if (!courseId) {
      setRemote({ ...initialState, loading: false, error: "A course id is required." });
      return () => { current = false; };
    }
    setRemote((previous) => ({ ...previous, loading: true, error: null }));

    void (async () => {
      let enrollment: any = null;
      let progress: any = null;
      let errorMessage: string | null = null;
      try {
        const result = await apiFetch(`/api/enrollments/course/${encodeURIComponent(courseId)}`);
        enrollment = result.enrollment ?? null;
      } catch (error) {
        const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
        if (status !== 404) errorMessage = error instanceof Error ? error.message : "Enrollment status is unavailable.";
      }

      const isEnrolled = ["active", "completed"].includes(String(enrollment?.status ?? "").toLowerCase());
      if (isEnrolled) {
        try {
          const result = await apiFetch(`/api/progress/${encodeURIComponent(courseId)}`);
          progress = result.progress ?? null;
        } catch (error) {
          const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
          if (status !== 404) errorMessage = errorMessage ?? (error instanceof Error ? error.message : "Progress is unavailable.");
        }
      }

      const completedRaw = Array.isArray(progress?.completedLessons) ? progress.completedLessons
        : Array.isArray(progress?.completed_lessons) ? progress.completed_lessons : [];
      const completedIds = new Set(completedRaw.map((item: any) => String(item.lessonId ?? item.lesson_id ?? item.id ?? "")));
      const nextLesson = lessons.find((lesson) => !completedIds.has(String(lesson.id)));
      const totalLessons = Number(progress?.totalLessons ?? progress?.total_lessons ?? lessons.length);
      const completedLessons = Number(progress?.completedCount ?? progress?.completed_count ?? completedIds.size);
      const progressPct = Math.min(100, Math.max(0, Number(progress?.percentage ?? (totalLessons ? completedLessons / totalLessons * 100 : 0)) || 0));
      const isCompleted = String(enrollment?.status ?? "").toLowerCase() === "completed" || (totalLessons > 0 && progressPct >= 100);

      if (current) setRemote({
        loading: false, isEnrolled, isCompleted, progressPct, completedLessons, totalLessons,
        nextLessonId: isCompleted ? null : nextLesson ? String(nextLesson.id) : null,
        hasRoadmap, hasPreview: lessons.some((lesson: any) => lesson.isPreview === true || lesson.is_preview === true),
        isPublished: course?.is_published !== false, error: errorMessage,
      });
    })().catch((error) => {
      if (current) setRemote({ ...initialState, loading: false, hasRoadmap, isPublished: course?.is_published !== false, error: error instanceof Error ? error.message : "Course state is unavailable." });
    });

    return () => { current = false; };
  }, [courseId, course?.id, course?.is_published, enabled, hasRoadmap, lessonKey]);

  return { ...remote, hasRoadmap: course ? hasRoadmap : remote.hasRoadmap, isPublished: course ? course.is_published !== false : remote.isPublished };
}

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

function normalizeLessonId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "undefined" || normalized.toLowerCase() === "null") return null;
  return normalized;
}

export function useCourseState(courseId: string | undefined, course?: Course | null, enabled = true, refreshKey = 0): CourseState {
  const [remote, setRemote] = useState<CourseState>(initialState);
  const [remoteRequestKey, setRemoteRequestKey] = useState("");
  const lessons = useMemo(() => course ? getAllLessonsFlat(course.modules) : [], [course]);
  const lessonKey = lessons.map((lesson) => String(lesson.id)).join("|");
  const hasRoadmap = lessons.length > 0;
  const hasPreview = lessons.some((lesson) => {
    const previewMetadata = lesson as unknown as { isPreview?: boolean; is_preview?: boolean };
    return previewMetadata.isPreview === true || previewMetadata.is_preview === true;
  });
  const requestKey = [
    courseId || "",
    course?.id || "",
    course?.is_published === false ? "unpublished" : "published",
    enabled ? "enabled" : "disabled",
    lessonKey,
    String(refreshKey),
  ].join(":");

  useEffect(() => {
    if (!enabled || !courseId) return undefined;
    let current = true;

    void (async () => {
      let enrollment: Record<string, unknown> | null = null;
      let progress: Record<string, unknown> | null = null;
      let errorMessage: string | null = null;
      try {
        const result = await apiFetch(`/api/enrollments/course/${encodeURIComponent(courseId)}`);
        enrollment = result.enrollment ?? null;
      } catch (error) {
        const errorRecord = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
        const status = Number(errorRecord.status ?? errorRecord.statusCode ?? 0);
        if (status !== 404) errorMessage = error instanceof Error ? error.message : "Enrollment status is unavailable.";
      }

      const isEnrolled = ["active", "completed"].includes(String(enrollment?.status ?? "").toLowerCase());
      if (isEnrolled) {
        try {
          const result = await apiFetch(`/api/progress/${encodeURIComponent(courseId)}`);
          progress = result.progress ?? null;
        } catch (error) {
          const errorRecord = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
          const status = Number(errorRecord.status ?? errorRecord.statusCode ?? 0);
          if (status !== 404) errorMessage = errorMessage ?? (error instanceof Error ? error.message : "Progress is unavailable.");
        }
      }

      const completedRaw = Array.isArray(progress?.completedLessons) ? progress.completedLessons
        : Array.isArray(progress?.completed_lessons) ? progress.completed_lessons : [];
      const completedIds = new Set(completedRaw.map((item) => {
        const entry = item !== null && typeof item === "object" ? item as Record<string, unknown> : {};
        return String(entry.lessonId ?? entry.lesson_id ?? entry.id ?? "");
      }));
      const nextLesson = lessons.find((lesson) => {
        const lessonId = normalizeLessonId(lesson.id);
        return lessonId !== null && !completedIds.has(lessonId);
      });
      const totalLessons = Number(progress?.totalLessons ?? progress?.total_lessons ?? lessons.length);
      const completedLessons = Number(progress?.completedCount ?? progress?.completed_count ?? completedIds.size);
      const progressPct = Math.min(100, Math.max(0, Number(progress?.percentage ?? (totalLessons ? completedLessons / totalLessons * 100 : 0)) || 0));
      const isCompleted = String(enrollment?.status ?? "").toLowerCase() === "completed" || (totalLessons > 0 && progressPct >= 100);

      if (current) {
        setRemote({
          loading: false, isEnrolled, isCompleted, progressPct, completedLessons, totalLessons,
          nextLessonId: isCompleted || !nextLesson ? null : normalizeLessonId(nextLesson.id),
          hasRoadmap, hasPreview,
          isPublished: course?.is_published !== false, error: errorMessage,
        });
        setRemoteRequestKey(requestKey);
      }
    })().catch((error) => {
      if (current) {
        setRemote({
          ...initialState,
          loading: false,
          hasRoadmap,
          hasPreview,
          isPublished: course?.is_published !== false,
          error: error instanceof Error ? error.message : "Course state is unavailable.",
        });
        setRemoteRequestKey(requestKey);
      }
    });

    return () => { current = false; };
  }, [requestKey, courseId, course?.is_published, enabled, hasRoadmap, hasPreview, lessonKey, lessons, refreshKey]);

  if (!enabled) {
    return { ...initialState, loading: false, hasRoadmap, hasPreview, isPublished: course?.is_published !== false, error: null };
  }
  if (!courseId) {
    return { ...initialState, loading: false, error: "A course id is required." };
  }
  if (remoteRequestKey !== requestKey) {
    return { ...initialState, loading: true, hasRoadmap, hasPreview, isPublished: course?.is_published !== false };
  }
  return {
    ...remote,
    hasRoadmap: course ? hasRoadmap : remote.hasRoadmap,
    hasPreview: course ? hasPreview : remote.hasPreview,
    isPublished: course ? course.is_published !== false : remote.isPublished,
  };
}

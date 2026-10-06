import type { Module, Lesson, CompletedLesson } from '@/types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function countAllLessons(modules: Module[]): number {
  return modules.reduce((sum, m) => sum + m.lessons.length, 0);
}

export function getAllLessonsFlat(modules: Module[]): Lesson[] {
  const lessons: Lesson[] = [];
  modules.forEach((m) => {
    m.lessons.forEach((l) => lessons.push(l));
  });
  return lessons;
}

export function findLessonById(
  modules: Module[],
  lessonId: string
): { lesson: Lesson; module: Module; moduleIndex: number; lessonIndex: number } | null {
  for (let mi = 0; mi < modules.length; mi++) {
    for (let li = 0; li < modules[mi].lessons.length; li++) {
      if (modules[mi].lessons[li].id === lessonId) {
        return {
          lesson: modules[mi].lessons[li],
          module: modules[mi],
          moduleIndex: mi,
          lessonIndex: li,
        };
      }
    }
  }
  return null;
}

export function isLessonCompleted(
  completedLessons: CompletedLesson[],
  lessonId: string
): boolean {
  return completedLessons.some((cl) => cl.lessonId === lessonId);
}

export function getNavigationLessons(
  modules: Module[],
  currentLessonId: string
): { prev: Lesson | null; next: Lesson | null } {
  const flat = getAllLessonsFlat(modules);
  const idx = flat.findIndex((l) => l.id === currentLessonId);
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}

export function calculateProgress(
  completedLessons: CompletedLesson[],
  totalLessons: number
): { completedCount: number; percentage: number } {
  const completedCount = completedLessons.length;
  const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  return { completedCount, percentage };
}

export function createEmptyModule(order: number): Module {
  return {
    id: generateId(),
    title: '',
    description: '',
    order,
    lessons: [],
  };
}

export function createEmptyLesson(order: number, type: 'tutorial' | 'project' = 'tutorial'): Lesson {
  const lesson: Lesson = {
    id: generateId(),
    title: '',
    description: '',
    type,
    order,
  };
  if (type === 'tutorial') {
    lesson.tutorial = { content: '' };
  } else {
    lesson.project = {
      description: '',
      requirements: [],
      instructions: '',
      expectedOutcome: '',
    };
  }
  return lesson;
}

export type UserRole = 'user' | 'admin';
export type AuthProvider = 'local' | 'google' | 'local_google';
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type LessonType = 'tutorial' | 'project';
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  auth_provider: AuthProvider;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TutorialContent {
  content: string;
  videoUrl?: string;
  resourceUrl?: string;
  videos?: Array<{ title?: string; url?: string; videoId?: string; thumbnail?: string; channelTitle?: string; relevanceScore?: number }>;
  resources?: Array<{ title?: string; url?: string; type?: string }>;
}

export interface ProjectContent {
  description: string;
  objectives?: string[];
  requirements: string[];
  instructions: string;
  expectedOutcome: string;
  starterCodeUrl?: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  type: LessonType;
  order: number;
  tutorial?: TutorialContent;
  project?: ProjectContent;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  level: CourseLevel;
  duration: string;
  thumbnail: string | null;
  learning_outcomes: string[];
  modules: Module[];
  is_published: boolean;
  enrollment_count?: number;
  pricing?: { mode: 'free' | 'paid'; price: number; compareAtPrice?: number; currency?: string; saleEnabled?: boolean; salePrice?: number };
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
  course?: Course;
}

export interface CompletedLesson {
  lessonId: string;
  type: LessonType;
  completedAt: string;
}

export interface Progress {
  id: string;
  user_id: string;
  course_id: string;
  completed_lessons: CompletedLesson[];
  completed_count: number;
  total_lessons: number;
  percentage: number;
  last_lesson_id: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

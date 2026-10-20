export type UserRole = 'user' | 'admin';
export type AuthProvider = 'local' | 'google' | 'local_google';
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type LessonType = 'tutorial' | 'project' | 'quiz';
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
  videos?: Array<{ title?: string; url?: string; videoId?: string; thumbnail?: string; channelTitle?: string; durationSeconds?: number; duration?: string; relevanceScore?: number }>;
  resources?: Array<{ title?: string; url?: string; type?: string }>;
}

export interface ProjectVideo {
  title?: string;
  url?: string;
  videoId?: string;
  thumbnail?: string;
  channelTitle?: string;
  durationSeconds?: number;
  score?: number;
}

export interface ProjectContent {
  description: string;
  objectives?: string[];
  requirements: string[];
  instructions: string;
  expectedOutcome: string;
  realWorldScenario?: string;
  features?: string[];
  architecture?: string[];
  milestones?: string[];
  testingChecklist?: string[];
  industrySkills?: string[];
  githubWorkflow?: string[];
  videos?: ProjectVideo[];
  starterCodeUrl?: string;
}

export interface QuizQuestionOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  topic?: string;
  question: string;
  options: QuizQuestionOption[];
  correctOptionId: string;
  explanation?: string;
}

export interface QuizContent {
  scope: 'lesson' | 'module';
  questionCount: number;
  passingScore: number;
  focusTopics?: string[];
  instructions?: string;
  questions?: QuizQuestion[];
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  type: LessonType;
  order: number;
  durationSeconds?: number;
  tutorial?: TutorialContent;
  project?: ProjectContent;
  quiz?: QuizContent;
}

export interface ModuleResource {
  id: string;
  title: string;
  url: string;
  type: 'link' | 'document' | 'repository' | 'article';
}

export interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  resources?: ModuleResource[];
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
  enrollmentEnabled?: boolean;
  certificateEnabled?: boolean;
  enrollment_count?: number;
  enrollmentCount?: number;
  cardMetadata?: {
    creatorName?: string;
    typeTag?: string;
    videoCount?: number;
    previewVideoId?: string;
    qualityScore?: number;
    viewCount?: number;
    likeCount?: number;
  };
  generation?: { mode?: 'normal' | 'ai' | 'module' | 'discovery'; sourceResourceType?: 'video' | 'playlist' | 'series' | null; query?: string };
  module_count?: number;
  lesson_count?: number;
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

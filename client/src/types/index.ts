export type UserRole = 'user' | 'admin';
export type AuthProvider = 'local' | 'google' | 'local_google';
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type LessonType = 'tutorial' | 'project' | 'quiz';
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';
export type CourseAccessStatus =
  | 'FREE'
  | 'PAID'
  | 'PLAN_INCLUDED'
  | 'TRIAL_INCLUDED'
  | 'PURCHASED'
  | 'ENROLLED'
  | 'COMPLETED'
  | 'ACCESS_EXPIRED'
  | 'ACCESS_REVOKED'
  | 'PRICE_UNAVAILABLE';

export interface CourseAccessSummary {
  status: CourseAccessStatus;
  source: 'none' | 'subscription' | 'trial' | 'individual' | 'admin' | 'self';
  isEnrolled: boolean;
  isCompleted: boolean;
  planName: string | null;
  trialEndsAt?: string | null;
}

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  auth_provider: AuthProvider;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  city?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    formatted?: string;
  };
  learning_goal?: string;
  profile_setup_skipped_at?: string | null;
  marketing_email_consent?: boolean;
}

export interface TutorialContent {
  content: string;
  videoUrl?: string;
  resourceUrl?: string;
  videos?: Array<{ title?: string; url?: string; videoId?: string; thumbnail?: string; channelTitle?: string; durationSeconds?: number; duration?: string; defaultAudioLanguage?: string; relevanceScore?: number }>;
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
  domain?: string | null;
  tags?: string[];
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
  ratingAverage?: number;
  ratingCount?: number;
  ranking?: {
    version: string;
    score: number;
    qualityScore: number;
    weights: {
      relevance: number;
      catalogueCompleteness: number;
      curriculumCoverage: number;
      confidenceAdjustedRating: number;
      popularity: number;
      freshness: number;
    };
    components: {
      relevance: number;
      catalogueCompleteness: number;
      curriculumCoverage: number;
      confidenceAdjustedRating: number;
      popularity: number;
      freshness: number;
    };
    rating: {
      score: number;
      rawAverage: number | null;
      count: number;
      adjustedAverage: number;
      confidence: number;
      priorAverage: number;
      priorStrength: number;
    };
    enrollmentCount: number;
    reasonCodes: string[];
    reasons: string[];
  };
  cardMetadata?: {
    creatorName?: string;
    creatorUrl?: string;
    typeTag?: string;
    videoCount?: number;
    previewVideoId?: string;
    previewThumbnailUrl?: string;
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
  accessSource?: 'subscription' | 'self' | 'admin';
  courseAccess?: CourseAccessSummary;
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

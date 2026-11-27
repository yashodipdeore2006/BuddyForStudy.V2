export interface LongFormCourseCard {
  id: string;
  title: string;
  domainTag: string;
  domain: string;
  category: string;
  tags: string[];
  level: string;
  learning_outcomes: unknown[];
  modules: unknown[];
  durationSeconds: number;
  durationLabel: string;
  moduleCount: number;
  thumbnailUrl: string | null;
  previewThumbnailUrl: string | null;
  previewVideoId: string | null;
}

export declare function formatCourseRuntime(seconds: number): string;
export declare function toLongFormCourseCard(course: unknown): LongFormCourseCard | null;
export declare function selectLongFormCourses(courses: unknown): LongFormCourseCard[];

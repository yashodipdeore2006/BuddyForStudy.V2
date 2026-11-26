export interface LongFormCourseCard {
  id: string;
  title: string;
  domainTag: string;
  durationSeconds: number;
  durationLabel: string;
  moduleCount: number;
  thumbnailUrl: string | null;
}

export declare function formatCourseRuntime(seconds: number): string;
export declare function toLongFormCourseCard(course: unknown): LongFormCourseCard | null;
export declare function selectLongFormCourses(courses: unknown): LongFormCourseCard[];

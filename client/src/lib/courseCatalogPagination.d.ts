export declare function hasMoreCoursePages(page: number, pages: number | undefined, batchLength: number, pageSize: number): boolean;

export declare function appendUniqueCourses<T extends { id?: string; _id?: string }>(current: T[], next: T[]): T[];

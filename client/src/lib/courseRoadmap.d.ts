export type RoadmapNodeType = "core" | "checkpoint" | "project" | "capstone";
export type RoadmapNodeStatus = "completed" | "in_progress" | "remaining";
export type RoadmapFilter = "all" | "foundations" | "projects" | "completed" | "remaining";

export interface CourseRoadmapNode {
  id: string;
  title: string;
  type: RoadmapNodeType;
  lessonType: "tutorial" | "project" | "quiz";
  estimatedHours: number;
  prerequisites: string[];
  subtopics: string[];
  projectTask: string;
  status: RoadmapNodeStatus;
  phaseId: string;
  phaseTitle: string;
  moduleId: string;
  moduleTitle: string;
  durationSeconds: number;
  description: string;
}

export interface CourseRoadmapPhase {
  id: string;
  order: number;
  title: string;
  estimatedHours: number;
  outcome: string;
  skills: string[];
  nodeIds: string[];
  completedCount: number;
  nodeCount: number;
  completionPercent: number;
  status: RoadmapNodeStatus;
}

export interface CourseRoadmapDocument {
  brandThemeTokens: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    mutedText: string;
  };
  courseMeta: {
    id: string;
    title: string;
    description: string;
    outcome: string;
    level: string;
    totalHours: number;
    moduleCount: number;
    lessonCount: number;
    phaseCount: number;
  };
  progress: {
    completedCount: number;
    totalCount: number;
    percent: number;
    hoursRemaining: number;
    currentPhaseId: string | null;
  };
  phases: CourseRoadmapPhase[];
  nodes: CourseRoadmapNode[];
}

export interface BuildCourseRoadmapOptions {
  course: Record<string, unknown>;
  roadmap: Record<string, unknown>;
  completedIds?: string[];
  enrolled?: boolean;
}

export declare function parseRoadmapDurationSeconds(value: unknown): number;
export declare function buildCourseRoadmapDocument(options: BuildCourseRoadmapOptions): CourseRoadmapDocument;
export declare function getRoadmapFilterMatches(node: CourseRoadmapNode, filter: RoadmapFilter, query?: string): boolean;

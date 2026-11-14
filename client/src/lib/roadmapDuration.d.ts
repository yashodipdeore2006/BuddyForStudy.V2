export interface RoadmapDurationSummaryInput {
  estimatedStudyMinutes?: number;
  minutesPerDay?: number;
  studyDaysPerWeek?: number;
  videoRuntimeMinutes?: number;
}
export interface RoadmapDurationSummary {
  studyHoursLabel: string | null;
  weeksLabel: string | null;
  scheduleLabel: string | null;
  videoRuntimeLabel: string | null;
}
export function getRoadmapDurationSummary(input?: RoadmapDurationSummaryInput): RoadmapDurationSummary;

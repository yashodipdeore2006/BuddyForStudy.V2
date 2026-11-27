export type BuildProgressNode = { nodeId?: string; title?: string; type?: string; state?: string; };
export type BuildProgressSummary = {
  stage: "queued" | "curriculum" | "resources" | "finalizing" | "complete" | "failed";
  total: number; completed: number; ready: number; attention: number; remaining: number;
  progressValue: number | null; isIndeterminate: boolean;
};
export function getBuildProgress(status?: string, nodes?: BuildProgressNode[]): BuildProgressSummary;

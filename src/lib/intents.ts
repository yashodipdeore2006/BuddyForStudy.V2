import {
  ArrowRight,
  Bookmark,
  Eye,
  LogOut,
  Map,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const USER_INTENTS = {
  openCourse: { label: "", icon: undefined, ariaLabel: "Open course details" },
  enrollFree: { label: "Enroll free", icon: Plus, ariaLabel: "Enroll in this free course" },
  enrollPaid: { label: "Enroll", icon: Plus, ariaLabel: "View enrollment and purchase options" },
  start: { label: "Start", icon: Play, ariaLabel: "Start this course" },
  continue: { label: "Continue", icon: Play, ariaLabel: "Continue this course" },
  review: { label: "Review", icon: RotateCcw, ariaLabel: "Review this completed course" },
  save: { label: "Save", icon: Bookmark, ariaLabel: "Save course for later" },
  saved: { label: "Saved", icon: Bookmark, ariaLabel: "Remove course from saved courses" },
  roadmap: { label: "Roadmap", icon: Map, ariaLabel: "Open course roadmap" },
  preview: { label: "Preview", icon: Eye, ariaLabel: "Preview course" },
  explore: { label: "Explore", icon: ArrowRight, ariaLabel: "Explore courses" },
  seeAll: { label: "See all", icon: ArrowRight, ariaLabel: "See all items" },
  buildPath: { label: "Build my path", icon: Sparkles, ariaLabel: "Build a learning path with AI" },
  signOut: { label: "Sign out", icon: LogOut, ariaLabel: "Sign out of BuddyForStudy" },
  search: { label: "Search", icon: Search, ariaLabel: "Search BuddyForStudy" },
} as const satisfies Record<string, { label: string; icon: LucideIcon | undefined; ariaLabel: string }>;

export type CourseActionState = "not-enrolled-free" | "not-enrolled-paid" | "not-started" | "in-progress" | "completed";
export type CanonicalCourseIntent = "enrollFree" | "enrollPaid" | "start" | "continue" | "review";

export function getCourseIntent(state: CourseActionState): CanonicalCourseIntent {
  switch (state) {
    case "not-enrolled-free": return "enrollFree";
    case "not-enrolled-paid": return "enrollPaid";
    case "not-started": return "start";
    case "in-progress": return "continue";
    case "completed": return "review";
  }
}

export function getCourseActionState({
  enrolled,
  completed,
  progressPercentage,
  paid,
}: {
  enrolled: boolean;
  completed: boolean;
  progressPercentage: number;
  paid: boolean;
}): CourseActionState {
  if (!enrolled) return paid ? "not-enrolled-paid" : "not-enrolled-free";
  if (completed || progressPercentage >= 100) return "completed";
  if (progressPercentage > 0) return "in-progress";
  return "not-started";
}

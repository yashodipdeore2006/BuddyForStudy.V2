const encodeRouteSegment = (value: string, label: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    throw new Error(`A valid ${label} is required to build a route.`);
  }
  return encodeURIComponent(normalized);
};

export const routes = {
  home: () => "/home",
  explore: () => "/explore",
  myLearning: () => "/my-learning",
  saved: () => "/saved",
  course: (id: string) => `/courses/${encodeRouteSegment(id, "course id")}`,
  roadmap: (id: string) => `/courses/${encodeRouteSegment(id, "course id")}/roadmap`,
  learn: (id: string, lessonId?: string | null) =>
    lessonId
      ? `/learn/${encodeRouteSegment(id, "course id")}/${encodeRouteSegment(lessonId, "lesson id")}`
      : `/learn/${encodeRouteSegment(id, "course id")}`,
  login: () => "/login",
  profile: () => "/profile",
  settings: () => "/settings",
} as const;

export type CanonicalRouteName = keyof typeof routes;

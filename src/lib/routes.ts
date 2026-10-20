const encodeRouteSegment = (value: string, label: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    throw new Error(`A valid ${label} is required to build a route.`);
  }
  return encodeURIComponent(normalized);
};

export const routes = {
  landing: () => "/",
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
  playlist: (id: string) => `/playlists/${encodeRouteSegment(id, "playlist id")}`,
  savedRoadmap: (id: string) => `/roadmaps/${encodeRouteSegment(id, "roadmap id")}`,
  login: () => "/login",
  register: () => "/register",
  verifyEmail: () => "/verify-email",
  verifyLogin: () => "/verify-login",
  forgotPassword: () => "/forgot-password",
  pricing: () => "/pricing",
  billing: () => "/billing",
  notifications: () => "/notifications",
  profile: () => "/profile",
  settings: () => "/settings",
} as const;

export type CanonicalRouteName = keyof typeof routes;

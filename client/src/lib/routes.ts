const encodeRouteSegment = (value: string, label: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    throw new Error(`A valid ${label} is required to build a route.`);
  }
  return encodeURIComponent(normalized);
};

export const routes = {
  landing: () => "/",
  about: () => "/about",
  contact: () => "/contact",
  faq: () => "/faq",
  adminHome: () => "/admin",
  adminSettings: () => "/admin/settings",
  adminUsers: () => "/admin/users",
  adminCourses: () => "/admin/courses",
  adminAnalytics: () => "/admin/analytics",
  home: () => "/home",
  explore: () => "/explore",
  buildPath: () => "/explore?build=1",
  myLearning: () => "/my-learning",
  saved: () => "/saved",
  course: (id: string) => `/courses/${encodeRouteSegment(id, "course id")}`,
  roadmap: (id: string) => `/courses/${encodeRouteSegment(id, "course id")}/roadmap`,
  learn: (id: string, lessonId?: string | null) => {
    const normalizedLessonId = String(lessonId ?? "").trim();
    const coursePath = `/learn/${encodeRouteSegment(id, "course id")}`;
    // Missing or malformed optional lesson IDs should open the course player,
    // not crash cards when legacy course data contains the string "undefined".
    if (!normalizedLessonId || normalizedLessonId.toLowerCase() === "undefined" || normalizedLessonId.toLowerCase() === "null") {
      return coursePath;
    }
    return coursePath + `/${encodeRouteSegment(normalizedLessonId, "lesson id")}`;
  },
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

/**
 * Resolve notification-provided destinations against the canonical route map.
 * Unknown, malformed, external and legacy destinations are never navigated to.
 */
export function resolveNotificationRoute(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(value, "https://buddyforstudy.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://buddyforstudy.invalid") return null;

  const path = url.pathname;
  const query = url.search;
  const hash = url.hash;
  if (path === "/") return routes.landing();
  if (path === "/home" || path === "/dashboard") return routes.home();
  if (path === "/explore" || path === "/courses") return routes.explore() + query;
  if (path === "/my-learning" || path === "/my-courses") return routes.myLearning();
  if (path === "/saved" || path === "/saved-courses") return routes.saved();
  if (path === "/login") return routes.login();
  if (path === "/register") return routes.register();
  if (path === "/verify-email") return routes.verifyEmail();
  if (path === "/verify-login") return routes.verifyLogin();
  if (path === "/forgot-password") return routes.forgotPassword();
  if (path === "/pricing") return routes.pricing();
  if (path === "/billing") return routes.billing();
  if (path === "/profile") return routes.profile();
  if (path === "/settings") return routes.settings() + hash;
  if (path === "/notifications") return routes.notifications();

  const segments = path.split("/").filter(Boolean);
  try {
    if (segments.length === 2 && segments[0] === "courses") {
      return routes.course(decodeURIComponent(segments[1]));
    }
    if (segments.length === 3 && segments[0] === "courses" && segments[2] === "roadmap") {
      return routes.roadmap(decodeURIComponent(segments[1]));
    }
    if (segments.length === 2 && segments[0] === "learn") {
      return routes.learn(decodeURIComponent(segments[1]));
    }
    if (segments.length === 3 && segments[0] === "learn") {
      return routes.learn(decodeURIComponent(segments[1]), decodeURIComponent(segments[2]));
    }
    if (segments.length === 2 && segments[0] === "playlists") {
      return routes.playlist(decodeURIComponent(segments[1]));
    }
    if (segments.length === 2 && segments[0] === "roadmaps") {
      return routes.savedRoadmap(decodeURIComponent(segments[1]));
    }
  } catch {
    return null;
  }
  return null;
}

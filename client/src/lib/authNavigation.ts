export type CourseAccessPreference = "subscription" | "individual";
export type EnrollmentResumeIntent = {
  type: "enroll" | "checkout";
  courseId: string;
  accessPreference?: CourseAccessPreference;
};
export type AuthReturnLocation = { pathname: string; search?: string; hash?: string };
export type AuthNavigationState = { from?: AuthReturnLocation; resumeIntent?: EnrollmentResumeIntent };

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function safeLocation(value: unknown): AuthReturnLocation | undefined {
  if (typeof value === "string") value = { pathname: value };
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const pathname = typeof candidate.pathname === "string" ? candidate.pathname : "";
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\") ||
      pathname.length > 1024 || hasControlCharacters(pathname)) return undefined;
  let parsed: URL;
  try { parsed = new URL(pathname, "https://buddyforstudy.invalid"); }
  catch { return undefined; }
  if (parsed.origin !== "https://buddyforstudy.invalid") return undefined;
  const search = typeof candidate.search === "string" && candidate.search.startsWith("?") &&
    candidate.search.length <= 2048 && !hasControlCharacters(candidate.search) ? candidate.search : "";
  const hash = typeof candidate.hash === "string" && candidate.hash.startsWith("#") &&
    candidate.hash.length <= 512 && !hasControlCharacters(candidate.hash) ? candidate.hash : "";
  return { pathname: parsed.pathname, ...(search ? { search } : {}), ...(hash ? { hash } : {}) };
}

function safeResumeIntent(value: unknown): EnrollmentResumeIntent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const type = candidate.type;
  const courseId = typeof candidate.courseId === "string" ? candidate.courseId.trim() : "";
  if ((type !== "enroll" && type !== "checkout") || !courseId || courseId.length > 128 ||
      (/[\\/]/.test(courseId) || hasControlCharacters(courseId))) return undefined;
  const accessPreference = candidate.accessPreference;
  return { type, courseId, ...(accessPreference === "subscription" || accessPreference === "individual" ? { accessPreference } : {}) };
}

export function readAuthNavigationState(value: unknown): AuthNavigationState {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const from = safeLocation(candidate.from);
  const resumeIntent = safeResumeIntent(candidate.resumeIntent);
  return { ...(from ? { from } : {}), ...(resumeIntent ? { resumeIntent } : {}) };
}

export function createAuthNavigationState(
  currentLocation: Pick<AuthReturnLocation, "pathname" | "search" | "hash">,
  resumeIntent: EnrollmentResumeIntent,
): AuthNavigationState {
  const from = safeLocation(currentLocation);
  const safeIntent = safeResumeIntent(resumeIntent);
  return { ...(from ? { from } : {}), ...(safeIntent ? { resumeIntent: safeIntent } : {}) };
}

export function getAuthDestination(
  state: AuthNavigationState,
  fallback: string,
): { to: string; state?: { resumeIntent: EnrollmentResumeIntent } } {
  const location = state.from || safeLocation(fallback);
  const to = location ? location.pathname + (location.search || "") + (location.hash || "") : "/";
  return { to, ...(state.resumeIntent ? { state: { resumeIntent: state.resumeIntent } } : {}) };
}

export function toAuthNavigationState(
  state: AuthNavigationState,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...extra, ...(state.from ? { from: state.from } : {}), ...(state.resumeIntent ? { resumeIntent: state.resumeIntent } : {}) };
}

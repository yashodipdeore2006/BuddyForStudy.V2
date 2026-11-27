export type CourseAccessPreference = "subscription" | "individual";
export type EnrollmentResumeIntent = {
  type: "enroll" | "checkout";
  courseId: string;
  accessPreference?: CourseAccessPreference;
};
export type AuthReturnLocation = { pathname: string; search?: string; hash?: string };
export type AuthResumeContext = {
  type: "ai-roadmap";
  topic: string;
  resourceLanguages: string[];
};
export type AuthNavigationState = {
  from?: AuthReturnLocation;
  resumeIntent?: EnrollmentResumeIntent;
  resumeContext?: AuthResumeContext;
};

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

function safeResumeContext(value: unknown): AuthResumeContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "ai-roadmap") return undefined;
  const topic = typeof candidate.topic === "string" ? candidate.topic.trim() : "";
  if (!topic || topic.length > 500 || hasControlCharacters(topic)) return undefined;
  const resourceLanguages = Array.isArray(candidate.resourceLanguages)
    ? [...new Set(candidate.resourceLanguages.filter((item): item is string =>
        typeof item === "string" && /^[a-z]{2,3}$/i.test(item)
      ))].slice(0, 4)
    : [];
  return { type: "ai-roadmap", topic, resourceLanguages };
}

export function readAuthNavigationState(value: unknown): AuthNavigationState {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const from = safeLocation(candidate.from);
  const resumeIntent = safeResumeIntent(candidate.resumeIntent);
  const resumeContext = safeResumeContext(candidate.resumeContext);
  return {
    ...(from ? { from } : {}),
    ...(resumeIntent ? { resumeIntent } : {}),
    ...(resumeContext ? { resumeContext } : {}),
  };
}

export function createAuthNavigationState(
  currentLocation: Pick<AuthReturnLocation, "pathname" | "search" | "hash">,
  resumeIntent?: EnrollmentResumeIntent,
  resumeContext?: AuthResumeContext,
): AuthNavigationState {
  const from = safeLocation(currentLocation);
  const safeIntent = safeResumeIntent(resumeIntent);
  const safeContext = safeResumeContext(resumeContext);
  return {
    ...(from ? { from } : {}),
    ...(safeIntent ? { resumeIntent: safeIntent } : {}),
    ...(safeContext ? { resumeContext: safeContext } : {}),
  };
}

export function getAuthDestination(
  state: AuthNavigationState,
  fallback: string,
): { to: string; state?: { resumeIntent?: EnrollmentResumeIntent; resumeContext?: AuthResumeContext } } {
  const location = state.from || safeLocation(fallback);
  const to = location ? location.pathname + (location.search || "") + (location.hash || "") : "/";
  return {
    to,
    ...(state.resumeIntent || state.resumeContext
      ? { state: {
          ...(state.resumeIntent ? { resumeIntent: state.resumeIntent } : {}),
          ...(state.resumeContext ? { resumeContext: state.resumeContext } : {}),
        } }
      : {}),
  };
}

export function toAuthNavigationState(
  state: AuthNavigationState,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    ...(state.from ? { from: state.from } : {}),
    ...(state.resumeIntent ? { resumeIntent: state.resumeIntent } : {}),
    ...(state.resumeContext ? { resumeContext: state.resumeContext } : {}),
  };
}

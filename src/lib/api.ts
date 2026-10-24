const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");


type CachedGet = { expiresAt: number; data: unknown };
const GET_CACHE_TTL_MS = 5000;
const getResponseCache = new Map<string, CachedGet>();
const getInFlight = new Map<string, Promise<unknown>>();

if (typeof window !== "undefined") {
  window.addEventListener("bfs:entitlements-updated", () => {
    getResponseCache.clear();
    getInFlight.clear();
  });
}

function cacheKey(path: string, token: string | null) {
  return `${token ? 'authenticated' : 'public'}:${token || ''}:${path}`;
}

function invalidateRelatedGetCache(path: string) {
  const prefixes = path.startsWith('/api/saved-courses')
    ? ['/api/saved-courses']
    : path.startsWith('/api/enrollments')
      ? ['/api/enrollments']
      : path.startsWith('/api/reviews')
        ? ['/api/reviews', '/api/courses']
        : path.startsWith('/api/courses')
          ? ['/api/courses', '/api/reviews']
          : path.startsWith('/api/billing') || path.startsWith('/api/payments')
            ? ['/api/billing', '/api/ai/usage']
            : [];
  if (!prefixes.length) return;
  for (const key of getResponseCache.keys()) {
    if (prefixes.some((prefix) => key.includes(`:${prefix}`) || key.endsWith(prefix))) getResponseCache.delete(key);
  }
}

export function getToken() {
  return localStorage.getItem("bfs_token");
}

export function setAuth(token: string, user: unknown) {
  localStorage.setItem("bfs_token", token);
  localStorage.setItem("bfs_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("bfs_token");
  localStorage.removeItem("bfs_user");
}

const AUTH_ENTRY_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-login",
  "/api/auth/verify-email",
  "/api/auth/google",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-otp",
];

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiFetchOptions = RequestInit & { showFeatureUpgrade?: boolean };
// API response shapes vary by endpoint; callers can provide a stricter generic when needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

export async function apiFetch<T = ApiResponse>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { showFeatureUpgrade = false, ...requestOptions } = options;
  const token = getToken();
  const method = (requestOptions.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const key = cacheKey(path, token);

  // Deduplicate repeated status/list requests from multiple cards and components.
  // Cache only safe GET responses for a very short period; mutations invalidate
  // related entries so save/enroll actions remain immediately consistent.
  if (isGet) {
    const cached = getResponseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
    if (cached) getResponseCache.delete(key);
    const pending = getInFlight.get(key);
    if (pending) return pending as Promise<T>;
  } else {
    invalidateRelatedGetCache(path);
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...requestOptions,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(requestOptions.headers || {}),
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('The request was cancelled or took too long. Please try again.');
      }
      throw new Error(`We couldn't connect to BuddyForStudy. Check your internet connection and try again. If the problem continues, contact support.`);
    }

    const data = await response.json().catch(() => ({}));
    const isAuthEntry = AUTH_ENTRY_PATHS.some((entry) => path.startsWith(entry));

    // Clear expired/rejected sessions without treating failed login attempts as logout.
    if (response.status === 401 && token && !isAuthEntry) {
      clearAuth();
      getResponseCache.clear();
      window.dispatchEvent(new Event("bfs:session-expired"));
    }

    if (!response.ok || data.success === false) {
      const statusMessages: Record<number, string> = {
        400: "Some of the information is invalid. Please review it and try again.",
        401: "Your session has expired. Please sign in again.",
        403: "You don't have permission to do that.",
        404: "We couldn't find what you requested. It may have been moved or removed.",
        408: "The request took too long. Please try again.",
        409: "This conflicts with an existing record. Refresh the page and try again.",
        413: "This file or request is too large. Please use a smaller file.",
        422: "We couldn't process that information. Please check the fields and try again.",
        429: "You're making requests too quickly. Please wait a moment before trying again.",
        500: "Something went wrong on our side. Please try again shortly.",
        502: "The service is temporarily unavailable. Please try again shortly.",
        503: "The service is temporarily busy. Please try again shortly.",
        504: "The request timed out. Please try again."
      };
      const serverMessage = typeof data.message === 'string' ? data.message.trim() : '';
      const safeServerMessage = serverMessage && !/internal server error|exception|stack trace|mongo(?:ose|db)?error|econnrefused|undefined|null/i.test(serverMessage)
        ? serverMessage
        : '';

      // Open the shared upgrade flow only for explicit entitlement denials and configured plan quotas.
      // Other 403 responses (role permissions, inactive resources, payment conflicts) remain normal errors.
      const entitlementDetails = data.errors && typeof data.errors === 'object' ? data.errors : null;
      const gatedFeature = typeof entitlementDetails?.feature === 'string' ? entitlementDetails.feature : '';
      const isEntitlementDenial = response.status === 403 &&
        Boolean(gatedFeature) &&
        /not included in your current plan|upgrade (?:your plan|to use)|purchase this course to continue/i.test(serverMessage);
      const limitKey = typeof entitlementDetails?.limitKey === 'string' ? entitlementDetails.limitKey : '';
      const quotaFeature = response.status === 429 && limitKey === 'youtube_discovery_courses_per_month'
        ? 'priority_recommendations'
        : response.status === 429 && limitKey === 'ai_curated_courses_per_month'
          ? 'priority_recommendations'
          : '';
      const aiQuotaFeature = response.status === 429 &&
        entitlementDetails?.feature === "advanced_ai_paths" &&
        ["advanced_ai_insights_per_month", "advanced_ai_questions_per_month"].includes(String(entitlementDetails?.limitKey || ""))
        ? "advanced_ai_paths"
        : "";
      const isPlanLimitDenial = (Boolean(quotaFeature) && /plan(?:'s|’s) monthly course allowance/i.test(serverMessage)) || Boolean(aiQuotaFeature);
      const isPlanGate = isEntitlementDenial || isPlanLimitDenial;
      if (showFeatureUpgrade && isPlanGate) {
        window.dispatchEvent(new CustomEvent("bfs:feature-gated", {
          detail: {
            feature: gatedFeature || quotaFeature || aiQuotaFeature,
            currentPlan: typeof entitlementDetails?.plan === 'string' ? entitlementDetails.plan : undefined,
            message: safeServerMessage || serverMessage,
            limit: isPlanLimitDenial ? entitlementDetails.limit : undefined,
            used: isPlanLimitDenial ? entitlementDetails.used : undefined,
          },
        }));
      }

      throw new ApiError(safeServerMessage || statusMessages[response.status] || "We couldn't complete that request. Please try again.", response.status);
    }

    if (isGet) getResponseCache.set(key, { data, expiresAt: Date.now() + GET_CACHE_TTL_MS });
    return data as T;
  })();

  if (isGet) getInFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (isGet && getInFlight.get(key) === request) getInFlight.delete(key);
  }
}

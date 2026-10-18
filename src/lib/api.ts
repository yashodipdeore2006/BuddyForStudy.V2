const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");


type CachedGet = { expiresAt: number; data: any };
const GET_CACHE_TTL_MS = 5000;
const getResponseCache = new Map<string, CachedGet>();
const getInFlight = new Map<string, Promise<any>>();

function cacheKey(path: string, token: string | null) {
  return `${token ? 'authenticated' : 'public'}:${token || ''}:${path}`;
}

function invalidateRelatedGetCache(path: string) {
  const prefixes = path.startsWith('/api/saved-courses')
    ? ['/api/saved-courses']
    : path.startsWith('/api/enrollments')
      ? ['/api/enrollments']
      : path.startsWith('/api/reviews')
        ? ['/api/reviews']
        : path.startsWith('/api/courses')
          ? ['/api/courses', '/api/reviews']
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

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const key = cacheKey(path, token);

  // Deduplicate repeated status/list requests from multiple cards and components.
  // Cache only safe GET responses for a very short period; mutations invalidate
  // related entries so save/enroll actions remain immediately consistent.
  if (isGet) {
    const cached = getResponseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) getResponseCache.delete(key);
    const pending = getInFlight.get(key);
    if (pending) return pending;
  } else {
    invalidateRelatedGetCache(path);
  }

  const request = (async () => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    const isAuthEntry = AUTH_ENTRY_PATHS.some((entry) => path.startsWith(entry));

    // Clear expired/rejected sessions without treating failed login attempts as logout.
    if (response.status === 401 && token && !isAuthEntry) {
      clearAuth();
      getResponseCache.clear();
      window.dispatchEvent(new Event("bfs:session-expired"));
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || (response.status === 429
        ? "Too many requests. Please wait a moment and try again."
        : "Request failed"));
    }

    if (isGet) getResponseCache.set(key, { data, expiresAt: Date.now() + GET_CACHE_TTL_MS });
    return data;
  })();

  if (isGet) getInFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (isGet && getInFlight.get(key) === request) getInFlight.delete(key);
  }
}

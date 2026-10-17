const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

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
    window.dispatchEvent(new Event("bfs:session-expired"));
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}
